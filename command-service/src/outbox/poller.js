const { pool } = require('../db');
const { publishToExchange } = require('../broker');

const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS, 10) || 1000;

let pollerInterval = null;

/**
 * Poll the outbox table for unpublished events and publish them to RabbitMQ.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent polling.
 */
async function pollOutbox() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at ASC LIMIT 10 FOR UPDATE SKIP LOCKED`
    );

    const rows = result.rows;
    if (rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    for (const row of rows) {
      await publishToExchange(row.topic, row.payload);
      await client.query(
        `UPDATE outbox SET published_at = NOW() WHERE id = $1`,
        [row.id]
      );
    }

    await client.query('COMMIT');
    console.log(`[Outbox] Published ${rows.length} event(s).`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Outbox] Polling error:', err.message);
  } finally {
    client.release();
  }
}

/**
 * Start the outbox poller on a recurring interval.
 */
function startOutboxPoller() {
  console.log(`[Outbox] Starting poller (interval: ${POLL_INTERVAL_MS}ms)...`);
  pollerInterval = setInterval(pollOutbox, POLL_INTERVAL_MS);
}

/**
 * Stop the outbox poller.
 */
function stopOutboxPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log('[Outbox] Poller stopped.');
  }
}

module.exports = { startOutboxPoller, stopOutboxPoller };
