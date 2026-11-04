const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const app = express();
app.use(cors());
app.use(express.json());  

// Serve the frontend (plain HTML/CSS/JS) from the same server and domain
const path = require('path');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

const PORT = process.env.PORT || 3000

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error("Database connection failed:", err.message);
  } else {
    console.log("Connected to the customer database successfully!");
  }
});

app.get('/', (req, res) => {
    res.send('Server is running and connected!');
});

app.post('/api/customer/signup', async (req, res) => {
  try{
      const { full_name, email, password } = req.body;

      if(!full_name || !email || !password) {
        return res.status(400).json({error: 'Please provide full name, email, and password'});
      }

      const existingUser = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email is already registered.' });
      }

      const saltRounds = 10;
      const password_hash = await bcrypt.hash(password, saltRounds);

      const newCustomer = await pool.query(
        `INSERT INTO customers (full_name, email, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, full_name, email, created_at`,
        [full_name, email, password_hash]
      );

      res.status(201).json({
        message: 'Customer registered successfully!',
        customer: newCustomer.rows[0]
      });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error during sign up.' });
    }
});

app.post('/api/customer/login', async (req, res) => {
  console.log("Backend received body:", req.body);
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide both email and password' });
    }

    const customerResult = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
    if (customerResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const customer = customerResult.rows[0];

    if (!customer.password_hash) {
      return res.status(400).json({ error: 'This account uses Google sign-in. Please click "Continue with Google".' });
    }

    const isPasswordValid = await bcrypt.compare(password, customer.password_hash);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    res.status(200).json({
      message: 'Login successful!',
      customer: {
        id: customer.id,
        full_name: customer.full_name,
        email: customer.email
      }
    });

  } catch (err) {
    console.error(err.message)
    res.status(500).json({ error: 'Server error during login.' });
  }
})

app.post('/api/employee/login', async (req, res) => {  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide both email and password' });
    }
    const employeeResult = await pool.query('SELECT * FROM employees WHERE lower(email) = lower($1)', [String(email).trim()]);
    if (employeeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }
    const employee = employeeResult.rows[0];

    const isPasswordValid = await bcrypt.compare(password, employee.password_hash);
   
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    res.status(200).json({
      message: 'Employee Login successful!',
      token: signToken({ id: String(employee.id), exp: Date.now() + TOKEN_TTL_MS }),
      employee: {
        id: employee.id,
        full_name: employee.full_name,
        email: employee.email
      }
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// ---------- ADMIN: employee accounts ----------
// Set ADMIN_KEY in your .env and in the Render environment variables.
const ADMIN_KEY = process.env.ADMIN_KEY || '';

function requireAdmin(req, res, next) {
  if (!ADMIN_KEY) {
    return res.status(503).json({ error: 'ADMIN_KEY is not set on the server.' });
  }
  const given = Buffer.from(String(req.get('x-admin-key') || ''));
  const real = Buffer.from(ADMIN_KEY);
  if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) {
    return res.status(401).json({ error: 'Wrong admin key.' });
  }
  next();
}

pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()')
  .catch(err => console.error('Could not ensure employees.created_at:', err.message));

app.get('/api/admin/employees', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, created_at FROM employees ORDER BY created_at ASC, id ASC'
    );
    res.json({ employees: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while loading employees.' });
  }
});

app.post('/api/admin/employees', requireAdmin, async (req, res) => {
  try {
    const full_name = String(req.body.full_name || '').trim().replace(/\s+/g, ' ');
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (full_name.length < 2 || full_name.length > 60) {
      return res.status(400).json({ error: 'Full name must be 2-60 characters.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await pool.query('SELECT 1 FROM employees WHERE lower(email) = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'That email is already registered.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const created = await pool.query(
      `INSERT INTO employees (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email, created_at`,
      [full_name, email, password_hash]
    );
    res.status(201).json({ message: 'Employee added.', employee: created.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while adding the employee.' });
  }
});

app.delete('/api/admin/employees/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    res.json({ message: 'Employee removed.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while removing the employee.' });
  }
});


const TOKEN_SECRET = process.env.SESSION_SECRET || ADMIN_KEY || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifyToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return payload && payload.exp > Date.now() ? payload : null;
  } catch (_) {
    return null;
  }
}

async function requireEmployee(req, res, next) {
  try {
    const payload = verifyToken((req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    if (!payload) return res.status(401).json({ error: 'Please log in again.' });
    // Read the name from the database so a removed employee can no longer act.
    const found = await pool.query('SELECT id, full_name FROM employees WHERE id::text = $1', [String(payload.id)]);
    if (found.rows.length === 0) return res.status(401).json({ error: 'This employee account no longer exists.' });
    req.employee = found.rows[0];
    next();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while checking your login.' });
  }
}

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        contact TEXT NOT NULL,
        service TEXT NOT NULL,
        weight_kg NUMERIC(6,1) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        basket_no INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending'
          CHECK (status IN ('Pending','Confirmed','Completed','Cancelled')),
        pending_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        confirmed_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        cancelled_at TIMESTAMPTZ,
        added_by_id TEXT, added_by_name TEXT NOT NULL,
        confirmed_by_id TEXT, confirmed_by_name TEXT,
        completed_by_id TEXT, completed_by_name TEXT,
        cancelled_by_id TEXT, cancelled_by_name TEXT
      )`);
    
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS orders_open_basket
    ON orders (basket_no) WHERE status IN ('Pending','Confirmed')`);
  } catch (err) {
    console.error('Could not ensure the orders table:', err.message);
  }
})();

const ORDER_COLS = `id, 'FK-' || lpad(id::text, 3, '0') AS order_code, customer_name, contact, service,
  weight_kg, price, basket_no, status, pending_at, confirmed_at, completed_at, cancelled_at,
  added_by_name, confirmed_by_name, completed_by_name, cancelled_by_name`;

function shapeOrder(o, { admin = false } = {}) {
  const out = {
    id: o.id,
    order_code: o.order_code,
    customer_name: o.customer_name,
    service: o.service,
    weight_kg: Number(o.weight_kg),
    price: Number(o.price),
    basket_no: o.basket_no,
    status: o.status,
    pending_at: o.pending_at,
    confirmed_at: o.confirmed_at,
    completed_at: o.completed_at,
    cancelled_at: o.cancelled_at,
    added_by: o.added_by_name,
    confirmed_by: o.confirmed_by_name,
    completed_by: o.completed_by_name,
    cancelled_by: o.cancelled_by_name
  };
  if (!admin) out.contact = o.contact;   
  return out;
}


app.get('/api/employee/orders', requireEmployee, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${ORDER_COLS} FROM orders
       WHERE status IN ('Pending','Confirmed')
          OR COALESCE(completed_at, cancelled_at) >= NOW() - INTERVAL '3 days'
       ORDER BY pending_at DESC, id DESC LIMIT 500`
    );
    res.json({ orders: result.rows.map(o => shapeOrder(o)) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while loading orders.' });
  }
});


app.post('/api/employee/orders', requireEmployee, async (req, res) => {
  try {
    const customer_name = String(req.body.customer_name || '').trim().replace(/\s+/g, ' ');
    const contact = String(req.body.contact || '').trim();
    const service = String(req.body.service || '').trim();
    const weight = Number(req.body.weight_kg);
    const price = Number(req.body.price);
    const basket = Number(req.body.basket_no);

    if (customer_name.length < 2 || customer_name.length > 60) {
      return res.status(400).json({ error: 'Customer name must be 2-60 characters.' });
    }
    if (contact.length < 3 || contact.length > 30) {
      return res.status(400).json({ error: 'Please enter a valid contact number.' });
    }
    if (!service || service.length > 60) {
      return res.status(400).json({ error: 'Please choose a service.' });
    }
    if (!Number.isFinite(weight) || weight <= 0 || weight > 1000) {
      return res.status(400).json({ error: 'Weight must be above 0 kg.' });
    }
    if (!Number.isFinite(price) || price < 0 || price > 1000000) {
      return res.status(400).json({ error: 'Please enter a valid price.' });
    }
    if (!Number.isInteger(basket) || basket < 1 || basket > 99999) {
      return res.status(400).json({ error: 'Basket number must be a whole number of 1 or more.' });
    }

  
    const basketInUse = await pool.query(
      `SELECT 1 FROM orders WHERE basket_no = $1 AND status IN ('Pending','Confirmed')`, [basket]);
    if (basketInUse.rows.length > 0) {
      return res.status(400).json({ error: 'This basket number is already in use by an open order.' });
    }

    const created = await pool.query(
      `INSERT INTO orders (customer_name, contact, service, weight_kg, price, basket_no, added_by_id, added_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${ORDER_COLS}`,
      [customer_name, contact, service, Math.round(weight * 10) / 10, Math.round(price * 100) / 100,
       basket, String(req.employee.id), req.employee.full_name]
    );
    res.status(201).json({ message: 'Order added.', order: shapeOrder(created.rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'This basket number is already in use by an open order.' });
    }
    console.error(err.message);
    res.status(500).json({ error: 'Server error while adding the order.' });
  }
});


function orderTransition(fromStatuses, toStatus, col, wrongStateMsg) {
  return async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid order.' });
      const result = await pool.query(
        `UPDATE orders
         SET status = $2, ${col}_at = NOW(), ${col}_by_id = $3, ${col}_by_name = $4
         WHERE id = $1 AND status = ANY($5::text[])
         RETURNING ${ORDER_COLS}`,
        [id, toStatus, String(req.employee.id), req.employee.full_name, fromStatuses]
      );
      if (result.rows.length === 0) {
        const existing = await pool.query('SELECT status FROM orders WHERE id = $1', [id]);
        if (existing.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });
        return res.status(409).json({ error: `${wrongStateMsg} (this order is already ${existing.rows[0].status}).` });
      }
      res.json({ order: shapeOrder(result.rows[0]) });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Server error while updating the order.' });
    }
  };
}
app.patch('/api/employee/orders/:id/confirm', requireEmployee,
  orderTransition(['Pending'], 'Confirmed', 'confirmed', 'Only a Pending order can be confirmed'));
app.patch('/api/employee/orders/:id/complete', requireEmployee,
  orderTransition(['Confirmed'], 'Completed', 'completed', 'Only a Confirmed order can be completed'));

app.delete('/api/employee/orders/:id', requireEmployee,
  orderTransition(['Pending', 'Confirmed'], 'Cancelled', 'cancelled', 'Only an open order can be cancelled'));


app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${ORDER_COLS} FROM orders ORDER BY pending_at DESC, id DESC LIMIT 5000`
    );
    res.json({ orders: result.rows.map(o => shapeOrder(o, { admin: true })) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while loading orders.' });
  }
});


const SERVICE_UNITS = ['per kilo', 'per piece'];

(async () => {
  try {
    const existed = (await pool.query(`SELECT to_regclass('services') AS t`)).rows[0].t;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        unit TEXT NOT NULL CHECK (unit IN ('per kilo','per piece')),
        price NUMERIC(10,2) NOT NULL CHECK (price > 0),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS services_name_unique ON services (lower(name))');
    if (!existed) {  
      await pool.query(
        `INSERT INTO services (name, unit, price, active) VALUES
         ('Wash and fold', 'per kilo', 65, TRUE),
         ('Wash, dry and fold', 'per kilo', 85, TRUE),
         ('Dry cleaning (suit)', 'per piece', 350, TRUE),
         ('Comforter / bedsheet', 'per piece', 250, TRUE),
         ('Ironing only', 'per kilo', 50, FALSE)`
      );
    }
  } catch (err) {
    console.error('Could not ensure the services table:', err.message);
  }
})();

const shapeService = s => ({ id: s.id, name: s.name, unit: s.unit, price: Number(s.price), active: s.active });

function readService(body) {
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const unit = String(body.unit || '');
  const price = Number(body.price);
  const active = body.active !== false;
  if (name.length < 2 || name.length > 60) return { error: 'Service name must be 2-60 characters.' };
  if (!SERVICE_UNITS.includes(unit)) return { error: 'Choose a valid unit.' };
  if (!Number.isFinite(price) || price <= 0 || price > 100000) {
    return { error: 'Price must be a number above 0 (max 100,000).' };
  }
  return { value: { name, unit, price: Math.round(price * 100) / 100, active } };
}

app.get('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, unit, price, active FROM services ORDER BY id ASC');
    res.json({ services: result.rows.map(shapeService) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while loading services.' });
  }
});

app.post('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    const parsed = readService(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { name, unit, price, active } = parsed.value;
    const created = await pool.query(
      'INSERT INTO services (name, unit, price, active) VALUES ($1, $2, $3, $4) RETURNING id, name, unit, price, active',
      [name, unit, price, active]
    );
    res.status(201).json({ service: shapeService(created.rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A service with that name already exists.' });
    console.error(err.message);
    res.status(500).json({ error: 'Server error while adding the service.' });
  }
});

app.put('/api/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid service.' });
    const parsed = readService(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { name, unit, price, active } = parsed.value;
    const updated = await pool.query(
      `UPDATE services SET name = $2, unit = $3, price = $4, active = $5
       WHERE id = $1 RETURNING id, name, unit, price, active`,
      [id, name, unit, price, active]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Service not found.' });
    res.json({ service: shapeService(updated.rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A service with that name already exists.' });
    console.error(err.message);
    res.status(500).json({ error: 'Server error while updating the service.' });
  }
});

app.delete('/api/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid service.' });
    const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Service not found.' });
    res.json({ message: 'Service removed.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while removing the service.' });
  }
});

app.post('/api/customer/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Please provide your email address.' });
    }

    const userResult = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with this email.' });
    }

    if (!userResult.rows[0].password_hash) {
      return res.status(400).json({ error: 'This account uses Google sign-in. Please click "Continue with Google".' });
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `UPDATE customers
       SET reset_token = $1, reset_token_expires = $2
       WHERE email = $3`,
      [otp, expiresAt, email]
    );

    // Render blocks SMTP ports, so the email is sent through Brevo's HTTPS API instead.
    if (!process.env.BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY is not set on the server.');
    }

    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: "Fresh 'N Klean Laundry Hub", email: process.env.EMAIL_USER },
        to: [{ email }],
        subject: 'Password Reset OTP - Laundry App',
        textContent: `Hello,\n\nYour One-Time Password (OTP) to reset your password is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request this, please ignore this email.`
      })
    });

    if (!emailResponse.ok) {
      const detail = await emailResponse.text();
      throw new Error(`Brevo API error ${emailResponse.status}: ${detail}`);
    }

    console.log(`OTP email successfully sent to ${email}`);

    res.json({ message: 'OTP sent successfully to your email!' });

  } catch (err) {
    console.error('Server error during forgot-password request:', err);
    res.status(500).json({ error: 'Server error while sending reset email. Please try again later.' });
  }
});

app.post('/api/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Please provide your email and the code.' });
    }

    const result = await pool.query(
      'SELECT reset_token, reset_token_expires FROM customers WHERE email = $1',
      [email]
    );

    const user = result.rows[0];
    const isValid =
      user &&
      user.reset_token &&
      user.reset_token === String(code).trim() &&
      user.reset_token_expires &&
      new Date(user.reset_token_expires) > new Date();

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired code.' });
    }

    res.json({ message: 'Code verified successfully!' });

  } catch (err) {
    console.error('Server error during verify-otp request:', err);
    res.status(500).json({ error: 'Server error while verifying the code. Please try again later.' });
  }
});

  app.post('/api/reset-password', async (req, res) => {
    try {
      const { email, code, password } = req.body;
      if (!email || !code || !password) {
        return res.status(400).json({ error: 'Missing email, code or new password.' });
      }
      const result = await pool.query(
        'SELECT reset_token, reset_token_expires FROM customers WHERE email = $1', [email]);
      const user = result.rows[0];
      const ok = user && user.reset_token &&
        user.reset_token === String(code).trim() &&
        user.reset_token_expires && new Date(user.reset_token_expires) > new Date();
      if (!ok) return res.status(400).json({ error: 'Invalid or expired code.' });

      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE customers SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL
        WHERE email = $2`, [hash, email]);
      res.json({ message: 'Password updated successfully!' });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Server error while resetting the password.' });
    }
  });

app.post('/api/customer/google-login', async (req, res) => {
  try {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Missing token.' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user?.email) {
      return res.status(401).json({ error: 'Invalid Google session.' });
    }

    const u = data.user;
    const email = u.email.toLowerCase();
    const full_name =
      u.user_metadata?.full_name || u.user_metadata?.name || email.split('@')[0];

    const existing = await pool.query(
      'SELECT id, full_name, email FROM customers WHERE lower(email) = $1', [email]
    );

    let customer;
    if (existing.rows.length > 0) {
      customer = existing.rows[0];
      await pool.query(
        'UPDATE customers SET supabase_user_id = $1 WHERE id = $2 AND supabase_user_id IS NULL',
        [u.id, customer.id]
      );
    } else {
      const created = await pool.query(
        `INSERT INTO customers (full_name, email, password_hash, auth_provider, supabase_user_id)
         VALUES ($1, $2, NULL, 'google', $3)
         RETURNING id, full_name, email`,
        [full_name, email, u.id]
      );
      customer = created.rows[0];
    }

    res.json({ message: 'Login successful!', customer });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error during Google login.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});