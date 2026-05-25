const express = require('express');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/analytics/customers/:customerId/lifetime-value
 * Returns lifetime value data for a specific customer from the materialized view.
 */
router.get('/api/analytics/customers/:customerId/lifetime-value', async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId, 10);

    if (isNaN(customerId)) {
      return res.status(400).json({ error: 'customerId must be a valid integer' });
    }

    const result = await query(
      'SELECT customer_id, total_spent, order_count, last_order_date FROM customer_ltv_view WHERE customer_id = $1',
      [customerId]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        customerId,
        totalSpent: 0,
        orderCount: 0,
        lastOrderDate: null,
      });
    }

    const row = result.rows[0];

    return res.status(200).json({
      customerId: parseInt(row.customer_id, 10),
      totalSpent: parseFloat(row.total_spent),
      orderCount: parseInt(row.order_count, 10),
      lastOrderDate: row.last_order_date ? row.last_order_date.toISOString() : null,
    });
  } catch (err) {
    console.error('Error fetching customer lifetime value:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
