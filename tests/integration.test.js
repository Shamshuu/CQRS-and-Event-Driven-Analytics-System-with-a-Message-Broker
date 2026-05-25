/**
 * Integration Tests for CQRS E-Commerce Analytics System
 *
 * Prerequisites: All services must be running (docker-compose up)
 *
 * Usage:
 *   node tests/integration.test.js
 */

const COMMAND_URL = process.env.COMMAND_URL || 'http://localhost:8080';
const QUERY_URL = process.env.QUERY_URL || 'http://localhost:8081';
const EVENT_PROCESSING_DELAY = 8000; // Wait for event processing (ms)

let passed = 0;
let failed = 0;

// ── Helpers ──────────────────────────────────────────────────────────

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${err.message}`);
    failed++;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Tests ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🧪 CQRS Analytics System — Integration Tests\n');

  // ── Health Checks ──────────────────────────────────────────────────
  console.log('Health Checks:');

  await runTest('Command service is healthy', async () => {
    const { status, body } = await request(`${COMMAND_URL}/health`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.status === 'ok', `Expected status "ok", got "${body.status}"`);
  });

  await runTest('Query service is healthy', async () => {
    const { status, body } = await request(`${QUERY_URL}/health`);
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.status === 'ok', `Expected status "ok", got "${body.status}"`);
  });

  // ── Product Creation ──────────────────────────────────────────────
  console.log('\nProduct Creation:');

  let productId1, productId2;

  await runTest('POST /api/products creates a product (Electronics)', async () => {
    const { status, body } = await request(`${COMMAND_URL}/api/products`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Wireless Mouse',
        category: 'Electronics',
        price: 29.99,
        stock: 100,
      }),
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(body.productId != null, 'Response should contain productId');
    productId1 = body.productId;
  });

  await runTest('POST /api/products creates a product (Books)', async () => {
    const { status, body } = await request(`${COMMAND_URL}/api/products`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Node.js in Action',
        category: 'Books',
        price: 39.99,
        stock: 50,
      }),
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(body.productId != null, 'Response should contain productId');
    productId2 = body.productId;
  });

  await runTest('POST /api/products with invalid body returns 400', async () => {
    const { status } = await request(`${COMMAND_URL}/api/products`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Missing fields' }),
    });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  // ── Order Creation ────────────────────────────────────────────────
  console.log('\nOrder Creation:');

  let orderId1, orderId2, orderId3;

  await runTest('POST /api/orders creates order 1 (customer 1, product 1)', async () => {
    const { status, body } = await request(`${COMMAND_URL}/api/orders`, {
      method: 'POST',
      body: JSON.stringify({
        customerId: 1,
        items: [{ productId: productId1, quantity: 2, price: 29.99 }],
      }),
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(body.orderId != null, 'Response should contain orderId');
    orderId1 = body.orderId;
  });

  await runTest('POST /api/orders creates order 2 (customer 1, product 1)', async () => {
    const { status, body } = await request(`${COMMAND_URL}/api/orders`, {
      method: 'POST',
      body: JSON.stringify({
        customerId: 1,
        items: [{ productId: productId1, quantity: 3, price: 29.99 }],
      }),
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(body.orderId != null, 'Response should contain orderId');
    orderId2 = body.orderId;
  });

  await runTest('POST /api/orders creates order 3 (customer 2, product 2)', async () => {
    const { status, body } = await request(`${COMMAND_URL}/api/orders`, {
      method: 'POST',
      body: JSON.stringify({
        customerId: 2,
        items: [{ productId: productId2, quantity: 1, price: 39.99 }],
      }),
    });
    assert(status === 201, `Expected 201, got ${status}`);
    assert(body.orderId != null, 'Response should contain orderId');
    orderId3 = body.orderId;
  });

  await runTest('POST /api/orders with insufficient stock returns 400', async () => {
    const { status } = await request(`${COMMAND_URL}/api/orders`, {
      method: 'POST',
      body: JSON.stringify({
        customerId: 1,
        items: [{ productId: productId1, quantity: 9999, price: 29.99 }],
      }),
    });
    assert(status === 400, `Expected 400, got ${status}`);
  });

  await runTest('POST /api/orders with non-existent product returns 404', async () => {
    const { status } = await request(`${COMMAND_URL}/api/orders`, {
      method: 'POST',
      body: JSON.stringify({
        customerId: 1,
        items: [{ productId: 99999, quantity: 1, price: 10.0 }],
      }),
    });
    assert(status === 404, `Expected 404, got ${status}`);
  });

  // ── Wait for event processing ─────────────────────────────────────
  console.log(`\n⏳ Waiting ${EVENT_PROCESSING_DELAY / 1000}s for event processing...`);
  await sleep(EVENT_PROCESSING_DELAY);

  // ── Analytics Queries ─────────────────────────────────────────────
  console.log('\nAnalytics — Product Sales:');

  await runTest('GET product sales for product 1 (2 orders, 5 units)', async () => {
    const { status, body } = await request(
      `${QUERY_URL}/api/analytics/products/${productId1}/sales`
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.productId === productId1, `Expected productId ${productId1}`);
    assert(body.totalQuantitySold === 5, `Expected totalQuantitySold 5, got ${body.totalQuantitySold}`);
    assert(body.orderCount === 2, `Expected orderCount 2, got ${body.orderCount}`);
    // total revenue: 2*29.99 + 3*29.99 = 149.95
    assert(
      Math.abs(body.totalRevenue - 149.95) < 0.01,
      `Expected totalRevenue ≈ 149.95, got ${body.totalRevenue}`
    );
  });

  await runTest('GET product sales for product 2 (1 order, 1 unit)', async () => {
    const { status, body } = await request(
      `${QUERY_URL}/api/analytics/products/${productId2}/sales`
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.totalQuantitySold === 1, `Expected totalQuantitySold 1, got ${body.totalQuantitySold}`);
    assert(body.orderCount === 1, `Expected orderCount 1, got ${body.orderCount}`);
    assert(
      Math.abs(body.totalRevenue - 39.99) < 0.01,
      `Expected totalRevenue ≈ 39.99, got ${body.totalRevenue}`
    );
  });

  console.log('\nAnalytics — Category Revenue:');

  await runTest('GET category revenue for Electronics', async () => {
    const { status, body } = await request(
      `${QUERY_URL}/api/analytics/categories/Electronics/revenue`
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.category === 'Electronics', `Expected category "Electronics"`);
    assert(body.totalOrders === 2, `Expected totalOrders 2, got ${body.totalOrders}`);
    assert(
      Math.abs(body.totalRevenue - 149.95) < 0.01,
      `Expected totalRevenue ≈ 149.95, got ${body.totalRevenue}`
    );
  });

  await runTest('GET category revenue for Books', async () => {
    const { status, body } = await request(
      `${QUERY_URL}/api/analytics/categories/Books/revenue`
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.totalOrders === 1, `Expected totalOrders 1, got ${body.totalOrders}`);
    assert(
      Math.abs(body.totalRevenue - 39.99) < 0.01,
      `Expected totalRevenue ≈ 39.99, got ${body.totalRevenue}`
    );
  });

  console.log('\nAnalytics — Customer LTV:');

  await runTest('GET customer 1 lifetime value (2 orders)', async () => {
    const { status, body } = await request(
      `${QUERY_URL}/api/analytics/customers/1/lifetime-value`
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.customerId === 1, `Expected customerId 1`);
    assert(body.orderCount === 2, `Expected orderCount 2, got ${body.orderCount}`);
    // total: 59.98 + 89.97 = 149.95
    assert(
      Math.abs(body.totalSpent - 149.95) < 0.01,
      `Expected totalSpent ≈ 149.95, got ${body.totalSpent}`
    );
    assert(body.lastOrderDate != null, 'lastOrderDate should not be null');
  });

  await runTest('GET customer 2 lifetime value (1 order)', async () => {
    const { status, body } = await request(
      `${QUERY_URL}/api/analytics/customers/2/lifetime-value`
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.customerId === 2, `Expected customerId 2`);
    assert(body.orderCount === 1, `Expected orderCount 1, got ${body.orderCount}`);
    assert(
      Math.abs(body.totalSpent - 39.99) < 0.01,
      `Expected totalSpent ≈ 39.99, got ${body.totalSpent}`
    );
  });

  console.log('\nAnalytics — Sync Status:');

  await runTest('GET sync-status returns valid response', async () => {
    const { status, body } = await request(
      `${QUERY_URL}/api/analytics/sync-status`
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert('lastProcessedEventTimestamp' in body, 'Response should have lastProcessedEventTimestamp');
    assert('lagSeconds' in body, 'Response should have lagSeconds');
    assert(body.lastProcessedEventTimestamp != null, 'lastProcessedEventTimestamp should not be null after processing');
    assert(typeof body.lagSeconds === 'number', 'lagSeconds should be a number');
  });

  await runTest('GET non-existent product returns zero defaults', async () => {
    const { status, body } = await request(
      `${QUERY_URL}/api/analytics/products/99999/sales`
    );
    assert(status === 200, `Expected 200, got ${status}`);
    assert(body.totalQuantitySold === 0, `Expected 0, got ${body.totalQuantitySold}`);
    assert(body.totalRevenue === 0, `Expected 0, got ${body.totalRevenue}`);
    assert(body.orderCount === 0, `Expected 0, got ${body.orderCount}`);
  });

  // ── Summary ───────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'─'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
