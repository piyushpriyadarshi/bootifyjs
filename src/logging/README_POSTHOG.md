# PostHog Integration - Complete Documentation

Welcome to the complete PostHog integration documentation for the Bootify framework.

## 📚 Documentation Index

### 🚀 Getting Started

1. **[POSTHOG_STEP_BY_STEP.md](./POSTHOG_STEP_BY_STEP.md)** - **START HERE!**
   - Step-by-step guide to create your first dashboard
   - Screenshots and detailed instructions
   - 10-minute setup
   - Perfect for beginners

### 📊 Query Guides

2. **[POSTHOG_QUERIES.md](./POSTHOG_QUERIES.md)** - Complete Query Reference

   - All available queries with examples
   - Service summary statistics
   - Endpoint performance analysis
   - Error tracking queries
   - User activity analysis
   - SQL-style query reference

3. **[POSTHOG_QUICK_REFERENCE.md](./POSTHOG_QUICK_REFERENCE.md)** - Quick Reference Card
   - Copy-paste ready queries
   - One-liner queries
   - Essential metrics
   - Troubleshooting queries
   - Mobile app quick access

### 🔧 Implementation

4. **[POSTHOG_BATCH_API.md](./POSTHOG_BATCH_API.md)** - Batch API Implementation

   - How batch API works
   - Performance comparison
   - Event filtering logic
   - Configuration options
   - Error handling
   - Metrics tracking

5. **[POSTHOG_IMPLEMENTATION_SUMMARY.md](./POSTHOG_IMPLEMENTATION_SUMMARY.md)** - Implementation Summary
   - What was implemented
   - Performance improvements
   - Key features
   - Configuration guide
   - Success criteria

### 📈 Analytics

6. **[POSTHOG_ANALYTICS.md](./POSTHOG_ANALYTICS.md)** - Analytics Guide

   - Creating insights and dashboards
   - Advanced queries
   - Alert configuration
   - Best practices
   - Example dashboards

7. **[POSTHOG_MIGRATION.md](./POSTHOG_MIGRATION.md)** - Migration Guide
   - Before vs After comparison
   - Migration steps
   - What changed
   - Benefits

---

## 🎯 Quick Start (5 Minutes)

### 1. Verify Events Are Being Sent

Go to PostHog → Events → Search for `api_request`

You should see events like:

```json
{
  "event": "api_request",
  "properties": {
    "method": "GET",
    "url": "/api/users",
    "status_code": 200,
    "response_time_ms": 45
  }
}
```

### 2. Create Your First Insight

**Total API Hits:**

1. Go to Insights → New Insight → Trends
2. Event: `api_request`
3. Show: Total count
4. Time: Last 24 hours
5. Display: Number
6. Save

### 3. Create a Dashboard

Follow the [Step-by-Step Guide](./POSTHOG_STEP_BY_STEP.md) to create a complete dashboard.

---

## 📊 What You Can Track

### API Performance Metrics

- ✅ Total requests per endpoint
- ✅ Average response time
- ✅ Response time distribution (P50, P95, P99)
- ✅ Slowest endpoints
- ✅ Request volume trends

### Error Monitoring

- ✅ Error rate (overall and per endpoint)
- ✅ 4xx vs 5xx errors
- ✅ Error trends over time
- ✅ Error breakdown by status code
- ✅ Most error-prone endpoints

### User Analytics

- ✅ Active users
- ✅ Requests per user
- ✅ User journey analysis
- ✅ Geographic distribution
- ✅ Device/browser breakdown

### Service Health

- ✅ Service availability
- ✅ Traffic patterns
- ✅ Performance degradation detection
- ✅ Anomaly detection
- ✅ Real-time monitoring

---

## 🎨 Sample Dashboard

```
┌─────────────────────────────────────────────────────────┐
│              API Performance Dashboard                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐│
│  │  Total   │  │   Avg    │  │  Error   │  │ Active  ││
│  │  Hits    │  │ Response │  │   Rate   │  │  Users  ││
│  │ 125,432  │  │   45ms   │  │  0.5%    │  │  1,234  ││
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘│
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Endpoint Performance (Table)                           │
│  ┌────────────────────────────────────────────────┐    │
│  │ Endpoint        Hits   Avg RT  Errors  Rate   │    │
│  │ POST /orders   15,234   156ms    152   1.0%   │    │
│  │ GET /users     12,456    45ms     25   0.2%   │    │
│  │ GET /products   8,901    89ms     45   0.5%   │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Response Time Trend (Line Chart)                       │
│  [Graph showing response time over last 24 hours]       │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Request Volume by Endpoint (Stacked Area)              │
│  [Graph showing request volume per endpoint]            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🔍 Most Useful Queries

### 1. Complete Endpoint Summary

Shows everything you need in one table:

- Total hits
- Average response time
- Total errors
- 4xx errors
- 5xx errors
- Error rate %

**See:** [POSTHOG_QUERIES.md - Section 3](./POSTHOG_QUERIES.md#3-detailed-endpoint-statistics)

### 2. Error Rate by Endpoint

Identify problematic endpoints quickly.

**See:** [POSTHOG_QUERIES.md - Section 2](./POSTHOG_QUERIES.md#error-rate-by-endpoint)

### 3. Slow Requests Analysis

Find requests taking >1 second.

**See:** [POSTHOG_QUERIES.md - Section 6](./POSTHOG_QUERIES.md#6-slow-requests-analysis)

### 4. Response Time Trend

Monitor performance over time.

**See:** [POSTHOG_QUERIES.md - Section 4](./POSTHOG_QUERIES.md#response-time-trend-last-24-hours)

---

## ⚙️ Configuration

### Default Settings

```javascript
{
  BATCH_SIZE: 50,              // Events per batch
  FLUSH_INTERVAL: 2000,        // Flush every 2 seconds
  MAX_RETRIES: 3,              // Retry attempts
  RETRY_DELAY: 1000,           // Initial retry delay
  RETRY_BACKOFF: 2,            // Exponential multiplier
  MAX_BATCH_SIZE_MB: 18,       // Max batch size
}
```

### Custom Configuration

```typescript
{
  type: 'posthog',
  apiKey: process.env.POSTHOG_API_KEY,
  host: process.env.POSTHOG_HOST,
  serviceName: 'my-api',
  config: {
    BATCH_SIZE: 100,           // Larger batches
    FLUSH_INTERVAL: 5000,      // Less frequent flushes
  }
}
```

**See:** [POSTHOG_BATCH_API.md - Configuration](./POSTHOG_BATCH_API.md#configuration)

---

## 🎯 Event Types

### 1. log Events

Every log message (except access logs):

```json
{
  "event": "log",
  "properties": {
    "level": "info",
    "message": "User created successfully",
    "service": "my-api",
    "request_id": "req-123",
    "user_id": "user-123"
  }
}
```

### 2. api_request Events

HTTP access logs only:

```json
{
  "event": "api_request",
  "properties": {
    "method": "POST",
    "url": "/api/users",
    "status_code": 201,
    "response_time_ms": 45,
    "is_error": false
  }
}
```

**Important:** Access logs (`logType='access_log'`) create ONLY `api_request` events, not `log` events.

**See:** [POSTHOG_BATCH_API.md - Event Filtering](./POSTHOG_BATCH_API.md#event-filtering-logic)

---

## 🚨 Alerts

### Recommended Alerts

1. **High Error Rate**

   - Condition: Error rate > 5% for 5 minutes
   - Action: Send Slack notification

2. **Slow Response Time**

   - Condition: Avg response time > 500ms for 10 minutes
   - Action: Send email alert

3. **Service Down**
   - Condition: Total requests = 0 for 5 minutes
   - Action: Send critical alert

**See:** [POSTHOG_QUERIES.md - Section 12](./POSTHOG_QUERIES.md#12-alerts-configuration)

---

## 📈 Performance

### Before (Individual API Calls)

```
100 logs = 100 HTTP requests
Network time: ~5,000ms
```

### After (Batch API)

```
100 logs = 2 HTTP requests
Network time: ~100ms
Improvement: 50x reduction
```

**See:** [POSTHOG_BATCH_API.md - Performance](./POSTHOG_BATCH_API.md#performance-comparison)

---

## 🐛 Troubleshooting

### No data in PostHog?

1. Check API key and host configuration
2. Verify events in PostHog Events page
3. Check console for transport errors
4. Review metrics in shutdown logs

### Duplicate events?

1. Ensure access logs have `logType: 'access_log'`
2. Check middleware is setting logType correctly

### High memory usage?

1. Reduce `BATCH_SIZE` (e.g., 50 → 25)
2. Decrease `FLUSH_INTERVAL` (e.g., 2000 → 1000)

**See:** [POSTHOG_BATCH_API.md - Troubleshooting](./POSTHOG_BATCH_API.md#troubleshooting)

---

## 📱 Mobile Access

1. Download PostHog mobile app
2. Log in with your account
3. Access dashboards on the go
4. Get push notifications for alerts

---

## 🔗 External Resources

- [PostHog Documentation](https://posthog.com/docs)
- [PostHog Insights Guide](https://posthog.com/docs/product-analytics/insights)
- [PostHog API Reference](https://posthog.com/docs/api)
- [PostHog Batch API](https://posthog.com/docs/api/post-only-endpoints#batch)

---

## 📝 Cheat Sheet

```
┌─────────────────────────────────────────────────────────┐
│ Common Queries                                          │
├─────────────────────────────────────────────────────────┤
│ Total Hits        │ api_request → Count                │
│ Avg Response Time │ api_request → Avg(response_time)   │
│ Error Rate        │ (errors / total) * 100             │
│ Active Users      │ api_request → Unique(user_id)      │
│ Top Endpoints     │ api_request → Count by endpoint    │
│ Slow Requests     │ api_request → Filter RT > 1000ms   │
└─────────────────────────────────────────────────────────┘
```

---

## 🎓 Learning Path

1. **Day 1:** [Step-by-Step Guide](./POSTHOG_STEP_BY_STEP.md) - Create your first dashboard
2. **Day 2:** [Quick Reference](./POSTHOG_QUICK_REFERENCE.md) - Learn essential queries
3. **Day 3:** [Complete Queries](./POSTHOG_QUERIES.md) - Explore all available queries
4. **Day 4:** [Analytics Guide](./POSTHOG_ANALYTICS.md) - Advanced analytics
5. **Day 5:** Set up alerts and automation

---

## ✅ Checklist

- [ ] PostHog transport configured
- [ ] Events appearing in PostHog
- [ ] First dashboard created
- [ ] Essential metrics added
- [ ] Alerts configured
- [ ] Team has access
- [ ] Mobile app installed
- [ ] Documentation reviewed

---

## 🎉 Success!

You now have complete visibility into your API performance with:

- ✅ Real-time monitoring
- ✅ Historical analysis
- ✅ Error tracking
- ✅ User analytics
- ✅ Performance insights

**Happy monitoring! 🚀**

---

**Need help?** Check the specific guides above or visit [PostHog Community](https://posthog.com/questions)
