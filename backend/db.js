const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'user_db',
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT || 5432,
      }
);

module.exports = pool;