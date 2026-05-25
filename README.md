# CQRS and Event-Driven Analytics System

A high-performance e-commerce analytics backend built using the **CQRS** (Command Query Responsibility Segregation) pattern and **Event-Driven Architecture**. The system separates write and read operations, uses RabbitMQ as a message broker for asynchronous communication, and maintains materialized views for optimized analytical querying.

## Architecture Overview

```
┌──────────────────┐         ┌──────────────┐         ┌──────────────────┐
│  Command Service │────────▶│   Write DB   │         │    Read DB       │
│  (Port 8080)     │         │ (PostgreSQL) │         │  (PostgreSQL)    │
│                  │         │              │         │                  │
│ POST /api/       │         │ • products   │         │ Materialized     │
│   products       │         │ • orders     │         │ Views:           │
│   orders         │         │ • order_items│         │ • product_sales  │
│                  │         │ • outbox     │         │ • category_metr. │
│ Outbox Poller ───┼──┐      └──────────────┘         │ • customer_ltv   │
└──────────────────┘  │                                │ • hourly_sales   │
                      │      ┌──────────────┐         │ • processed_evts │
                      └─────▶│   RabbitMQ   │────┐    └────────▲─────────┘
                             │   (Broker)   │    │             │
                             │              │    │    ┌────────┴─────────┐
                             │ Exchange:    │    └───▶│ Consumer Service │
                             │ events-      │         │                  │
                             │ exchange     │         │ Handlers:        │
                             └──────────────┘         │ • OrderCreated   │
                                                      │ • ProductCreated │
┌──────────────────┐                                  │ Idempotent ✓     │
│  Query Service   │         ┌──────────────┐         └──────────────────┘
│  (Port 8081)     │────────▶│   Read DB    │
│                  │         │ (PostgreSQL) │
│ GET /api/        │         └──────────────┘
│   analytics/     │
│   products/      │
│   categories/    │
│   customers/     │
│   sync-status    │
└──────────────────┘
```

## Key Design Patterns

### CQRS (Command Query Responsibility Segregation)
- **Write Side**: Command Service handles all mutations (creating products, placing orders) against a normalized PostgreSQL database
- **Read Side**: Query Service serves analytics from denormalized materialized views in a separate PostgreSQL database
- The two sides are completely decoupled and can be scaled independently

### Transactional Outbox Pattern
- Solves the **dual-write problem**: business data and events are written in the same database transaction
- A background poller picks up unpublished events from the outbox table and publishes them to RabbitMQ
- Uses `SELECT ... FOR UPDATE SKIP LOCKED` for safe concurrent polling

### Event-Driven Architecture
- Events flow through RabbitMQ using a topic exchange (`events-exchange`)
- Consumers process events asynchronously and update materialized views
- Supports eventual consistency with lag monitoring via the sync-status endpoint

### Idempotent Consumers
- Each event has a unique `eventId`
- Consumers track processed events in a `processed_events` table
- Duplicate events are safely skipped, ensuring at-least-once delivery correctness

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 18 (Alpine) |
| Framework | Express.js |
| Write Database | PostgreSQL 14 |
| Read Database | PostgreSQL 14 (separate instance) |
| Message Broker | RabbitMQ 3 (with Management UI) |
| Containerization | Docker & Docker Compose |

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (20.x+)
- [Docker Compose](https://docs.docker.com/compose/install/) (2.x+)

## Quick Start

```bash
# Clone the repository
git clone <repository-url>
cd CQRS-and-Event-Driven-Analytics-System-with-a-Message-Broker

# Start all services
docker-compose up --build

# Services will be available at:
# Command Service:  http://localhost:8080
# Query Service:    http://localhost:8081
# RabbitMQ UI:      http://localhost:15672 (guest/guest)
```

## API Reference

### Command Service (Port 8080)

#### Health Check
```http
GET /health
```
```json
{ "status": "ok", "service": "command-service" }
```

#### Create Product
```http
POST /api/products
Content-Type: application/json

{
  "name": "Wireless Mouse",
  "category": "Electronics",
  "price": 29.99,
  "stock": 100
}
```
Response (201):
```json
{ "productId": 1 }
```

#### Create Order
```http
POST /api/orders
Content-Type: application/json

{
  "customerId": 1,
  "items": [
    { "productId": 1, "quantity": 2, "price": 29.99 }
  ]
}
```
Response (201):
```json
{ "orderId": 1 }
```

### Query Service (Port 8081)

#### Product Sales Analytics
```http
GET /api/analytics/products/{productId}/sales
```
```json
{
  "productId": 1,
  "totalQuantitySold": 5,
  "totalRevenue": 149.95,
  "orderCount": 3
}
```

#### Category Revenue
```http
GET /api/analytics/categories/{category}/revenue
```
```json
{
  "category": "Electronics",
  "totalRevenue": 299.90,
  "totalOrders": 5
}
```

#### Customer Lifetime Value
```http
GET /api/analytics/customers/{customerId}/lifetime-value
```
```json
{
  "customerId": 1,
  "totalSpent": 149.95,
  "orderCount": 2,
  "lastOrderDate": "2026-05-24T12:00:00.000Z"
}
```

#### Sync Status
```http
GET /api/analytics/sync-status
```
```json
{
  "lastProcessedEventTimestamp": "2026-05-24T12:00:05.000Z",
  "lagSeconds": 1.23
}
```

## Project Structure

```
├── docker-compose.yml          # Orchestration for all 6 services
├── .env.example                # Environment variable documentation
├── submission.json             # Evaluation configuration
├── README.md                   # This file
│
├── command-service/            # Write-side microservice
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Express app entry point
│       ├── db.js               # PostgreSQL connection pool
│       ├── broker.js           # RabbitMQ connection & publishing
│       ├── init-db.js          # Write schema initialization
│       ├── routes/
│       │   ├── products.js     # POST /api/products
│       │   └── orders.js       # POST /api/orders
│       └── outbox/
│           └── poller.js       # Background outbox event publisher
│
├── consumer-service/           # Event processing microservice
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Consumer entry point
│       ├── db.js               # Read DB connection pool
│       ├── broker.js           # RabbitMQ consumer setup
│       ├── init-db.js          # Read schema initialization
│       ├── idempotency.js      # Duplicate event prevention
│       └── handlers/
│           ├── orderCreated.js # Updates 4 materialized views
│           └── productCreated.js
│
├── query-service/              # Read-side microservice
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Express app entry point
│       ├── db.js               # Read DB connection pool
│       └── routes/
│           ├── productSales.js
│           ├── categoryRevenue.js
│           ├── customerLtv.js
│           └── syncStatus.js
│
└── tests/
    └── integration.test.js     # End-to-end integration tests
```

## Database Schemas

### Write Database (Normalized)

| Table | Purpose |
|---|---|
| `products` | Product catalog (id, name, category, price, stock) |
| `orders` | Order metadata (id, customer_id, total, status, created_at) |
| `order_items` | Order-product junction (order_id, product_id, quantity, price) |
| `outbox` | Transactional outbox for reliable event publishing |

### Read Database (Denormalized Materialized Views)

| Table | Purpose |
|---|---|
| `product_sales_view` | Per-product sales aggregates |
| `category_metrics_view` | Per-category revenue & order counts |
| `customer_ltv_view` | Customer lifetime value metrics |
| `hourly_sales_view` | Time-based sales rollups |
| `processed_events` | Idempotency tracking |

## Event Flow

1. **Command** → Client sends POST request to Command Service
2. **Write** → Command Service writes business data + outbox event in single transaction
3. **Publish** → Background poller picks up outbox events, publishes to RabbitMQ
4. **Consume** → Consumer Service receives events from RabbitMQ queues
5. **Update** → Consumer updates materialized views in Read DB (idempotently)
6. **Query** → Query Service reads from materialized views and returns analytics

## Environment Variables

See [.env.example](.env.example) for the complete list. Key variables:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | Write DB connection string | `postgresql://user:password@db:5432/write_db` |
| `READ_DATABASE_URL` | Read DB connection string | `postgresql://user:password@read-db:5432/read_db` |
| `BROKER_URL` | RabbitMQ connection string | `amqp://guest:guest@broker:5672/` |
| `COMMAND_SERVICE_PORT` | Command service port | `8080` |
| `QUERY_SERVICE_PORT` | Query service port | `8081` |
| `OUTBOX_POLL_INTERVAL_MS` | Outbox polling interval | `1000` |

## Testing

```bash
# Run integration tests (requires services to be running)
docker-compose up -d
npm test --prefix tests/

# Or test manually with curl
curl http://localhost:8080/health
curl http://localhost:8081/health
```

## License

MIT