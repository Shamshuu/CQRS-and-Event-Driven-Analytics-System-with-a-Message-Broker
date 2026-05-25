const express = require('express');
const { query } = require('../db');

const router = express.Router();

/**
 * GET /api/analytics/sync-status
 * Returns the timestamp of the last processed event and the current lag in seconds.
 */
router.get('/api/analytics/sync-status', async (req, res) => {
  try {
    const result = await query(
      'SELECT MAX(processed_at) as last_processed FROM processed_events'
    );

    const row = result.rows[0];

    if (!row || row.last_processed === null) {
      return res.status(200).json({
        lastProcessedEventTimestamp: null,
        lagSeconds: 0,
      });
    }

    const lastProcessed = new Date(row.last_processed);
    const lagSeconds = (Date.now() - lastProcessed.getTime()) / 1000;

    return res.status(200).json({
      lastProcessedEventTimestamp: lastProcessed.toISOString(),
      lagSeconds: parseFloat(lagSeconds.toFixed(2)),
    });
  } catch (err) {
    console.error('Error fetching sync status:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
