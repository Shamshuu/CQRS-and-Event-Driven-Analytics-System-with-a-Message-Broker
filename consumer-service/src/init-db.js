const { query } = require('./db');

/**
 * Initialize the read-side materialized view tables and
 * the processed_events idempotency table.
 */
async function initDatabase() {
  console.log('[DB] Initializing database tables...');

  await query(`
    CREATE TABLE IF NOT EXISTS product_sales_view (
      product_id INTEGER PRIMARY KEY,
      total_quantity_sold INTEGER NOT NULL DEFAULT 0,
      total_revenue DECIMAL(12, 2) NOT NULL DEFAULT 0,
      order_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS category_metrics_view (
      category_name VARCHAR(255) PRIMARY KEY,
      total_revenue DECIMAL(12, 2) NOT NULL DEFAULT 0,
      total_orders INTEGER NOT NULL DEFAULT 0
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS customer_ltv_view (
      customer_id INTEGER PRIMARY KEY,
      total_spent DECIMAL(12, 2) NOT NULL DEFAULT 0,
      order_count INTEGER NOT NULL DEFAULT 0,
      last_order_date TIMESTAMPTZ
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS hourly_sales_view (
      hour_timestamp TIMESTAMPTZ PRIMARY KEY,
      total_orders INTEGER NOT NULL DEFAULT 0,
      total_revenue DECIMAL(12, 2) NOT NULL DEFAULT 0
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS processed_events (
      event_id UUID PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log('[DB] Database tables initialized successfully');
}

module.exports = { initDatabase };
