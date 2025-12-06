# PostHog Transport Migration Guide

## What Changed?

The PostHog transport has been refactored with two major improvements:

1. **Request-grouped traces → Individual event streaming** for better analytics and searchability
2. **Individual API calls → Batch API** for better performance and reduced network overhead

## Before vs After

### Before (Request-Grouped)

```javascript
// Single event per request with all logs bundled
{
  event: "request_trace",
  properties: {
    request_id: "req-123",
    logs: [
      { message: "Request started" },
      { message: "Database query" },
      { message: "Request completed" }
    ]
  }
}
```

**Problems:**

- ❌ Can't search individual log messages
- ❌ Difficult to analyze specific log types
- ❌ No per-endpoint metrics
- ❌ Complex queries for error analysis

### After (Individual Events)

```javascript
// Separate event for each log
{
  event: "log",
  properties: {
    level: "info",
    message: "Database query completed",
    request_id: "req-123",
    duration_ms: 150
  }
}

// Separate event for API metrics
{
  event: "api_request",
  properties: {
    method: "POST",
    url: "/api/users",
    status_code: 201,
    response_time_ms: 45
  }
}
```

**Benefits:**

- ✅ Full-text search on log messages
- ✅ Easy filtering by log level, component, user
- ✅ Built-in API performance metrics
- ✅ Simple error rate calculations
- ✅ Better PostHog insights integration

## Key Features

### 1. Individual Log Events

Every log message is a separate PostHog event with full context:

- Log level (info, warn, error, debug)
- Message text (searchable)
- Request/trace IDs for correlation
- User context
- Error details
- Custom context

### 2. API Metrics Events

HTTP access logs generate separate `api_request` events with:

- Endpoint (method + URL)
- Response time
- Status code
- Error classification (4xx, 5xx)
- User info
- Client details (IP, user agent)

### 3. Real-Time Analytics

- **Search logs:** Find any log by message content
- **API performance:** Track response times per endpoint
- **Error rates:** Monitor error percentages
- **User activity:** Analyze user behavior patterns
- **Service health:** Track availability and performance

## Migration Steps

### No Code Changes Required!

The transport is backward compatible. Your existing logging code works as-is:

```typescript
// Your existing code - no changes needed
logger.info("User created", { userId: user.id });
logger.error("Database error", error);
```

### Configuration (Optional)

You can tune the transport settings:

```typescript
{
  type: 'posthog',
  apiKey: process.env.POSTHOG_API_KEY,
  host: process.env.POSTHOG_HOST,
  serviceName: 'my-api',
  config: {
    BATCH_SIZE: 50,        // Events per batch (default: 50)
    FLUSH_INTERVAL: 2000,  // Flush every 2s (default: 2000)
    MAX_RETRIES: 3,        // Retry attempts (default: 3)
    RETRY_DELAY: 1000,     // Retry delay ms (default: 1000)
  }
}
```

## PostHog Setup

### 1. Create Insights

#### API Performance Dashboard

```
Insight: Trends
Event: api_request
Metric: Average response_time_ms
Group by: endpoint
```

#### Error Rate

```
Insight: Formula
Event: api_request
Formula: (count where is_error=true / total count) * 100
```

#### Log Search

```
Insight: Events
Event: log
Filter: message contains "your search term"
```

### 2. Set Up Alerts

```
Alert: High Error Rate
Condition: When error rate > 5% for 5 minutes
Action: Send notification
```

### 3. Create Dashboards

Combine multiple insights:

- Total requests (24h)
- Average response time
- Error percentage
- Requests per endpoint
- Error logs timeline
- Slow requests table

## What You Can Do Now

### 1. Search Logs

```
Find all logs containing "payment failed"
Event: log
Filter: message contains "payment failed"
```

### 2. Track API Performance

```
Average response time by endpoint
Event: api_request
Metric: avg(response_time_ms)
Group by: endpoint
```

### 3. Monitor Errors

```
Error rate per endpoint
Event: api_request
Filter: is_error = true
Group by: endpoint
```

### 4. Analyze User Behavior

```
API calls per user
Event: api_request
Metric: count
Group by: user_id
```

### 5. Trace Requests

```
All logs for a specific request
Event: log
Filter: request_id = "req-123"
Order by: timestamp
```

## Performance Impact

### Reduced

- ✅ Memory usage (no request buffering)
- ✅ Complexity (simpler code)
- ✅ Latency (immediate event creation)

### Increased

- ⚠️ Event volume (more events sent)
  - Mitigated by batching (50 events per batch)
  - Configurable flush interval (2s default)

### Network Usage

- Similar overall (batching optimizes API calls)
- More granular data for better insights

## Troubleshooting

### Events Not Appearing

1. Check PostHog API key and host
2. Verify network connectivity
3. Check console for errors
4. Review metrics in shutdown logs

### High Event Volume

1. Reduce log verbosity (use appropriate levels)
2. Increase `BATCH_SIZE` (up to 100)
3. Increase `FLUSH_INTERVAL` (up to 5000ms)
4. Filter out noisy logs

### Missing Properties

1. Ensure request context middleware is enabled
2. Check user context is being set
3. Verify log format includes required fields

## Metrics

The transport tracks these metrics:

- `logsReceived`: Total logs processed
- `logsSent`: Successfully sent to PostHog
- `logsDropped`: Failed after retries
- `apiMetricsSent`: API request events sent
- `parseErrors`: Log parsing failures
- `sendErrors`: PostHog API errors
- `retryAttempts`: Retry operations

View metrics on shutdown:

```
[PostHogTransport] Final metrics: {
  logsReceived: 1250,
  logsSent: 1248,
  logsDropped: 0,
  apiMetricsSent: 450,
  parseErrors: 0,
  sendErrors: 2,
  retryAttempts: 2
}
```

## Best Practices

1. **Use structured logging** - Include context objects
2. **Add request IDs** - Enable request tracing
3. **Include user context** - Track user-specific issues
4. **Use appropriate log levels** - Don't over-log
5. **Add performance metrics** - Include duration for operations
6. **Leverage audit logs** - Track important actions

## Next Steps

1. ✅ Deploy the updated transport
2. ✅ Verify events in PostHog
3. ✅ Create your first dashboard
4. ✅ Set up error alerts
5. ✅ Explore log search capabilities

For detailed analytics examples, see [POSTHOG_ANALYTICS.md](./POSTHOG_ANALYTICS.md)
