const { pool } = require('../db');
const { isProcessed, markProcessed } = require('../idempotency');

/**
 * Handle an ORDER_CREATED event.
 *
 * Updates four materialized views inside a single transaction:
 *   1. product_sales_view   — per-product sales aggregates
 *   2. category_metrics_view — per-category revenue & order counts
 *   3. customer_ltv_view    — customer lifetime value
 *   4. hourly_sales_view    — hourly sales rollup
 *
 * @param {Object} event
 * @param {string} event.eventType
 * @param {string} event.eventId
 * @param {number} event.orderId
 * @param {number} event.customerId
 * @param {Array<{productId: number, quantity: number, price: number, category: string}>} event.items
 * @param {number} event.total
 * @param {string} event.timestamp
 */
async function handleOrderCreated(event) {
  const { eventId, orderId, customerId, items, total, timestamp } = event;

  // Idempotency check
  if (await isProcessed(eventId)) {
    console.log(`[OrderCreated] Event ${eventId} already processed, skipping`);
    return;
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Upsert product_sales_view for each line item
    for (const item of items) {
      const itemRevenue = item.quantity * item.price;
      await client.query(
        `INSERT INTO product_sales_view (product_id, total_quantity_sold, total_revenue, order_count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (product_id) DO UPDATE SET
           total_quantity_sold = product_sales_view.total_quantity_sold + EXCLUDED.total_quantity_sold,
           total_revenue = product_sales_view.total_revenue + EXCLUDED.total_revenue,
           order_count = product_sales_view.order_count + 1`,
        [item.productId, item.quantity, itemRevenue]
      );
    }

    // 2. Aggregate revenue per category, then upsert category_metrics_view
    const categoryRevenue = new Map();
    for (const item of items) {
      const revenue = item.quantity * item.price;
      categoryRevenue.set(
        item.category,
        (categoryRevenue.get(item.category) || 0) + revenue
      );
    }

    for (const [category, revenue] of categoryRevenue) {
      await client.query(
        `INSERT INTO category_metrics_view (category_name, total_revenue, total_orders)
         VALUES ($1, $2, 1)
         ON CONFLICT (category_name) DO UPDATE SET
           total_revenue = category_metrics_view.total_revenue + EXCLUDED.total_revenue,
           total_orders = category_metrics_view.total_orders + 1`,
        [category, revenue]
      );
    }

    // 3. Upsert customer_ltv_view
    await client.query(
      `INSERT INTO customer_ltv_view (customer_id, total_spent, order_count, last_order_date)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (customer_id) DO UPDATE SET
         total_spent = customer_ltv_view.total_spent + EXCLUDED.total_spent,
         order_count = customer_ltv_view.order_count + 1,
         last_order_date = GREATEST(customer_ltv_view.last_order_date, EXCLUDED.last_order_date)`,
      [customerId, total, timestamp]
    );

    // 4. Upsert hourly_sales_view (truncate timestamp to the hour)
    await client.query(
      `INSERT INTO hourly_sales_view (hour_timestamp, total_orders, total_revenue)
       VALUES (date_trunc('hour', $1::timestamptz), 1, $2)
       ON CONFLICT (hour_timestamp) DO UPDATE SET
         total_orders = hourly_sales_view.total_orders + 1,
         total_revenue = hourly_sales_view.total_revenue + EXCLUDED.total_revenue`,
      [timestamp, total]
    );

    // 5. Mark event as processed (inside the same transaction)
    await markProcessed(client, eventId);

    await client.query('COMMIT');
    console.log(`[OrderCreated] Successfully processed event ${eventId} for order ${orderId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { handleOrderCreated };
