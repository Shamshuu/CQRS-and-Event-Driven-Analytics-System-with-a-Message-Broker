const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const { initDatabase } = require('./init-db');
const broker = require('./broker');
const { handleOrderCreated } = require('./handlers/orderCreated');
const { handleProductCreated } = require('./handlers/productCreated');

const PORT = process.env.PORT || 3000;

// ── Health-check server ────────────────────────────────────────────
const app = express();
app.use(cors());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'consumer-service' });
});

// ── Message handlers ───────────────────────────────────────────────

/**
 * Wrap a domain handler so that ack/nack is managed consistently.
 * On success the message is acknowledged; on failure it is rejected
 * without requeue (a dead-letter queue should handle retries).
 */
function createConsumerHandler(handlerFn, eventLabel) {
  return async (msg, channel) => {
    if (!msg) return; // consumer cancelled by RabbitMQ

    try {
      const event = JSON.parse(msg.content.toString());
      console.log(`[Consumer] Received ${eventLabel} event: ${event.eventId}`);
      await handlerFn(event);
      channel.ack(msg);
    } catch (err) {
      console.error(`[Consumer] Error processing ${eventLabel} event:`, err.message);
      // Reject without requeue — let DLQ handle it
      channel.nack(msg, false, false);
    }
  };
}

// ── Startup ────────────────────────────────────────────────────────

async function start() {
  try {
    // 1. Initialize read-side database tables
    await initDatabase();

    // 2. Connect to RabbitMQ
    await broker.connect();

    // 3. Register consumers
    await broker.consume(
      'order-events-queue',
      createConsumerHandler(handleOrderCreated, 'OrderCreated')
    );

    await broker.consume(
      'product-events-queue',
      createConsumerHandler(handleProductCreated, 'ProductCreated')
    );

    // 4. Start health-check HTTP server
    app.listen(PORT, () => {
      console.log(`[Consumer] Health-check server listening on port ${PORT}`);
      console.log('[Consumer] Service started — waiting for events...');
    });
  } catch (err) {
    console.error('[Consumer] Failed to start:', err.message);
    process.exit(1);
  }
}

// ── Graceful shutdown ──────────────────────────────────────────────

async function shutdown(signal) {
  console.log(`\n[Consumer] Received ${signal}, shutting down gracefully...`);
  try {
    await broker.close();
    await pool.end();
    console.log('[Consumer] Shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('[Consumer] Error during shutdown:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
