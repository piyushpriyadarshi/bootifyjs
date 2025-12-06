# PostHog Log Analytics Guide

This guide explains how to use PostHog for log analytics, API monitoring, and observability in your Bootify application.

## Overview

The PostHog transport sends two types of events:

1. **Individual Log Events** (`log`) - Every log message as a separate event
2. **API Request Events** (`api_request`) - HTTP access logs with performance metrics

This approach enables:

- Full-text search across all logs
- API performance analytics
- Error rate tracking
- User behavior analysis
- Custom dashboards and insights

## Event Types

### 1. Log Events

Every log message (info, warn, error, debug) is sent as an individual event.

**Event Name:** `log`

**Properties:**

```javascript
{
  // Core log properties
  level: "info" | "warn" | "error" | "debug",
  message: "User created successfully",
  log_type: "application" | "http" | "audit" | "event",

  // Service context
  service: "my-api",
  instance_id: "instance-1",
  environment: "production",

  // Request context
  request_id: "req-123",
  trace_id: "trace-456",
  span_id: "span-789",

  // User context
  user_id: "user-123",
  username: "john@example.com",

  // Component info
  component: "UserService",
  service_name: "my-api",

  // Additional context
  context: { /* custom data */ },

  // Error details (if error log)
  error_message: "Database connection failed",
  error_stack: "Error: ...",
  error_code: "ECONNREFUSED",
  error_type: "DatabaseError",
  has_error: true,

  // Audit log specific
  audit_action: "create",
  audit_resource: "user",
  audit_resource_id: "user-123",

  // Performance
  duration_ms: 150,

  // Timestamp
  timestamp: "2025-01-11T10:30:00.000Z"
}
```

### 2. API Request Events

HTTP access logs are sent as separate events for API analytics.

**Event Name:** `api_request`

**Properties:**

```javascript
{
  // Request details
  method: "POST",
  url: "/api/users",
  endpoint: "POST /api/users",
  status_code: 201,
  response_time_ms: 45,

  // Classification
  is_error: false,
  is_client_error: false,
  is_server_error: false,
  is_success: true,

  // Service context
  service: "my-api",
  instance_id: "instance-1",
  environment: "production",

  // Request context
  request_id: "req-123",
  trace_id: "trace-456",

  // Client info
  ip: "192.168.1.1",
  user_agent: "Mozilla/5.0...",

  // User context
  user_id: "user-123",
  username: "john@example.com",

  // Timestamp
  timestamp: "2025-01-11T10:30:00.000Z"
}
```

## PostHog Insights & Dashboards

### 1. Search Logs by Message

**Use Case:** Find all logs containing specific text

**Query:**

```
Event: log
Filter: message contains "database"
```

**Example Searches:**

- Error messages: `message contains "error" AND level = "error"`
- User actions: `message contains "user created" AND user_id exists`
- Slow queries: `duration_ms > 1000`

### 2. API Performance Dashboard

#### Average Response Time by Endpoint

**Insight Type:** Trends

```
Event: api_request
Aggregate: Average of response_time_ms
Group by: endpoint
```

#### Total API Hits

**Insight Type:** Number

```
Event: api_request
Aggregate: Total count
```

#### Requests per Endpoint

**Insight Type:** Bar Chart

```
Event: api_request
Aggregate: Total count
Group by: endpoint
Order by: count descending
```

#### Response Time Distribution

**Insight Type:** Histogram

```
Event: api_request
Property: response_time_ms
Buckets: [0-50ms, 50-100ms, 100-200ms, 200-500ms, 500ms+]
```

### 3. Error Rate Tracking

#### Overall Error Rate

**Insight Type:** Trends

```
Event: api_request
Filter: is_error = true
Aggregate: Total count
```

#### Error Rate by Endpoint

**Insight Type:** Table

```
Event: api_request
Aggregate:
  - Total count
  - Count where is_error = true
  - Formula: (errors / total) * 100
Group by: endpoint
```

#### 4xx vs 5xx Errors

**Insight Type:** Stacked Bar Chart

```
Event: api_request
Filter: is_error = true
Aggregate: Total count
Group by:
  - endpoint
  - is_client_error (4xx)
  - is_server_error (5xx)
```

### 4. User Activity Analysis

#### Active Users

**Insight Type:** Unique Users

```
Event: api_request
Aggregate: Unique user_id
Time range: Last 24 hours
```

#### User Request Patterns

**Insight Type:** Funnel

```
Events:
1. api_request (method = GET, url contains /products)
2. api_request (method = POST, url contains /cart)
3. api_request (method = POST, url contains /checkout)
```

### 5. Service Health Monitoring

#### Error Logs Over Time

**Insight Type:** Trends

```
Event: log
Filter: level = "error"
Aggregate: Total count
Interval: Hourly
```

#### Service Availability

**Insight Type:** Formula

```
Event: api_request
Formula: (1 - (5xx_errors / total_requests)) * 100
```

#### Slow Requests

**Insight Type:** Table

```
Event: api_request
Filter: response_time_ms > 1000
Properties: endpoint, response_time_ms, user_id, timestamp
Order by: response_time_ms descending
Limit: 100
```

## Sample Dashboard Configuration

Create a dashboard with these insights:

```
┌─────────────────────────────────────────────────────────┐
│                  API Performance Dashboard               │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Total Requests (24h)    Avg Response Time    Error %   │
│      125,432                  45ms              0.5%     │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Requests per Endpoint (Bar Chart)                      │
│  ████████████████ GET /api/users (45k)                  │
│  ██████████ POST /api/orders (28k)                      │
│  ████ GET /api/products (12k)                           │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Response Time Trend (Line Chart)                       │
│  [Graph showing response time over last 24h]            │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Error Rate by Endpoint (Table)                         │
│  Endpoint              Total    Errors    Error %       │
│  POST /api/payment     1,234    15        1.2%          │
│  GET /api/users/:id    45,678   12        0.03%         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Advanced Queries

### 1. Find All Errors for a Specific User

```
Event: log
Filters:
  - level = "error"
  - user_id = "user-123"
Time range: Last 7 days
```

### 2. Trace a Request Across Services

```
Event: log
Filter: request_id = "req-abc-123"
Order by: timestamp ascending
```

### 3. Identify Slow Database Queries

```
Event: log
Filters:
  - component = "Database"
  - duration_ms > 500
Properties: message, duration_ms, context
```

### 4. Monitor Audit Trail

```
Event: log
Filters:
  - log_type = "audit"
  - audit_action = "delete"
Properties: user_id, audit_resource, audit_resource_id, timestamp
```

### 5. API Usage by User

```
Event: api_request
Aggregate: Total count
Group by: user_id
Order by: count descending
Limit: 50
```

## Alerts Configuration

Set up alerts in PostHog for critical events:

### 1. High Error Rate Alert

```
Insight: Error rate > 5%
Condition: When error rate exceeds 5% in last 5 minutes
Action: Send webhook/email
```

### 2. Slow Response Time Alert

```
Insight: Average response time
Condition: When avg response_time_ms > 500ms for 10 minutes
Action: Send notification
```

### 3. Service Down Alert

```
Insight: Total requests
Condition: When total requests = 0 for 5 minutes
Action: Send critical alert
```

## Configuration

### Enable PostHog Transport

```typescript
// In your logging configuration
import { createLogger } from "bootify/logging";

const logger = createLogger({
  transports: [
    {
      type: "posthog",
      apiKey: process.env.POSTHOG_API_KEY,
      host: process.env.POSTHOG_HOST || "https://app.posthog.com",
      serviceName: "my-api",
      instanceId: process.env.INSTANCE_ID || "default",
      config: {
        BATCH_SIZE: 50, // Events per batch
        FLUSH_INTERVAL: 2000, // Flush every 2 seconds
        MAX_RETRIES: 3, // Retry failed sends
        RETRY_DELAY: 1000, // Delay between retries
      },
    },
  ],
});
```

### Environment Variables

```bash
POSTHOG_API_KEY=phc_your_api_key_here
POSTHOG_HOST=https://app.posthog.com
INSTANCE_ID=api-server-1
NODE_ENV=production
```

## Best Practices

1. **Use Structured Logging**

   ```typescript
   logger.info("User created", {
     userId: user.id,
     email: user.email,
   });
   ```

2. **Add Request Context**

   - Always include `requestId` for tracing
   - Add `userId` for user-specific analysis

3. **Use Appropriate Log Levels**

   - `error`: Failures requiring attention
   - `warn`: Potential issues
   - `info`: Important business events
   - `debug`: Detailed diagnostic info

4. **Include Performance Metrics**

   ```typescript
   logger.info("Database query completed", {
     duration: 150,
     query: "SELECT * FROM users",
   });
   ```

5. **Leverage Audit Logs**
   ```typescript
   logger.info("Resource deleted", {
     action: "delete",
     resource: "user",
     resourceId: userId,
     userId: currentUser.id,
   });
   ```

## Troubleshooting

### Logs Not Appearing in PostHog

1. Check API key and host configuration
2. Verify network connectivity to PostHog
3. Check console for transport errors
4. Ensure events are being buffered (check metrics)

### High Memory Usage

- Reduce `BATCH_SIZE`
- Decrease `FLUSH_INTERVAL`
- Check for event buffer buildup

### Missing Properties

- Ensure logs include required context
- Check middleware is adding request context
- Verify user context is being set

## Performance Considerations

- Events are batched to reduce API calls
- Automatic retry with exponential backoff
- Non-blocking async processing
- Graceful shutdown flushes all pending events

## Example Queries for Common Use Cases

### Find all failed login attempts

```
Event: log
Filters:
  - message contains "login failed"
  - level = "warn"
Group by: user_id
```

### Monitor payment processing

```
Event: log
Filters:
  - component = "PaymentService"
  - level in ["error", "warn"]
Properties: message, context, user_id
```

### Track feature usage

```
Event: api_request
Filters:
  - url contains "/api/new-feature"
Aggregate: Unique user_id
Time range: Last 30 days
```

---

For more information on PostHog insights and dashboards, visit: https://posthog.com/docs/product-analytics
