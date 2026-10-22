const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());  

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
    const employeeResult = await pool.query('SELECT * FROM employees WHERE email = $1', [email]);
    if (employeeResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }
    const employee = employeeResult.rows[0];

    console.log("--- LOGIN DEBUG ---");
    console.log("User typed password:", password);
    console.log("Database password_hash:", employee.password_hash);

    const isPasswordValid = await bcrypt.compare(password, employee.password_hash);
    console.log("Bcrypt match result:", isPasswordValid);
   
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

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `UPDATE customers
       SET reset_token = $1, reset_token_expires = $2
       WHERE email = $3`,
      [otp, expiresAt, email]
    );

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset OTP - Laundry App',
      text: `Hello,\n\nYour One-Time Password (OTP) to reset your password is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request this, please ignore this email.`
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP email successfully sent to ${email}`);

    res.json({ message: 'OTP sent successfully to your email!' });

  } catch (err) {
    console.error('Server error during forgot-password request:', err);
    res.status(500).json({ error: 'Server error while sending reset email. Please try again later.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});