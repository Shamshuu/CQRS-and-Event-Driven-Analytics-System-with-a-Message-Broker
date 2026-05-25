const express = require('express');
const cors = require('cors');
const { pool } = require('./db');
const productSalesRouter = require('./routes/productSales');
const categoryRevenueRouter = require('./routes/categoryRevenue');
const customerLtvRouter = require('./routes/customerLtv');
const syncStatusRouter = require('./routes/syncStatus');

const app = express();
const PORT = process.env.PORT || 8081;

// Middleware
app.use(express.json());
app.use(cors());

// Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'query-service' });
});

// Mount route modules
app.use(productSalesRouter);
app.use(categoryRevenueRouter);
app.use(customerLtvRouter);
app.use(syncStatusRouter);

// Start server
const server = app.listen(PORT, () => {
  console.log(`Query service listening on port ${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    try {
      await pool.end();
      console.log('Database pool closed.');
    } catch (err) {
      console.error('Error closing database pool:', err.message);
    }
    process.exit(0);
  });

  // Force exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('Forceful shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
