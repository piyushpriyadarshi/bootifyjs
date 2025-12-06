# PostHog Batch API Implementation

## Overview

The PostHog transport now uses the `/batch` API endpoint for optimal performance, sending multiple events in a single HTTP request instead of individual calls.

## Key Improvements

### 1. Batch API Integration

- **50 events per batch** (configurable)
- **2-second flush interval** (configurable)
- **Single HTTP request** for multiple events
- **Automatic size management** (respects 20MB limit)
- **Exponential backoff retry** (3 attempts)

### 2. Smart Event Filtering

- **Access logs** (`logType='access_log'`) → Create ONLY `api_request` events
- **Other logs** → Create ONLY `log` events
- **No duplicate events** for HTTP requests

## Performance Comparison

### Before (Individual API Calls)

```
100 logs = 100 HTTP requests
Network time: ~100 × 50ms = 5,000ms
PostHog API load: 100 requests/second
```

### After (Batch API)

```
100 logs = 2 HTTP requests (50 events per batch)
Network time: ~2 × 50ms = 100ms
PostHog API load: 2 requests/second
Improvement: 50x reduction in network calls
```

## How It Works

### 1. Event Buffering

```
Log arrives → Determine event type → Add to buffer
                                           ↓
                                    Buffer size check
                                           ↓
                        ┌──────────────────┴──────────────────┐
                        ↓                                      ↓
                 Buffer full (50 events)              Timer expires (2s)
                        ↓                                      ↓
                        └──────────────────┬──────────────────┘
                                           ↓
                                    Flush to PostHog
```

### 2. Batch Request Format

```json
POST https://us.i.posthog.com/batch/
Content-Type: application/json

{
  "api_key": "phc_your_api_key",
  "batch": [
    {
      "event": "log",
      "distinct_id": "user-123",
      "timestamp": "2025-01-11T10:30:00.000Z",
      "properties": {
        "level": "info",
        "message": "User created successfully",
        "service": "my-api",
        "request_id": "req-123"
      }
    },
    {
      "event": "api_request",
      "distinct_id": "user-456",
      "timestamp": "2025-01-11T10:30:01.000Z",
      "properties": {
        "method": "POST",
        "url": "/api/users",
        "status_code": 201,
        "response_time_ms": 45
      }
    }
  ]
}
```

### 3. Size Management

```
Batch size check
      ↓
Size < 18MB? ──Yes──> Send as single batch
      ↓
     No
      ↓
Split into smaller batches
      ↓
Send each batch sequentially
```

## Event Filtering Logic

### Decision Matrix

| Log Type        | logType Value           | Creates log event? | Creates api_request event? |
| --------------- | ----------------------- | ------------------ | -------------------------- |
| Access Log      | `"access_log"`          | ❌ NO              | ✅ YES                     |
| Application Log | `"application"`         | ✅ YES             | ❌ NO                      |
| Audit Log       | `"audit"`               | ✅ YES             | ❌ NO                      |
| Error Log       | any (except access_log) | ✅ YES             | ❌ NO                      |

### Code Example

```javascript
// Access log - creates ONLY api_request event
logger.info("Request completed", {
  logType: "access_log", // ← Key identifier
  method: "GET",
  url: "/api/users",
  statusCode: 200,
  responseTime: 45,
});
// Result: 1 api_request event (no log event)

// Application log - creates ONLY log event
logger.info("User created", {
  userId: "user-123",
  email: "john@example.com",
});
// Result: 1 log event (no api_request event)

// Error log - creates ONLY log event
logger.error("Database connection failed", {
  error: new Error("Connection timeout"),
  component: "DatabaseService",
});
// Result: 1 log event (no api_request event)
```

## Configuration

### Default Settings

```javascript
{
  BATCH_SIZE: 50,              // Events per batch
  FLUSH_INTERVAL: 2000,        // Flush every 2 seconds
  MAX_RETRIES: 3,              // Retry attempts
  RETRY_DELAY: 1000,           // Initial retry delay (ms)
  RETRY_BACKOFF: 2,            // Exponential backoff multiplier
  MAX_BATCH_SIZE_MB: 18,       // Max batch size (18MB safety margin)
}
```

### Custom Configuration

```typescript
// In your logging configuration
{
  type: 'posthog',
  apiKey: process.env.POSTHOG_API_KEY,
  host: process.env.POSTHOG_HOST,
  serviceName: 'my-api',
  config: {
    BATCH_SIZE: 100,           // Larger batches
    FLUSH_INTERVAL: 5000,      // Flush every 5 seconds
    MAX_RETRIES: 5,            // More retry attempts
    RETRY_DELAY: 2000,         // Longer initial delay
  }
}
```

## Retry Logic

### Exponential Backoff

```
Attempt 1: Delay = 1000ms × 2^0 = 1000ms
Attempt 2: Delay = 1000ms × 2^1 = 2000ms
Attempt 3: Delay = 1000ms × 2^2 = 4000ms
```

### Retry Flow

```
Send batch
    ↓
  Success? ──Yes──> Update metrics, done
    ↓
   No
    ↓
Retry count < MAX_RETRIES? ──No──> Drop events, log error
    ↓
   Yes
    ↓
Wait (exponential backoff)
    ↓
Retry send
```

## Metrics Tracking

### Available Metrics

```javascript
{
  logsReceived: 1250,           // Total logs processed
  logEventsSent: 800,           // log events sent
  apiRequestEventsSent: 450,    // api_request events sent
  logsDropped: 0,               // Events dropped after retries
  batchesSent: 25,              // Number of batch API calls
  parseErrors: 0,               // Log parsing errors
  sendErrors: 2,                // API send errors
  retryAttempts: 2,             // Total retry operations
  totalBatchSizeBytes: 5242880, // Total bytes sent (5MB)
}
```

### Viewing Metrics

Metrics are logged on shutdown:

```
[PostHogTransport] Final metrics: {
  logsReceived: 1250,
  logEventsSent: 800,
  apiRequestEventsSent: 450,
  logsDropped: 0,
  batchesSent: 25,
  parseErrors: 0,
  sendErrors: 2,
  retryAttempts: 2,
  totalBatchSizeBytes: 5242880
}
```

### Calculating Efficiency

```javascript
// Average events per batch
avgEventsPerBatch = (logEventsSent + apiRequestEventsSent) / batchesSent;
// Example: (800 + 450) / 25 = 50 events/batch

// Average batch size
avgBatchSizeKB = totalBatchSizeBytes / batchesSent / 1024;
// Example: (5242880 / 25) / 1024 = 204.8 KB/batch

// Network efficiency
networkReduction = logsReceived / batchesSent;
// Example: 1250 / 25 = 50x reduction
```

## Error Handling

### Scenarios

1. **Network Error**

   - Retry with exponential backoff
   - Max 3 attempts
   - Drop events if all retries fail

2. **Batch Too Large (>20MB)**

   - Automatically split into smaller batches
   - Send each batch sequentially
   - Log warning message

3. **Parse Error**

   - Skip malformed log
   - Increment parseErrors metric
   - Continue processing

4. **PostHog API Error (4xx/5xx)**
   - Retry with backoff
   - Log error details
   - Drop after max retries

## Best Practices

### 1. Set Appropriate Batch Size

```javascript
// High-volume service (1000+ logs/sec)
BATCH_SIZE: 100,
FLUSH_INTERVAL: 1000,

// Medium-volume service (100-1000 logs/sec)
BATCH_SIZE: 50,
FLUSH_INTERVAL: 2000,

// Low-volume service (<100 logs/sec)
BATCH_SIZE: 25,
FLUSH_INTERVAL: 5000,
```

### 2. Use logType Correctly

```javascript
// ✅ Correct - Access log
logger.info("Request completed", {
  logType: "access_log",
  method: "GET",
  url: "/api/users",
  statusCode: 200,
});

// ❌ Incorrect - Missing logType
logger.info("Request completed", {
  method: "GET",
  url: "/api/users",
  statusCode: 200,
});
// This will create BOTH log and api_request events
```

### 3. Monitor Metrics

- Check `logsDropped` - should be 0
- Monitor `sendErrors` - investigate if high
- Track `batchesSent` - optimize batch size
- Review `avgBatchSize` - ensure efficient batching

### 4. Handle Graceful Shutdown

The transport automatically flushes all pending events on shutdown:

```javascript
process.on("SIGTERM", async () => {
  // Transport will flush all events before closing
  await app.close();
});
```

## Troubleshooting

### Events Not Appearing in PostHog

1. Check API key and host configuration
2. Verify network connectivity
3. Check console for batch send errors
4. Review metrics for `sendErrors` and `logsDropped`

### High Memory Usage

1. Reduce `BATCH_SIZE` (e.g., from 50 to 25)
2. Decrease `FLUSH_INTERVAL` (e.g., from 2000 to 1000)
3. Check for event buffer buildup

### Duplicate Events

1. Ensure access logs have `logType: 'access_log'`
2. Check middleware is setting logType correctly
3. Review event creation logic

### Slow Performance

1. Increase `BATCH_SIZE` for fewer HTTP requests
2. Increase `FLUSH_INTERVAL` for less frequent flushes
3. Monitor network latency to PostHog

## Migration Checklist

- [x] Update PostHog transport to use batch API
- [x] Add event filtering logic (access_log detection)
- [x] Configure batch size and flush interval
- [x] Test with production-like load
- [x] Monitor metrics after deployment
- [x] Set up alerts for `logsDropped` and `sendErrors`
- [x] Verify no duplicate events in PostHog
- [x] Confirm network efficiency improvement

## Additional Resources

- [PostHog Batch API Documentation](https://posthog.com/docs/api/post-only-endpoints#batch)
- [PostHog Event Ingestion](https://posthog.com/docs/integrate/ingest-live-data)
- [PostHog Rate Limits](https://posthog.com/docs/api/overview#rate-limiting)
