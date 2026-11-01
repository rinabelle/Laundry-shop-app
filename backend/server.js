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