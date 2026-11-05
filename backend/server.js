const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  const hasBody = Boolean(req.headers['transfer-encoding']) || Number(req.headers['content-length']) > 0;
  if (hasBody && !req.is('application/json')) {
    return res.status(415).json({ error: 'API requests must use application/json.' });
  }
  next();
});
app.use(express.json({ limit: '64kb' }));

const path = require('path');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('/', (req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

const PORT = process.env.PORT || 3000

function isValidContactNumber(value) {
  const phone = String(value || '').trim();
  const digits = phone.replace(/\D/g, '');
  return /^\+?[0-9\s()-]+$/.test(phone) && digits.length >= 10 && digits.length <= 13;
}

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error("Database connection failed:", err.message);
  } else {
    let host = 'unknown';
    try { host = new URL(process.env.DATABASE_URL).host; } catch (_) { host = process.env.DB_HOST || 'localhost'; }
    console.log('Connected to the database successfully! Host: ' + host);
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
        customer: newCustomer.rows[0],
        token: signToken({ id: String(newCustomer.rows[0].id), role: 'customer', exp: Date.now() + TOKEN_TTL_MS })
      });

    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server error during sign up.' });
    }
});

app.post('/api/customer/login', async (req, res) => {
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
      token: signToken({ id: String(customer.id), role: 'customer', exp: Date.now() + TOKEN_TTL_MS }),
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
      token: signToken({ id: String(employee.id), role: 'employee', exp: Date.now() + TOKEN_TTL_MS }),
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
    if (!payload || payload.role !== 'employee') return res.status(401).json({ error: 'Please log in again.' });
    await orderSchemaReady;

    const found = await pool.query('SELECT id, full_name FROM employees WHERE id::text = $1', [String(payload.id)]);
    if (found.rows.length === 0) return res.status(401).json({ error: 'This employee account no longer exists.' });
    req.employee = found.rows[0];
    next();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while checking your login.' });
  }
}

async function requireCustomer(req, res, next) {
  try {
    const payload = verifyToken((req.get('authorization') || '').replace(/^Bearer\s+/i, ''));
    if (!payload || payload.role !== 'customer') return res.status(401).json({ error: 'Please log in again.' });
    await orderSchemaReady;
    const found = await pool.query(
      'SELECT id, full_name, email, phone, address, pickup_instructions FROM customers WHERE id = $1',
      [payload.id]
    );
    if (found.rows.length === 0) return res.status(401).json({ error: 'This customer account no longer exists.' });
    req.customer = found.rows[0];
    next();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while checking your login.' });
  }
}

const orderSchemaReady = (async () => {
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
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_id INTEGER');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS unit TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2)');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(10,2) NOT NULL DEFAULT 0');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id INTEGER');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS edited_by_id TEXT');
    await pool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS edited_by_name TEXT');
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS orders_open_basket_without_schedule
      ON orders (basket_no) WHERE scheduled_at IS NULL AND status IN ('Pending','Confirmed')`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS orders_open_schedule_basket
      ON orders (scheduled_at, basket_no) WHERE scheduled_at IS NOT NULL AND status IN ('Pending','Confirmed')`);
    await pool.query('DROP INDEX IF EXISTS orders_open_basket');
    await pool.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT');
    await pool.query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS pickup_instructions TEXT');
    await pool.query('CREATE INDEX IF NOT EXISTS orders_customer_history ON orders (customer_id, pending_at DESC, id DESC)');
  } catch (err) {
    console.error('Could not ensure the orders table:', err.message);
  }
})();

async function logHistory(orderId, action, employee, changes) {
  try {
    await pool.query(
      'INSERT INTO order_history (order_id, action, employee_id, employee_name, changes) VALUES ($1, $2, $3, $4, $5)',
      [orderId, action, employee ? String(employee.id) : null, employee ? employee.full_name : 'System',
       changes ? JSON.stringify(changes) : null]
    );
  } catch (err) {
    console.error('Could not write order history:', err.message);
  }
}

function serverError(res, err, msg) {
  console.error(msg, '-', err.message);
  const body = { error: msg };
  if (process.env.NODE_ENV !== 'production') body.detail = err.message;
  res.status(500).json(body);
}

const ORDER_COLS = `id, 'FK-' || lpad(id::text, 3, '0') AS order_code, customer_name, contact, service,
  weight_kg, price, basket_no, status, pending_at, confirmed_at, completed_at, cancelled_at,
  added_by_name, confirmed_by_name, completed_by_name, cancelled_by_name, scheduled_at,
  fulfillment_type, service_id, unit, unit_price, amount_paid, customer_id, notes`;

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
    cancelled_by: o.cancelled_by_name,
    scheduled_at: o.scheduled_at,
    fulfillment_type: o.fulfillment_type,
    service_id: o.service_id,
    unit: o.unit,
    unit_price: o.unit_price == null ? null : Number(o.unit_price),
    amount_paid: o.amount_paid == null ? 0 : Number(o.amount_paid),
    notes: o.notes
  };
  if (!admin) out.contact = o.contact;   
  return out;
}

const DEFAULT_FAQS = [
  { question: 'How long does laundry service take?', answer: 'Standard wash, dry, and fold orders are usually ready within 24 to 48 hours. Timing may vary for bulky items or during busy periods.' },
  { question: 'Can I request a pickup?', answer: 'Yes. Choose Pickup when scheduling, then check that your phone number and pickup address in Settings are up to date.' },
  { question: 'Is there a minimum order?', answer: 'Minimums depend on the selected service. Contact the shop before scheduling bulky or special-care items.' },
  { question: 'How should I request special garment care?', answer: 'Add your care instructions when scheduling or contact the shop before your order so the team can confirm what is possible.' },
  { question: 'Where can I check my order status?', answer: 'Open History in the sidebar to review your scheduled and past orders.' }
];

let shopSettingsReady;

async function ensureShopSettings() {
  if (!shopSettingsReady) {
    shopSettingsReady = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS shop_settings (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          contact_phone TEXT NOT NULL,
          contact_email TEXT NOT NULL,
          address TEXT NOT NULL,
          faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
          emergency_status TEXT NOT NULL DEFAULT 'normal' CHECK (emergency_status IN ('normal','open','closed')),
          emergency_date DATE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(
        `INSERT INTO shop_settings (id, contact_phone, contact_email, address, faqs)
         VALUES (1, $1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        ['+63 969 454 3370', 'freshnklean@gmail.com', '123 Sampaguita Street, Quezon City, Metro Manila', JSON.stringify(DEFAULT_FAQS)]
      );
    })();
  }
  await shopSettingsReady;
}

async function getShopSettings() {
  await ensureShopSettings();
  const result = await pool.query(
    `SELECT contact_phone, contact_email, address, faqs, emergency_status, emergency_date::text AS emergency_date
     FROM shop_settings WHERE id = 1`
  );
  if (result.rows.length) return result.rows[0];
  throw new Error('Shop settings are missing after initialization.');
}

function shopStatus(settings) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const current = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const today = `${current.year}-${current.month}-${current.day}`;
  const sunday = current.weekday === 'Sun';
  const openMinutes = sunday ? 9 * 60 : 8 * 60;
  const closeMinutes = sunday ? 17 * 60 : 20 * 60;
  const currentMinutes = Number(current.hour) * 60 + Number(current.minute);
  const overrideDate = settings.emergency_date ? String(settings.emergency_date).slice(0, 10) : '';
  const emergencyStatus = overrideDate === today ? settings.emergency_status : 'normal';
  const isOpen = emergencyStatus === 'open' || (emergencyStatus !== 'closed' &&
    currentMinutes >= openMinutes && currentMinutes < closeMinutes);
  const formatHour = minutes => `${(Math.floor(minutes / 60) % 12) || 12}:00 ${minutes < 720 ? 'AM' : 'PM'}`;
  let detail;
  if (emergencyStatus === 'open') detail = 'Temporary opening for today';
  else if (emergencyStatus === 'closed') detail = 'Closed for today';
  else if (isOpen) detail = `Closes at ${formatHour(closeMinutes)}`;
  else if (currentMinutes < openMinutes) detail = `Opens at ${formatHour(openMinutes)}`;
  else detail = sunday ? 'Opens Monday at 8:00 AM' : 'Opens tomorrow at 8:00 AM';
  return {
    today,
    is_open: isOpen,
    emergency_status: emergencyStatus,
    detail,
    opens_at: sunday ? '9:00 AM' : '8:00 AM',
    closes_at: sunday ? '5:00 PM' : '8:00 PM'
  };
}

ensureShopSettings().catch(err => console.error('Could not ensure shop settings:', err.message));

app.get('/api/shop/settings', async (req, res) => {
  try {
    const settings = await getShopSettings();
    res.json({
      contact_phone: settings.contact_phone,
      contact_email: settings.contact_email,
      address: settings.address,
      faqs: settings.faqs,
      status: shopStatus(settings)
    });
  } catch (err) {
    return serverError(res, err, 'Server error while loading shop information.');
  }
});

app.patch('/api/employee/shop/settings', requireEmployee, async (req, res) => {
  try {
    const current = await getShopSettings();
    const phone = String(req.body.contact_phone ?? current.contact_phone).trim();
    const email = String(req.body.contact_email ?? current.contact_email).trim();
    const address = String(req.body.address ?? current.address).trim();
    const faqs = req.body.faqs ?? current.faqs;
    const hasEmergencyStatus = Object.prototype.hasOwnProperty.call(req.body, 'emergency_status');
    const emergencyStatus = hasEmergencyStatus ? String(req.body.emergency_status) : 'normal';
    if (phone.length < 3 || phone.length > 40 || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || address.length < 3 || address.length > 500) {
      return res.status(400).json({ error: 'Enter valid shop contact details and address.' });
    }
    if (!Array.isArray(faqs) || faqs.length > 20 || faqs.some(item =>
      !item || typeof item.question !== 'string' || typeof item.answer !== 'string' ||
      !item.question.trim() || !item.answer.trim() ||
      item.question.length > 200 || item.answer.length > 1000
    )) {
      return res.status(400).json({ error: 'FAQ entries need a question and answer (up to 20 entries).' });
    }
    if (hasEmergencyStatus && !['normal', 'open', 'closed'].includes(emergencyStatus)) {
      return res.status(400).json({ error: 'Choose normal hours, open now, or closed now.' });
    }
    const result = await pool.query(
      `UPDATE shop_settings
       SET contact_phone = $1, contact_email = $2, address = $3, faqs = $4,
           emergency_status = CASE WHEN $5 THEN $6 ELSE emergency_status END,
           emergency_date = CASE WHEN $5
             THEN CASE WHEN $6 = 'normal' THEN NULL ELSE (NOW() AT TIME ZONE 'Asia/Manila')::date END
             ELSE emergency_date END,
           updated_at = NOW()
       WHERE id = 1
       RETURNING contact_phone, contact_email, address, faqs, emergency_status, emergency_date::text AS emergency_date`,
      [phone, email, address, JSON.stringify(faqs), hasEmergencyStatus, emergencyStatus]
    );
    res.json({ settings: result.rows[0], status: shopStatus(result.rows[0]) });
  } catch (err) {
    return serverError(res, err, 'Server error while saving shop settings.');
  }
});

app.get('/api/customer/me', requireCustomer, (req, res) => {
  const c = req.customer;
  res.json({
    customer: {
      id: c.id,
      full_name: c.full_name,
      email: c.email,
      phone: c.phone || '',
      address: c.address || '',
      instructions: c.pickup_instructions || ''
    }
  });
});

app.put('/api/customer/me', requireCustomer, async (req, res) => {
  try {
    const full_name = String(req.body.full_name || '').trim().replace(/\s+/g, ' ');
    const phone = String(req.body.phone || '').trim();
    const address = String(req.body.address || '').trim();
    const instructions = String(req.body.instructions || '').trim();
    if (full_name.length < 2 || full_name.length > 100) {
      return res.status(400).json({ error: 'Full name must be 2-100 characters.' });
    }
    if (!isValidContactNumber(phone)) {
      return res.status(400).json({ error: 'Enter a phone number with 10 to 13 digits.' });
    }
    if (address.length > 500 || instructions.length > 500) {
      return res.status(400).json({ error: 'Address and pickup instructions must be 500 characters or fewer.' });
    }
    const updated = await pool.query(
      `UPDATE customers SET full_name = $2, phone = $3, address = $4, pickup_instructions = $5
       WHERE id = $1 RETURNING id, full_name, email, phone, address, pickup_instructions`,
      [req.customer.id, full_name, phone, address, instructions]
    );
    res.json({
      customer: {
        id: updated.rows[0].id,
        full_name: updated.rows[0].full_name,
        email: updated.rows[0].email,
        phone: updated.rows[0].phone || '',
        address: updated.rows[0].address || '',
        instructions: updated.rows[0].pickup_instructions || ''
      }
    });
  } catch (err) {
    return serverError(res, err, 'Server error while saving your details.');
  }
});

app.get('/api/customer/orders', requireCustomer, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${ORDER_COLS} FROM orders WHERE customer_id = $1 ORDER BY pending_at DESC, id DESC LIMIT 500`,
      [req.customer.id]
    );
    res.json({ orders: result.rows.map(o => shapeOrder(o)) });
  } catch (err) {
    return serverError(res, err, 'Server error while loading your orders.');
  }
});

app.get('/api/customer/services', requireCustomer, async (req, res) => {
  try {
    await serviceSchemaReady;
    const result = await pool.query(
      'SELECT id, name, unit, price FROM services WHERE active = TRUE ORDER BY name ASC'
    );
    res.json({ services: result.rows.map(s => ({ id: s.id, name: s.name, unit: s.unit, price: Number(s.price) })) });
  } catch (err) {
    return serverError(res, err, 'Server error while loading services.');
  }
});

app.get('/api/customer/availability', requireCustomer, async (req, res) => {
  try {
    const date = String(req.query.date || '');
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : null;
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      return res.status(400).json({ error: 'Choose a valid schedule date.' });
    }
    const result = await pool.query(
      `SELECT basket_no, to_char(scheduled_at AT TIME ZONE 'Asia/Manila', 'HH24:MI') AS slot
       FROM orders
       WHERE scheduled_at >= ($1::date)::timestamp AT TIME ZONE 'Asia/Manila'
         AND scheduled_at < (($1::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')
         AND status IN ('Pending', 'Confirmed')`,
      [date]
    );
    const settings = await getShopSettings();
    const status = shopStatus(settings);
    res.json({
      bookings: result.rows,
      closed: status.emergency_status === 'closed' && status.today === date
    });
  } catch (err) {
    return serverError(res, err, 'Server error while checking schedule availability.');
  }
});

app.post('/api/customer/orders', requireCustomer, async (req, res) => {
  let client;
  try {
    const basket = Number(req.body.basket_no);
    const mode = String(req.body.fulfillment_type || '');
    const scheduleAt = new Date(req.body.scheduled_at);
    if (!Number.isInteger(basket) || basket < 1 || basket > 14) {
      return res.status(400).json({ error: 'Choose an available basket.' });
    }
    if (!['Drop-off', 'Pickup'].includes(mode) || Number.isNaN(scheduleAt.getTime())) {
      return res.status(400).json({ error: 'Choose a valid drop-off or pickup schedule.' });
    }
    if (!isValidContactNumber(req.customer.phone)) {
      return res.status(400).json({ error: 'Add a valid phone number with 10 to 13 digits in Settings before scheduling.' });
    }
    if (mode === 'Pickup' && !req.customer.address) {
      return res.status(400).json({ error: 'Add your pickup address in Settings before scheduling pickup.' });
    }
    const localParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const now = Object.fromEntries(localParts.map(part => [part.type, part.value]));
    const scheduledParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(scheduleAt);
    const scheduled = Object.fromEntries(scheduledParts.map(part => [part.type, part.value]));
    const scheduleDate = `${scheduled.year}-${scheduled.month}-${scheduled.day}`;
    const today = `${now.year}-${now.month}-${now.day}`;
    const daysAhead = (Date.parse(scheduleDate + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000;
    const startMinutes = Number(scheduled.hour) * 60 + Number(scheduled.minute);
    const allowedSlotMinutes = [9 * 60, 11 * 60, 13 * 60, 15 * 60];
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short' }).format(scheduleAt);
    const openMinutes = dayName === 'Sun' ? 9 * 60 : 8 * 60;
    const closeMinutes = dayName === 'Sun' ? 17 * 60 : 20 * 60;
    if (daysAhead < 0 || daysAhead > 6 || !allowedSlotMinutes.includes(startMinutes) ||
        scheduleAt.getUTCSeconds() !== 0 || scheduleAt.getUTCMilliseconds() !== 0 ||
        startMinutes + 120 > closeMinutes || (scheduleDate === today && startMinutes <= Number(now.hour) * 60 + Number(now.minute))) {
      return res.status(400).json({ error: 'Choose an available time within the next seven days.' });
    }
    if (startMinutes < openMinutes) return res.status(400).json({ error: 'The shop is closed during that time.' });
    const settings = await getShopSettings();
    const shop = shopStatus(settings);
    if (scheduleDate === today && shop.emergency_status === 'closed') {
      return res.status(409).json({ error: 'The shop is closed for today. Please choose another day.' });
    }
    const notes = mode === 'Pickup'
      ? [req.customer.address, req.customer.pickup_instructions].filter(Boolean).join(' — ')
      : null;
    client = await pool.connect();
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO orders (
         customer_name, contact, service, weight_kg, price, basket_no, added_by_name,
         customer_id, service_id, unit, unit_price, amount_paid, notes, scheduled_at, fulfillment_type
       )
       VALUES ($1, $2, 'To be assessed', 0, 0, $3, $1, $4, NULL, NULL, NULL, 0, $5, $6, $7)
       RETURNING ${ORDER_COLS}`,
      [req.customer.full_name, req.customer.phone, basket, req.customer.id, notes, scheduleAt.toISOString(), mode]
    );
    await client.query(
      `INSERT INTO order_history (order_id, action, employee_id, employee_name, changes)
       VALUES ($1, 'created', NULL, $2, $3)`,
      [created.rows[0].id, req.customer.full_name, JSON.stringify({
        status: 'Pending', scheduled_at: scheduleAt.toISOString(), basket_no: basket, fulfillment_type: mode
      })]
    );
    await client.query('COMMIT');
    res.status(201).json({ order: shapeOrder(created.rows[0]) });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(rollbackError => console.error('Could not roll back customer order:', rollbackError.message));
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That basket and time were just booked. Please choose another.' });
    }
    return serverError(res, err, 'Server error while scheduling your order.');
  } finally {
    if (client) client.release();
  }
});

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
    await serviceSchemaReady;
    const customer_name = String(req.body.customer_name || '').trim().replace(/\s+/g, ' ');
    const contact = String(req.body.contact || '').trim();
    const service = String(req.body.service || '').trim();
    const weight = Number(req.body.weight_kg);
    const price = Number(req.body.price);
    const basket = Number(req.body.basket_no);

    if (customer_name.length < 2 || customer_name.length > 60) {
      return res.status(400).json({ error: 'Customer name must be 2-60 characters.' });
    }
    if (!isValidContactNumber(contact)) {
      return res.status(400).json({ error: 'Enter a contact number with 10 to 13 digits.' });
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

    const notes = String(req.body.notes || '').trim().slice(0, 500) || null;
    let service_id = null, unit = null, unit_price = null;
    const sid = parseInt(req.body.service_id, 10);
    if (Number.isInteger(sid)) {
      const svc = await pool.query('SELECT id, unit, price FROM services WHERE id = $1', [sid]);
      if (svc.rows.length) {
        service_id = svc.rows[0].id; unit = svc.rows[0].unit; unit_price = svc.rows[0].price;
      }
    }
    const storedWeight = unit === 'per piece' ? Math.ceil(weight) : Math.round(weight * 10) / 10;
    const cust = await pool.query('SELECT id FROM customers WHERE phone = $1 LIMIT 1', [contact]);
    const customer_id = cust.rows.length ? cust.rows[0].id : null;

    const created = await pool.query(
      `INSERT INTO orders (customer_name, contact, service, weight_kg, price, basket_no, added_by_id, added_by_name,
                           customer_id, service_id, unit, unit_price, amount_paid, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, $13)
       RETURNING ${ORDER_COLS}`,
      [customer_name, contact, service, storedWeight, Math.round(price * 100) / 100,
       basket, String(req.employee.id), req.employee.full_name, customer_id, service_id, unit, unit_price, notes]
    );
    await logHistory(created.rows[0].id, 'created', req.employee,
      { customer_name, service, weight_kg: weight, price, basket_no: basket });
    res.status(201).json({ message: 'Order added.', order: shapeOrder(created.rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'This basket number is already in use by an open order.' });
    }
    console.error(err.message);
    res.status(500).json({ error: 'Server error while adding the order.' });
  }
});

app.patch('/api/employee/orders/:id/details', requireEmployee, async (req, res) => {
  try {
    await serviceSchemaReady;
    const id = parseInt(req.params.id, 10);
    const serviceId = Number(req.body.service_id);
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid order.' });
    if (!Number.isInteger(serviceId) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) {
      return res.status(400).json({ error: 'Choose a service and enter a valid quantity.' });
    }
    const serviceResult = await pool.query(
      'SELECT id, name, unit, price FROM services WHERE id = $1 AND active = TRUE',
      [serviceId]
    );
    if (!serviceResult.rows.length) return res.status(400).json({ error: 'This service is no longer available.' });
    const service = serviceResult.rows[0];
    const normalizedQuantity = service.unit === 'per piece'
      ? Math.ceil(quantity)
      : Math.round(quantity * 10) / 10;
    const price = Math.round(Number(service.price) * normalizedQuantity * 100) / 100;
    if (!Number.isFinite(price) || price > 99999999.99) {
      return res.status(400).json({ error: 'The assessed order total is too high.' });
    }
    const updated = await pool.query(
      `UPDATE orders
       SET service = $2, weight_kg = $3, price = $4, service_id = $5, unit = $6,
           unit_price = $7, edited_at = NOW(), edited_by_id = $8, edited_by_name = $9
       WHERE id = $1 AND status = 'Pending' AND scheduled_at IS NOT NULL AND service_id IS NULL
       RETURNING ${ORDER_COLS}`,
      [id, service.name, normalizedQuantity, price, service.id, service.unit, service.price,
        String(req.employee.id), req.employee.full_name]
    );
    if (!updated.rows.length) {
      return res.status(409).json({ error: 'This scheduled order was already assessed or is no longer pending.' });
    }
    await logHistory(id, 'edited', req.employee, {
      service: service.name, quantity: normalizedQuantity, unit: service.unit, price
    });
    res.json({ order: shapeOrder(updated.rows[0]) });
  } catch (err) {
    return serverError(res, err, 'Server error while assessing the scheduled order.');
  }
});


function orderTransition(fromStatuses, toStatus, col, wrongStateMsg) {
  return async (req, res) => {
    try {
      await orderSchemaReady;
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid order.' });
      if (toStatus === 'Confirmed') {
        const unassessed = await pool.query(
          `SELECT 1 FROM orders
           WHERE id = $1 AND status = ANY($2::text[])
             AND scheduled_at IS NOT NULL AND service_id IS NULL`,
          [id, fromStatuses]
        );
        if (unassessed.rows.length) {
          return res.status(409).json({ error: 'Assess the laundry service and quantity before confirming this order.' });
        }
      }
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
      await logHistory(id, toStatus.toLowerCase(), req.employee, { to: toStatus });
      res.json({ order: shapeOrder(result.rows[0]) });
    } catch (err) {
      return serverError(res, err, 'Server error while updating the order.');
    }
  };
}
app.patch('/api/employee/orders/:id/confirm', requireEmployee,
  orderTransition(['Pending'], 'Confirmed', 'confirmed', 'Only a Pending order can be confirmed'));
app.patch('/api/employee/orders/:id/complete', requireEmployee,
  orderTransition(['Confirmed'], 'Completed', 'completed', 'Only a Confirmed order can be completed'));

app.delete('/api/employee/orders/:id', requireEmployee,
  orderTransition(['Pending', 'Confirmed'], 'Cancelled', 'cancelled', 'Only an open order can be cancelled'));


const adminStatusSteps = {
  Confirmed: orderTransition(['Pending'], 'Confirmed', 'confirmed', 'Only a Pending order can be confirmed'),
  Completed: orderTransition(['Confirmed'], 'Completed', 'completed', 'Only a Confirmed order can be completed'),
  Cancelled: orderTransition(['Pending', 'Confirmed'], 'Cancelled', 'cancelled', 'Only an open order can be cancelled')
};
app.patch('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  const step = adminStatusSteps[req.body && req.body.status];
  if (!step) return res.status(400).json({ error: 'Choose Confirmed, Completed or Cancelled. An order cannot go back to Pending.' });
  req.employee = { id: 'admin', full_name: 'Admin' };
  return step(req, res);
});


app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    await orderSchemaReady;
    const result = await pool.query(
      `SELECT ${ORDER_COLS} FROM orders ORDER BY pending_at DESC, id DESC LIMIT 5000`
    );
    res.json({ orders: result.rows.map(o => shapeOrder(o, { admin: true })) });
  } catch (err) {
    return serverError(res, err, 'Server error while loading orders.');
  }
});

app.get('/api/admin/orders/:id/history', requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid order.' });
    const r = await pool.query(
      'SELECT id, action, employee_name, changes, created_at FROM order_history WHERE order_id = $1 ORDER BY created_at ASC, id ASC', [id]);
    res.json({ history: r.rows });
  } catch (err) {
    return serverError(res, err, 'Server error while loading order history.');
  }
});

app.get('/api/employee/services', requireEmployee, async (req, res) => {
  try {
    await serviceSchemaReady;
    const r = await pool.query('SELECT id, name, unit, price FROM services WHERE active = TRUE ORDER BY name ASC');
    res.json({ services: r.rows.map(x => ({ id: x.id, name: x.name, unit: x.unit, price: Number(x.price) })) });
  } catch (err) {
    return serverError(res, err, 'Server error while loading services.');
  }
});


const SERVICE_UNITS = ['per kilo', 'per piece'];

const serviceSchemaReady = (async () => {
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
    await pool.query('ALTER TABLE services ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
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
    await serviceSchemaReady;
    const result = await pool.query('SELECT id, name, unit, price, active FROM services ORDER BY id ASC');
    res.json({ services: result.rows.map(shapeService) });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error while loading services.' });
  }
});

app.post('/api/admin/services', requireAdmin, async (req, res) => {
  try {
    await serviceSchemaReady;
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
    return serverError(res, err, 'Server error while adding the service.');
  }
});

app.put('/api/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    await serviceSchemaReady;
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid service.' });
    const parsed = readService(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const { name, unit, price, active } = parsed.value;
    const updated = await pool.query(
      `UPDATE services SET name = $2, unit = $3, price = $4, active = $5, updated_at = NOW()
       WHERE id = $1 RETURNING id, name, unit, price, active`,
      [id, name, unit, price, active]
    );
    if (updated.rows.length === 0) return res.status(404).json({ error: 'Service not found.' });
    res.json({ service: shapeService(updated.rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'A service with that name already exists.' });
    return serverError(res, err, 'Server error while updating the service.');
  }
});

app.delete('/api/admin/services/:id', requireAdmin, async (req, res) => {
  try {
    await serviceSchemaReady;
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

    res.json({
      message: 'Login successful!',
      customer,
      token: signToken({ id: String(customer.id), role: 'customer', exp: Date.now() + TOKEN_TTL_MS })
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Server error during Google login.' });
  }
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }
  if (err instanceof SyntaxError && err.status === 400 && Object.prototype.hasOwnProperty.call(err, 'body')) {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  console.error('Unhandled request error:', err.message);
  return res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});