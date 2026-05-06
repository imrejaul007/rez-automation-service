# rez-automation-service

Port: 4014

## Environment Variables
```bash
PORT=4014
MONGODB_URI=mongodb+srv://...
REDIS_URL=redis://...
EVENT_BUS_URL=amqp://...
JWT_SECRET=your-secret
NODE_ENV=development
LOG_LEVEL=info
WEBHOOK_TIMEOUT=30
MAX_RETRY_ATTEMPTS=3
EXECUTION_TIMEOUT=60
LOG_RETENTION_DAYS=90
```

## Health Check
GET /health

## Deploy
[Render deployment](https://render.com)

---

Rule engine for automated triggers and workflow automation in the ReZ ecosystem.

---

## Overview

The `rez-automation-service` is a flexible, rule-based automation engine that listens to business events and executes automated actions based on configurable rules. It enables intelligent workflow automation, customer engagement, and operational efficiency.

## Purpose

- **Rule Management**: Create, update, and manage automation rules
- **Event Processing**: Listen to all business events via Event Bus
- **Action Execution**: Execute webhook, email, notification, and API actions
- **Workflow Automation**: Chain multiple actions with conditions
- **Execution Tracking**: Comprehensive logging and analytics

---

## Features

- **Event-Driven Architecture**: React to events like orders, payments, customer actions, and inventory changes
- **Rule Engine**: Flexible rule matching with conditions and priorities
- **Multiple Action Types**: Send offers, create purchase orders, update prices, send notifications
- **Scheduled Tasks**: Cron-based scheduling for time-based automation
- **Real-time Processing**: Redis pub/sub for distributed event handling
- **Comprehensive Logging**: Full execution history with statistics
- **RESTful API**: Full CRUD operations for rules and logs
- **TypeScript**: Fully typed codebase for better developer experience

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Event Bus                                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │  order  │  │ payment │  │ wallet  │  │  hotel  │  │  other  │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘ │
└───────┼────────────┼────────────┼────────────┼────────────┼───────┘
        │            │            │            │            │
        ▼            ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    automation-service                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Rules     │  │  Executor   │  │   Logger    │                 │
│  │   Engine    │  │             │  │             │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Notification│  │   Webhook   │  │    Email    │  │   API Call  │
│   Service   │  │   Handler   │  │   Service   │  │   Handler   │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
```

---

## Built-in Rules

### 1. Customer Churn Prevention
**Trigger**: `order.cancelled`
**Conditions**:
- Order total > $100
- User has less than 3 orders

**Actions**:
- Send personalized re-engagement notification
- Flag user in CRM
- Generate insight for sales team

### 2. Inventory Alerts
**Trigger**: `inventory.updated`
**Conditions**:
- Stock below threshold

**Actions**:
- Notify inventory manager
- Trigger reorder workflow
- Update dashboard metrics

### 3. Dynamic Pricing
**Trigger**: `market.demand_changed`
**Conditions**:
- Demand exceeds 150% of normal

**Actions**:
- Calculate new price
- Update product pricing
- Log price change

### 4. Payment Failure Recovery
**Trigger**: `payment.failed`
**Conditions**:
- Retry count < 3

**Actions**:
- Queue retry with exponential backoff
- Send payment reminder
- Update payment analytics

### 5. Loyalty Points Processing
**Trigger**: `order.completed`
**Conditions**:
- User is loyalty member

**Actions**:
- Calculate points earned
- Update user points balance
- Send points notification

### 6. Fraud Detection Alert
**Trigger**: `order.created`
**Conditions**:
- Multiple risk factors detected

**Actions**:
- Hold order for review
- Alert fraud team
- Log security event

### 7. Welcome Series
**Trigger**: `user.registered`
**Conditions**:
- New user signup

**Actions**:
- Send welcome email (delayed 1 hour)
- Create onboarding insight
- Add to welcome campaign

### 8. Subscription Renewal Reminder
**Trigger**: `subscription.expiry_approaching`
**Conditions**:
- 7 days before expiry

**Actions**:
- Send renewal reminder
- Offer renewal incentive
- Update CRM record

---

## API Endpoints

### Rules API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rules` | List all rules |
| GET | `/api/rules/:id` | Get rule by ID |
| POST | `/api/rules` | Create new rule |
| PUT | `/api/rules/:id` | Update rule |
| DELETE | `/api/rules/:id` | Delete rule |
| POST | `/api/rules/:id/execute` | Execute rule manually |
| POST | `/api/rules/:id/toggle` | Toggle rule enabled/disabled |
| GET | `/api/rules/stats` | Get rule statistics |

### Events API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events` | List supported events |
| POST | `/api/events` | Trigger an event |
| GET | `/api/events/history` | Get event history |

### Logs API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/logs` | List execution logs |
| GET | `/api/logs/:id` | Get log by ID |
| GET | `/api/logs/stats` | Get execution statistics |

### Health API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/health` | Detailed health check |

---

## Rule Structure

```typescript
interface Rule {
  name: string;
  description?: string;
  trigger: {
    event: string;
    conditions?: ITriggerCondition[];
  };
  action: {
    type: 'send_offer' | 'create_po' | 'update_price' | 'notify' | 'webhook' | 'email' | 'sms';
    config: IActionConfig;
  };
  enabled: boolean;
  priority: number;
  tags?: string[];
  cooldown?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ITriggerCondition {
  field?: string;
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'exists' | 'between' | 'regex';
  value?: string | number | boolean | string[] | number[];
  conditions?: ITriggerCondition[];
  logic?: 'and' | 'or';
}
```

---

## Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `==` | Equals | `status == "pending"` |
| `!=` | Not equals | `type != "test"` |
| `>` | Greater than | `total > 100` |
| `>=` | Greater or equal | `count >= 5` |
| `<` | Less than | `stock < 10` |
| `<=` | Less or equal | `priority <= 3` |
| `contains` | String contains | `name contains "urgent"` |
| `in` | Value in array | `status in ["a", "b"]` |
| `not_in` | Value not in array | `type not_in ["void", "test"]` |
| `between` | Value in range | `total between [50, 200]` |
| `regex` | Regex match | `email regex "^admin@"` |

---

## Action Types

| Type | Description | Configuration |
|------|-------------|---------------|
| `notification` | Send in-app notification | `target`, `template`, `priority` |
| `webhook` | HTTP POST to external URL | `url`, `headers`, `payload` |
| `email` | Send email via SMTP | `to`, `template`, `subject` |
| `api_call` | Internal service call | `service`, `endpoint`, `method` |
| `insight` | Generate AI insight | `type`, `category`, `content` |
| `delay` | Wait before next action | `duration` (seconds) |
| `condition` | Conditional branch | `if`, `then`, `else` |

---

## Supported Events

### Order Events
- `order.created` - New order created
- `order.completed` - Order completed
- `order.cancelled` - Order cancelled
- `order.refunded` - Order refunded
- `order.updated` - Order modified

### Payment Events
- `payment.success` - Payment successful
- `payment.failed` - Payment failed
- `payment.pending` - Payment pending
- `payment.initiated` - Payment started

### Wallet Events
- `wallet.created` - Wallet created
- `wallet.deposit` - Funds deposited
- `wallet.withdrawal` - Funds withdrawn
- `wallet.transfer` - Transfer between wallets
- `wallet.balance_changed` - Balance changed

### Customer Events
- `customer.created` - New customer created
- `customer.updated` - Customer profile updated
- `customer.inactive` - Customer inactive (30+ days)
- `customer.churned` - Customer churned
- `user.registered` - User registered
- `user.verified` - User verified
- `user.suspended` - User suspended

### Inventory Events
- `inventory.low` - Inventory below threshold
- `inventory.updated` - Inventory updated
- `inventory.out_of_stock` - Item out of stock
- `inventory.restocked` - Inventory replenished

### Hotel Events
- `hotel.booking.created` - Hotel booking created
- `hotel.booking.updated` - Booking updated
- `hotel.booking.cancelled` - Booking cancelled
- `hotel.room.checked_in` - Guest checked in
- `hotel.room.checked_out` - Guest checked out
- `hotel.room.status_changed` - Room status changed

### Occupancy Events
- `occupancy.high` - High occupancy (>80%)
- `occupancy.low` - Low occupancy (<30%)
- `occupancy.normal` - Normal occupancy

### AI Events
- `intent.captured` - Intent captured
- `intent.processed` - Intent processed
- `insight.generated` - Insight generated
- `analysis.complete` - Analysis complete

### Subscription Events
- `subscription.created` - Subscription created
- `subscription.expiry_approaching` - Expiry approaching

---

## Environment

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EVENT_BUS_URL` | Yes | - | Event bus connection string |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `JWT_SECRET` | Yes | - | JWT verification secret |
| `WEBHOOK_TIMEOUT` | No | `30` | Webhook timeout in seconds |
| `MAX_RETRY_ATTEMPTS` | No | `3` | Maximum action retries |
| `EXECUTION_TIMEOUT` | No | `60` | Max execution time in seconds |
| `LOG_RETENTION_DAYS` | No | `90` | Days to retain execution logs |
| `PORT` | No | `4014` | Service port |
| `LOG_LEVEL` | No | `info` | Logging level |

### Legacy Environment (MongoDB)

```env
# Server
PORT=4014
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/rez-automation
MONGODB_USER=admin
MONGODB_PASSWORD=your_password
MONGODB_AUTH_SOURCE=admin

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
REDIS_KEY_PREFIX=rez:automation:

# Logging
LOG_LEVEL=info
LOG_FILE_PATH=./logs/automation.log

# Worker
WORKER_CONCURRENCY=5
WORKER_INTERVAL_MS=1000
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB 6+
- Redis 7+

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your configuration

# Run the service
npm run dev
```

---

## Example Usage

### Create a Rule

```bash
curl -X POST http://localhost:4014/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VIP Customer Discount",
    "trigger": {
      "event": "customer.created",
      "conditions": [
        { "field": "tier", "operator": "eq", "value": "vip" }
      ]
    },
    "action": {
      "type": "send_offer",
      "config": {
        "discount": 25,
        "offerType": "vip_welcome"
      }
    },
    "priority": 10,
    "tags": ["customer", "vip"]
  }'
```

### Trigger an Event

```bash
curl -X POST http://localhost:4014/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "event": "order.completed",
    "data": {
      "orderId": "ord_123",
      "customerId": "cust_456",
      "totalAmount": 150.00
    }
  }'
```

### Execute Rule Manually

```bash
curl -X POST http://localhost:3001/api/rules/:id/execute \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "cust_456",
    "orderId": "ord_123"
  }'
```

---

## Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint
```

---

## Docker

```bash
# Build
docker build -t rez-automation-service:latest .

# Run
docker run -p 3009:3009 \
  -e EVENT_BUS_URL=amqp://host.docker.internal:5672 \
  -e DATABASE_URL=postgresql://user:pass@host.docker.internal:5432/automation_db \
  -e JWT_SECRET=your-secret \
  rez-automation-service:latest
```

---

## Project Structure

```
rez-automation-service/
├── src/
│   ├── index.ts              # Main entry point
│   ├── config/
│   │   ├── env.ts           # Environment configuration
│   │   ├── mongodb.ts       # MongoDB connection
│   │   └── redis.ts         # Redis connection
│   ├── models/
│   │   ├── Rule.ts          # Rule model
│   │   └── Log.ts           # Log model
│   ├── routes/
│   │   ├── rules.routes.ts  # Rules API
│   │   ├── events.routes.ts # Events API
│   │   └── logs.routes.ts   # Logs API
│   ├── services/
│   │   ├── ruleEngine.ts    # Rule matching engine
│   │   ├── actionExecutor.ts # Action execution
│   │   └── triggerService.ts # Trigger handling
│   ├── workers/
│   │   └── cronWorker.ts    # Scheduled tasks
│   └── middleware/
│       ├── auth.ts          # JWT authentication
│       └── errorHandler.ts  # Error handling
├── tests/
│   └── automation.test.ts   # Unit tests
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

---

## License

MIT
