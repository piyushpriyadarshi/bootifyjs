---
id: logging-transports
title: Transports
sidebar_label: Transports
---

# Log Transports

Transports determine where your logs are sent. BootifyJS supports multiple transports simultaneously, allowing you to send logs to console, files, databases, and analytics platforms.

## Available Transports

### Console Transport

The default transport outputs logs to stdout/stderr. Ideal for development and containerized environments.

**Configuration:**

```env
LOG_LEVEL=debug
```

**Output:**

```json
{
  "level": "info",
  "timestamp": "2023-05-15T12:34:56.789Z",
  "message": "User created",
  "userId": "123",
  "service": "my-api"
}
```

### File Transport

Write logs to files using Pino's built-in file transport.

**Configuration:**

```typescript
// In logger.provider.ts
transportTargets.push({
  target: "pino/file",
  level: "info",
  options: {
    destination: "./logs/app.log",
    mkdir: true,
  },
});
```

### ClickHouse Transport

Send logs to ClickHouse, a high-performance columnar database perfect for log analytics and querying.

### PostHog Transport

Send logs to PostHog for product analytics, session replay, and user behavior tracking.

## ClickHouse Transport

ClickHouse is ideal for storing and analyzing large volumes of logs with fast query performance.

### Features

- **Structured Storage**: Separate tables for application, access, audit, event, and span logs
- **Batch Processing**: Efficient batching with configurable size and interval
- **Automatic Retry**: Exponential backoff retry logic
- **Analytics Views**: Pre-built materialized views for common queries
- **Distributed Tracing**: Full support for trace IDs and span relationships

### Setup

#### 1. Install ClickHouse

Using Docker:

```bash
docker run -d \
  --name clickhouse \
  -p 8123:8123 \
  -p 9000:9000 \
  clickhouse/clickhouse-server
```

#### 2. Install Dependencies

```bash
npm install @clickhouse/client
```

#### 3. Configure Environment

```env
# Enable ClickHouse logging
CLICKHOUSE_ENABLED=true

# ClickHouse connection
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DB=logs

# Service identification
SERVICE_NAME=my-api
```

#### 4. Enable Transport

The ClickHouse transport is automatically enabled when `CLICKHOUSE_ENABLED=true`.

### Database Schema

The transport automatically creates these tables:

#### application_logs

General application logs with full tracing support:

```sql
CREATE TABLE logs.application_logs (
  timestamp DateTime64(3, 'UTC'),
  level LowCardinality(String),
  message String,
  component String,
  username Nullable(String),
  requestId Nullable(String),
  userId Nullable(String),
  traceId Nullable(String),
  spanId Nullable(String),
  parentSpanId Nullable(String),
  correlationId Nullable(String),
  operationName Nullable(String),
  serviceName Nullable(String),
  context Nullable(JSON),
  error Nullable(JSON),
  application Nullable(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, level, component, timestamp);
```

#### access_logs

HTTP request/response logs:

```sql
CREATE TABLE logs.access_logs (
  timestamp DateTime64(3, 'UTC'),
  level LowCardinality(String),
  message String,
  method LowCardinality(String),
  url String,
  path String,
  statusCode UInt16,
  responseTime Float32,
  contentLength Nullable(UInt32),
  username Nullable(String),
  requestId Nullable(String),
  userId Nullable(String),
  traceId Nullable(String),
  spanId Nullable(String),
  ip Nullable(String),
  userAgent Nullable(String),
  context Nullable(JSON),
  error Nullable(JSON)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, method, statusCode, timestamp);
```

#### audit_logs

Security and compliance audit trails:

```sql
CREATE TABLE logs.audit_logs (
  timestamp DateTime64(3, 'UTC'),
  level LowCardinality(String),
  action String,
  resource String,
  resourceId Nullable(String),
  resources Array(String),
  details Nullable(JSON),
  oldValues Nullable(JSON),
  newValues Nullable(JSON),
  metadata Nullable(JSON),
  username Nullable(String),
  userId Nullable(String),
  ip Nullable(String),
  userAgent Nullable(String),
  requestId Nullable(String),
  traceId Nullable(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, action, resource, timestamp);
```

#### spans

Distributed tracing spans:

```sql
CREATE TABLE logs.spans (
  timestamp DateTime64(3, 'UTC'),
  traceId String,
  spanId String,
  parentSpanId Nullable(String),
  operationName String,
  serviceName String,
  startTime DateTime64(3, 'UTC'),
  endTime Nullable(DateTime64(3, 'UTC')),
  duration Nullable(Float32),
  status LowCardinality(String),
  statusCode Nullable(UInt16),
  tags Nullable(JSON),
  logs Nullable(JSON),
  username Nullable(String),
  userId Nullable(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (date, traceId, startTime, spanId);
```

### Querying Logs

#### Recent Errors

```sql
SELECT
  timestamp,
  level,
  message,
  component,
  error
FROM logs.application_logs
WHERE level = 'error'
  AND timestamp > now() - INTERVAL 1 HOUR
ORDER BY timestamp DESC
LIMIT 100;
```

#### API Performance

```sql
SELECT
  path,
  method,
  count() as requests,
  avg(responseTime) as avg_response_ms,
  quantile(0.95)(responseTime) as p95_response_ms,
  quantile(0.99)(responseTime) as p99_response_ms
FROM logs.access_logs
WHERE timestamp > now() - INTERVAL 1 DAY
GROUP BY path, method
ORDER BY requests DESC
LIMIT 20;
```

#### User Activity

```sql
SELECT
  username,
  action,
  resource,
  count() as actions
FROM logs.audit_logs
WHERE timestamp > now() - INTERVAL 1 DAY
  AND username IS NOT NULL
GROUP BY username, action, resource
ORDER BY actions DESC;
```

#### Trace Analysis

```sql
SELECT
  traceId,
  operationName,
  serviceName,
  duration,
  status
FROM logs.spans
WHERE traceId = 'trace-xyz-789'
ORDER BY startTime;
```

### Advanced Configuration

Customize the ClickHouse transport in `logger.provider.ts`:

```typescript
transportTargets.push({
  target: path.join(__dirname, "clickhouse-transport.js"),
  level: "info",
  options: {
    url: process.env.CLICKHOUSE_URL,
    username: process.env.CLICKHOUSE_USER,
    password: process.env.CLICKHOUSE_PASSWORD,
    database: process.env.CLICKHOUSE_DB,
    application: process.env.SERVICE_NAME,

    // Batch configuration
    maxBatchSize: 1000, // Max logs per batch
    flushInterval: 5000, // Flush every 5 seconds

    // Retry configuration
    maxRetries: 5, // Max retry attempts
    retryDelay: 1000, // Initial retry delay (ms)
  },
});
```

## PostHog Transport

PostHog provides product analytics, session replay, and feature flags. The logging transport sends logs as events for analysis.

### Features

- **Event Tracking**: Logs become searchable events
- **User Analytics**: Track user behavior and errors
- **Session Replay**: Link logs to user sessions
- **API Metrics**: Automatic API request tracking
- **Batch Processing**: Efficient batching with size limits

### Setup

#### 1. Create PostHog Account

Sign up at [posthog.com](https://posthog.com) and get your API key.

#### 2. Configure Environment

```env
# Enable PostHog logging
POSTHOG_LOGGING_ENABLED=true

# PostHog configuration
POSTHOG_API_KEY=phc_your_api_key_here
POSTHOG_HOST=https://us.i.posthog.com

# Service identification
SERVICE_NAME=my-api
INSTANCE_ID=prod-server-1
```

#### 3. Enable Transport

The PostHog transport is automatically enabled when `POSTHOG_LOGGING_ENABLED=true`.

### Event Types

The transport creates two types of events:

#### log Events

General application logs (excludes access logs):

```json
{
  "event": "log",
  "distinct_id": "user-123",
  "timestamp": "2023-05-15T12:34:56.789Z",
  "properties": {
    "level": "error",
    "message": "Payment processing failed",
    "log_type": "application",
    "service": "payment-service",
    "instance_id": "prod-server-1",
    "request_id": "req-abc-123",
    "trace_id": "trace-xyz-789",
    "user_id": "user-123",
    "error_message": "Insufficient funds",
    "error_type": "PaymentError",
    "has_error": true
  }
}
```

#### api_request Events

HTTP access logs:

```json
{
  "event": "api_request",
  "distinct_id": "user-123",
  "timestamp": "2023-05-15T12:34:56.789Z",
  "properties": {
    "method": "POST",
    "url": "/api/orders",
    "endpoint": "POST /api/orders",
    "status_code": 201,
    "response_time_ms": 145,
    "is_success": true,
    "is_error": false,
    "service": "api-gateway",
    "instance_id": "prod-server-1",
    "request_id": "req-abc-123",
    "trace_id": "trace-xyz-789",
    "user_id": "user-123",
    "ip": "192.168.1.1",
    "user_agent": "Mozilla/5.0..."
  }
}
```

### PostHog Queries

#### Error Rate by Service

```sql
SELECT
  properties.service,
  countIf(properties.has_error = true) as errors,
  count() as total,
  (errors / total) * 100 as error_rate
FROM events
WHERE event = 'log'
  AND timestamp > now() - INTERVAL 1 DAY
GROUP BY properties.service
ORDER BY error_rate DESC;
```

#### API Performance

```sql
SELECT
  properties.endpoint,
  count() as requests,
  avg(properties.response_time_ms) as avg_response,
  quantile(0.95)(properties.response_time_ms) as p95_response
FROM events
WHERE event = 'api_request'
  AND timestamp > now() - INTERVAL 1 HOUR
GROUP BY properties.endpoint
ORDER BY requests DESC;
```

#### User Error Tracking

```sql
SELECT
  distinct_id as user_id,
  count() as error_count,
  groupArray(properties.error_message) as errors
FROM events
WHERE event = 'log'
  AND properties.has_error = true
  AND timestamp > now() - INTERVAL 1 DAY
GROUP BY distinct_id
ORDER BY error_count DESC
LIMIT 20;
```

### Advanced Configuration

Customize the PostHog transport in `logger.provider.ts`:

```typescript
transportTargets.push({
  target: path.join(__dirname, "posthog-transport.js"),
  level: "info",
  options: {
    apiKey: process.env.POSTHOG_API_KEY,
    host: process.env.POSTHOG_HOST,
    serviceName: process.env.SERVICE_NAME,
    instanceId: process.env.INSTANCE_ID,

    config: {
      BATCH_SIZE: 50, // Events per batch
      FLUSH_INTERVAL: 2000, // Flush every 2 seconds
      MAX_RETRIES: 3, // Max retry attempts
      RETRY_DELAY: 1000, // Initial retry delay (ms)
      RETRY_BACKOFF: 2, // Exponential backoff multiplier
      MAX_BATCH_SIZE_MB: 18, // Max batch size (PostHog limit is 20MB)
    },
  },
});
```

## Multiple Transports

Use multiple transports simultaneously:

```typescript
// logger.provider.ts
const transportTargets: pino.TransportTargetOptions[] = [];

// Console for development
transportTargets.push({
  target: "pino/file",
  level: "debug",
  options: {},
});

// ClickHouse for log storage and analytics
if (process.env.CLICKHOUSE_ENABLED === "true") {
  transportTargets.push({
    target: path.join(__dirname, "clickhouse-transport.js"),
    level: "info",
    options: {
      url: process.env.CLICKHOUSE_URL,
      username: process.env.CLICKHOUSE_USER,
      password: process.env.CLICKHOUSE_PASSWORD,
      database: process.env.CLICKHOUSE_DB,
    },
  });
}

// PostHog for product analytics
if (process.env.POSTHOG_LOGGING_ENABLED === "true") {
  transportTargets.push({
    target: path.join(__dirname, "posthog-transport.js"),
    level: "info",
    options: {
      apiKey: process.env.POSTHOG_API_KEY,
      host: process.env.POSTHOG_HOST,
    },
  });
}

return pino({
  ...pinoOptions,
  transport: { targets: transportTargets },
});
```

## Best Practices

### 1. Use Appropriate Log Levels per Transport

```typescript
// Console: verbose for development
transportTargets.push({
  target: "pino/file",
  level: "debug", // Verbose
  options: {},
});

// ClickHouse: info and above for storage
transportTargets.push({
  target: "clickhouse-transport.js",
  level: "info", // Less verbose
  options: {
    /* ... */
  },
});
```

### 2. Configure Batch Sizes

Balance between latency and efficiency:

```typescript
// High-volume application
maxBatchSize: 1000,
flushInterval: 5000,

// Low-volume application
maxBatchSize: 100,
flushInterval: 2000,
```

### 3. Monitor Transport Health

Check transport metrics:

```typescript
// ClickHouse transport logs metrics
[ClickHouseTransport] Flushing application batch of 250 records
[ClickHouseTransport] Sent batch of 250 events (125.5KB)

// PostHog transport logs metrics
[PostHogTransport] Sent batch of 50 events (45.2KB)
[PostHogTransport] Final metrics: {
  logsReceived: 1250,
  logEventsSent: 1000,
  apiRequestEventsSent: 250,
  batchesSent: 25
}
```

### 4. Handle Transport Failures

Transports include retry logic, but monitor for persistent failures:

```typescript
// Check logs for transport errors
[ClickHouseTransport] Insert failed: Connection refused
[ClickHouseTransport] Retrying in 2000ms (attempt 2/5)

[PostHogTransport] Max retries exceeded. Dropping 50 events.
```

### 5. Secure Credentials

Never commit credentials:

```env
# ❌ Bad - committed to git
CLICKHOUSE_PASSWORD=mypassword

# ✅ Good - use secrets management
CLICKHOUSE_PASSWORD=${CLICKHOUSE_PASSWORD}
```

## Troubleshooting

### ClickHouse Connection Issues

```bash
# Test ClickHouse connection
curl http://localhost:8123/ping

# Check ClickHouse logs
docker logs clickhouse

# Verify tables created
echo "SHOW TABLES FROM logs" | curl 'http://localhost:8123/' --data-binary @-
```

### PostHog Not Receiving Events

```bash
# Check API key
curl -X POST https://us.i.posthog.com/batch/ \
  -H "Content-Type: application/json" \
  -d '{"api_key":"YOUR_API_KEY","batch":[]}'

# Should return: {"status": 1}
```

### High Memory Usage

Reduce batch sizes:

```typescript
// Reduce memory footprint
maxBatchSize: 500,  // Instead of 1000
flushInterval: 2000,  // Flush more frequently
```

## Next Steps

- [Basic Usage](./basic-usage.md) - Learn core logging methods
- [Context Logging](./context-logging.md) - Understand request context
