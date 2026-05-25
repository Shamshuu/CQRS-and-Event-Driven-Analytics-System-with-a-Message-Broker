const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.READ_DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message);
});

/**
 * Execute a parameterized query against the read database.
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
