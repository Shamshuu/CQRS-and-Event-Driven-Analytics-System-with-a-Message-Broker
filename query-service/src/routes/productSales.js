const express = require('express');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/analytics/products/:productId/sales
 * Returns aggregated sales data for a specific product from the materialized view.
 */
router.get('/api/analytics/products/:productId/sales', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(productId)) {
      return res.status(400).json({ error: 'productId must be a valid integer' });
    }

    const result = await query(
      'SELECT product_id, total_quantity_sold, total_revenue, order_count FROM product_sales_view WHERE product_id = $1',
      [productId]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        productId,
        totalQuantitySold: 0,
        totalRevenue: 0,
        orderCount: 0,
      });
    }

    const row = result.rows[0];

    return res.status(200).json({
      productId: parseInt(row.product_id, 10),
      totalQuantitySold: parseInt(row.total_quantity_sold, 10),
      totalRevenue: parseFloat(row.total_revenue),
      orderCount: parseInt(row.order_count, 10),
    });
  } catch (err) {
    console.error('Error fetching product sales:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
