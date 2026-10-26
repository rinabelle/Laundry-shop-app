const { Pool } = require('pg');
require('dotenv').config();

console.log('DB target:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@') : 'DATABASE_URL NOT SET');

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