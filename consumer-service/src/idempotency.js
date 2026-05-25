const { query } = require('./db');

/**
 * Check whether an event has already been processed.
 * @param {string} eventId - UUID of the event
 * @returns {Promise<boolean>} true if the event was already processed
 */
async function isProcessed(eventId) {
  const result = await query(
    'SELECT 1 FROM processed_events WHERE event_id = $1',
    [eventId]
  );
  return result.rowCount > 0;
}

/**
 * Mark an event as processed within an existing transaction.
 * @param {import('pg').PoolClient} client - A pg client (for transactional use)
 * @param {string} eventId - UUID of the event
 */
async function markProcessed(client, eventId) {
  await client.query(
    'INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [eventId]
  );
}

module.exports = { isProcessed, markProcessed };
