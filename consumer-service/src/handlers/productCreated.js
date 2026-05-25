const { pool } = require('../db');
const { isProcessed, markProcessed } = require('../idempotency');

/**
 * Handle a PRODUCT_CREATED event.
 *
 * Ensures the product has a row in product_sales_view
 * with zeroed-out counters (no-op if it already exists).
 *
 * @param {Object} event
 * @param {string} event.eventType
 * @param {string} event.eventId
 * @param {number} event.productId
 * @param {string} event.name
 * @param {string} event.category
 * @param {number} event.price
 * @param {number} event.stock
 * @param {string} event.timestamp
 */
async function handleProductCreated(event) {
  const { eventId, productId, name } = event;

  // Idempotency check
  if (await isProcessed(eventId)) {
    console.log(`[ProductCreated] Event ${eventId} already processed, skipping`);
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Seed product_sales_view with zero counters
    await client.query(
      `INSERT INTO product_sales_view (product_id, total_quantity_sold, total_revenue, order_count)
       VALUES ($1, 0, 0, 0)
       ON CONFLICT DO NOTHING`,
      [productId]
    );

    // Mark event as processed (inside the same transaction)
    await markProcessed(client, eventId);

    await client.query('COMMIT');
    console.log(`[ProductCreated] Successfully processed event ${eventId} for product "${name}" (id=${productId})`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { handleProductCreated };
