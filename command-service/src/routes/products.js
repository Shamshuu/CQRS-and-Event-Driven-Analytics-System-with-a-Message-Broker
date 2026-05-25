const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');

const router = express.Router();

/**
 * POST /api/products
 * Create a new product and record an outbox event in a single transaction.
 */
router.post('/api/products', async (req, res) => {
  const { name, category, price, stock } = req.body;

  // --- Validation ---
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'name is required and must be a non-empty string.' });
  }
  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    return res.status(400).json({ error: 'category is required and must be a non-empty string.' });
  }
  if (price == null || typeof price !== 'number' || price <= 0) {
    return res.status(400).json({ error: 'price is required and must be a number greater than 0.' });
  }
  if (stock == null || !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'stock is required and must be an integer >= 0.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Insert product
    const insertProductResult = await client.query(
      `INSERT INTO products (name, category, price, stock) VALUES ($1, $2, $3, $4) RETURNING id`,
      [name.trim(), category.trim(), price, stock]
    );
    const productId = insertProductResult.rows[0].id;

    // 2. Insert outbox event
    const eventPayload = {
      eventType: 'ProductCreated',
      eventId: uuidv4(),
      productId,
      name: name.trim(),
      category: category.trim(),
      price,
      stock,
      timestamp: new Date().toISOString(),
    };

    await client.query(
      `INSERT INTO outbox (topic, payload) VALUES ($1, $2)`,
      ['product-events', JSON.stringify(eventPayload)]
    );

    await client.query('COMMIT');

    console.log(`[Products] Created product id=${productId} name="${name.trim()}"`);
    return res.status(201).json({ productId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Products] Error creating product:', err.message);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    client.release();
  }
});

module.exports = router;
