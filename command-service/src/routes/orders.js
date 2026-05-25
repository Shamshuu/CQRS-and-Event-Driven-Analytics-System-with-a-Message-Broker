const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

const router = express.Router();

/**
 * POST /api/orders
 * Create a new order with stock validation, inventory deduction, and outbox event —
 * all within a single database transaction.
 */
router.post('/api/orders', async (req, res) => {
  const { customerId, items } = req.body;

  // --- Validation ---
  if (customerId == null || !Number.isInteger(customerId)) {
    return res.status(400).json({ error: 'customerId is required and must be an integer.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items is required and must be a non-empty array.' });
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.productId || !Number.isInteger(item.productId)) {
      return res.status(400).json({ error: `items[${i}].productId is required and must be an integer.` });
    }
    if (item.quantity == null || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return res.status(400).json({ error: `items[${i}].quantity is required and must be an integer > 0.` });
    }
    if (item.price == null || typeof item.price !== 'number' || item.price <= 0) {
      return res.status(400).json({ error: `items[${i}].price is required and must be a number > 0.` });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock and validate stock for each item
    const productDetails = new Map(); // productId -> { stock, category }
    for (const item of items) {
      const result = await client.query(
        `SELECT stock, category FROM products WHERE id = $1 FOR UPDATE`,
        [item.productId]
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: `Product with id ${item.productId} not found.` });
      }

      const product = result.rows[0];
      if (product.stock < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient stock for product ${item.productId}. Available: ${product.stock}, requested: ${item.quantity}.`,
        });
      }

      productDetails.set(item.productId, product);
    }

    // 2. Calculate total
    const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const roundedTotal = Math.round(total * 100) / 100;

    // 3. Insert order
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, total) VALUES ($1, $2) RETURNING id, created_at`,
      [customerId, roundedTotal]
    );
    const orderId = orderResult.rows[0].id;
    const createdAt = orderResult.rows[0].created_at;

    // 4. Insert order items
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)`,
        [orderId, item.productId, item.quantity, item.price]
      );
    }

    // 5. Deduct stock
    for (const item of items) {
      await client.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2`,
        [item.quantity, item.productId]
      );
    }

    // 6. Build items array with category info
    const eventItems = items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      price: item.price,
      category: productDetails.get(item.productId).category,
    }));

    // 7. Insert outbox event
    const eventPayload = {
      eventType: 'OrderCreated',
      eventId: uuidv4(),
      orderId,
      customerId,
      items: eventItems,
      total: roundedTotal,
      timestamp: createdAt.toISOString(),
    };

    await client.query(
      `INSERT INTO outbox (topic, payload) VALUES ($1, $2)`,
      ['order-events', JSON.stringify(eventPayload)]
    );

    await client.query('COMMIT');

    console.log(`[Orders] Created order id=${orderId} customerId=${customerId} total=${roundedTotal}`);
    return res.status(201).json({ orderId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Orders] Error creating order:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

module.exports = router;
