const amqplib = require('amqplib');

const EXCHANGE_NAME = 'events-exchange';
const EXCHANGE_TYPE = 'topic';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

let connection = null;
let channel = null;

/**
 * Connect to RabbitMQ with retry logic.
 * Retries up to MAX_RETRIES times with RETRY_DELAY_MS between attempts.
 */
async function connect() {
  const brokerUrl = process.env.BROKER_URL || 'amqp://localhost';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Broker] Connecting to RabbitMQ (attempt ${attempt}/${MAX_RETRIES})...`);
      connection = await amqplib.connect(brokerUrl);
      channel = await connection.createChannel();

      await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true });

      connection.on('error', (err) => {
        console.error('[Broker] Connection error:', err.message);
      });

      connection.on('close', () => {
        console.warn('[Broker] Connection closed.');
        channel = null;
        connection = null;
      });

      console.log('[Broker] Connected to RabbitMQ successfully.');
      return;
    } catch (err) {
      console.error(`[Broker] Connection attempt ${attempt} failed:`, err.message);
      if (attempt === MAX_RETRIES) {
        throw new Error(`[Broker] Failed to connect to RabbitMQ after ${MAX_RETRIES} attempts.`);
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
}

/**
 * Publish a JSON message to the events exchange with a given routing key.
 * @param {string} routingKey - The routing key for the message
 * @param {object} message - The message payload (will be JSON-serialized)
 */
async function publishToExchange(routingKey, message) {
  if (!channel) {
    throw new Error('[Broker] Channel is not available. Is the broker connected?');
  }

  const content = Buffer.from(JSON.stringify(message));
  channel.publish(EXCHANGE_NAME, routingKey, content, {
    persistent: true,
    contentType: 'application/json',
  });
}

/**
 * Get the current AMQP channel.
 * @returns {import('amqplib').Channel | null}
 */
function getChannel() {
  return channel;
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
    console.log('[Broker] Connection closed gracefully.');
  } catch (err) {
    console.error('[Broker] Error closing connection:', err.message);
  }
}

module.exports = { connect, publishToExchange, getChannel, close };
