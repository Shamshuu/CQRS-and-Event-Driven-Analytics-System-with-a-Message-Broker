const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./init-db');
const broker = require('./broker');
const { startOutboxPoller, stopOutboxPoller } = require('./outbox/poller');
const { pool } = require('./db');
const productsRouter = require('./routes/products');
const ordersRouter = require('./routes/orders');

const PORT = parseInt(process.env.PORT, 10) || 8080;

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'command-service' });
});

// --- Routes ---
app.use(productsRouter);
app.use(ordersRouter);

// --- Startup ---
let server;

async function start() {
  try {
    await initDatabase();
    await broker.connect();
    startOutboxPoller();

    server = app.listen(PORT, () => {
      console.log(`[Command Service] Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[Command Service] Failed to start:', err.message);
    process.exit(1);
  }
}

// --- Graceful Shutdown ---
async function shutdown(signal) {
  console.log(`\n[Command Service] Received ${signal}. Shutting down gracefully...`);

  stopOutboxPoller();

  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log('[Command Service] HTTP server closed.');
  }

  await broker.close();
  await pool.end();
  console.log('[Command Service] Database pool closed. Goodbye.');

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
