const express = require('express');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/analytics/categories/:category/revenue
 * Returns aggregated revenue data for a specific category from the materialized view.
 */
router.get('/api/analytics/categories/:category/revenue', async (req, res) => {
  try {
    const { category } = req.params;

    const result = await query(
      'SELECT category_name, total_revenue, total_orders FROM category_metrics_view WHERE category_name = $1',
      [category]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        category,
        totalRevenue: 0,
        totalOrders: 0,
      });
    }

    const row = result.rows[0];

    return res.status(200).json({
      category: row.category_name,
      totalRevenue: parseFloat(row.total_revenue),
      totalOrders: parseInt(row.total_orders, 10),
    });
  } catch (err) {
    console.error('Error fetching category revenue:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
