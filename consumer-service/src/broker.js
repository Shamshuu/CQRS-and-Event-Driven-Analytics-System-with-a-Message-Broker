const amqplib = require('amqplib');

const EXCHANGE_NAME = 'events-exchange';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

let connection = null;
let channel = null;

/**
 * Connect to RabbitMQ with retry logic.
 * Retries up to MAX_RETRIES times with RETRY_DELAY_MS between attempts.
 */
async function connect() {
  const brokerUrl = process.env.BROKER_URL;
  if (!brokerUrl) {
    throw new Error('BROKER_URL environment variable is not set');
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Broker] Connecting to RabbitMQ (attempt ${attempt}/${MAX_RETRIES})...`);
      connection = await amqplib.connect(brokerUrl);
      channel = await connection.createChannel();

      // Ordered processing — one message at a time
      await channel.prefetch(1);

      // Assert the topic exchange
      await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

      // Assert and bind queues
      await channel.assertQueue('order-events-queue', { durable: true });
      await channel.bindQueue('order-events-queue', EXCHANGE_NAME, 'order-events');

      await channel.assertQueue('product-events-queue', { durable: true });
      await channel.bindQueue('product-events-queue', EXCHANGE_NAME, 'product-events');

      console.log('[Broker] Connected to RabbitMQ successfully');

      connection.on('error', (err) => {
        console.error('[Broker] Connection error:', err.message);
      });

      connection.on('close', () => {
        console.warn('[Broker] Connection closed');
      });

      return;
    } catch (err) {
      console.error(`[Broker] Connection attempt ${attempt} failed:`, err.message);
      if (attempt === MAX_RETRIES) {
        throw new Error(`Failed to connect to RabbitMQ after ${MAX_RETRIES} attempts`);
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

/**
 * Register a consumer on a queue.
 * @param {string} queueName - The queue to consume from
 * @param {Function} handler - Async callback receiving (msg, channel)
 */
async function consume(queueName, handler) {
  if (!channel) {
    throw new Error('Broker channel is not initialized. Call connect() first.');
  }
  await channel.consume(queueName, (msg) => handler(msg, channel), { noAck: false });
  console.log(`[Broker] Consuming from queue: ${queueName}`);
}

/**
 * Gracefully close the broker connection.
 */
async function close() {
  try {
    if (channel) {
      await channel.close();
      channel = null;
    }
    if (connection) {
      await connection.close();
      connection = null;
    }
    console.log('[Broker] Connection closed gracefully');
  } catch (err) {
    console.error('[Broker] Error during close:', err.message);
  }
}

module.exports = { connect, consume, close };
