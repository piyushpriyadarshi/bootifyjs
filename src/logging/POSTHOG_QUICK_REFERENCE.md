# PostHog Quick Reference - API Analytics

## 🎯 Essential Metrics (Copy-Paste Ready)

### 1. Total API Hits (24h)

```
Event: api_request
Show: Total count
Time: Last 24 hours
Display: Number
```

### 2. Average Response Time

```
Event: api_request
Show: Average of response_time_ms
Time: Last 24 hours
Display: Number (add "ms" suffix)
```

### 3. Error Rate %

```
Series A: api_request → Total count
Series B: api_request → Total count → Filter: is_error = true
Formula: (B / A) * 100
Display: Number (add "%" suffix)
```

### 4. Total Errors

```
Event: api_request
Filter: is_error = true
Show: Total count
Display: Number
```

### 5. Active Users

```
Event: api_request
Show: Unique user_id
Time: Last 24 hours
Display: Number
```

---

## 📊 Complete Endpoint Summary Table

**The Most Useful Query - Shows Everything!**

```
Event: api_request
Display: Table
Group by: endpoint
Columns:
  1. endpoint (breakdown)
  2. Total count
  3. Average response_time_ms
  4. Count where is_error = true
  5. Count where is_client_error = true
  6. Count where is_server_error = true
Sort: Total count (descending)
Time: Last 24 hours
```

**Result:**

```
Endpoint              Hits    Avg RT   Errors   4xx   5xx
POST /api/orders     15,234   156ms      152   145     7
GET /api/users       12,456    45ms       25    23     2
GET /api/products     8,901    89ms       45    42     3
```

---

## 🔥 Top 10 Most Used Endpoints

```
Event: api_request
Show: Total count
Break down by: endpoint
Sort: Descending
Limit: 10
Display: Bar chart
```

---

## 🐌 Slowest Endpoints

```
Event: api_request
Show: Average of response_time_ms
Break down by: endpoint
Sort: Descending
Limit: 10
Display: Table
```

---

## ⚠️ Highest Error Rate Endpoints

```
Series A: api_request → Count → Break down by: endpoint
Series B: api_request → Count → Filter: is_error = true → Break down by: endpoint
Formula: (B / A) * 100
Display: Table
Sort: Formula (descending)
```

---

## 📈 Response Time Trend (24h)

```
Event: api_request
Show: Average of response_time_ms
Interval: Hour
Time: Last 24 hours
Display: Line chart
```

---

## 🚨 Error Trend (24h)

```
Event: api_request
Filter: is_error = true
Show: Total count
Interval: Hour
Time: Last 24 hours
Display: Line chart
```

---

## 🔍 Find Slow Requests (>1 second)

```
Event: api_request
Filter: response_time_ms > 1000
Show: Total count
Break down by: endpoint
Display: Table
Sort: Descending
```

---

## 💥 Error Breakdown by Status Code

```
Event: api_request
Filter: is_error = true
Show: Total count
Break down by: status_code
Display: Pie chart
```

---

## 👥 Top Users by Activity

```
Event: api_request
Show: Total count
Break down by: user_id
Sort: Descending
Limit: 20
Display: Table
```

---

## 📊 Response Time Distribution

Create 5 separate series with filters:

```
Series 1: response_time_ms < 50 (label: "0-50ms Fast")
Series 2: response_time_ms >= 50 AND < 100 (label: "50-100ms Good")
Series 3: response_time_ms >= 100 AND < 200 (label: "100-200ms OK")
Series 4: response_time_ms >= 200 AND < 500 (label: "200-500ms Slow")
Series 5: response_time_ms >= 500 (label: "500ms+ Very Slow")
Display: Bar chart
```

---

## 🎨 Recommended Dashboard Layout

```
Row 1: [Total Hits] [Avg Response Time] [Error Rate %] [Active Users]
Row 2: [Endpoint Summary Table - Full Width]
Row 3: [Response Time Trend - Full Width]
Row 4: [Request Volume by Endpoint - Full Width]
Row 5: [Error Rate Trend - Full Width]
```

---

## 🚀 Quick Filters

Add these as dashboard filters for interactive exploration:

- **Time Range:** Last 24h, Last 7d, Last 30d
- **Endpoint:** Filter by specific endpoint
- **Status Code:** Filter by status code
- **User ID:** Filter by specific user
- **Service:** Filter by service name
- **Environment:** Filter by environment (prod, staging, dev)

---

## 💡 Pro Tips

1. **Pin your dashboard** for quick access
2. **Set up alerts** for error rate > 5%
3. **Export to CSV** for deeper analysis
4. **Use formulas** for custom calculations
5. **Break down by multiple properties** for detailed insights

---

## 🔗 Event Properties Reference

### api_request Event Properties

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

  // Context
  service: "my-api",
  instance_id: "instance-1",
  environment: "production",
  request_id: "req-123",
  trace_id: "trace-456",

  // User info
  user_id: "user-123",
  username: "john@example.com",
  ip: "192.168.1.1",
  user_agent: "Mozilla/5.0...",

  // Timestamp
  timestamp: "2025-01-11T10:30:00.000Z"
}
```

---

## 📱 Mobile App - Quick Access

Save these as "Saved Insights" in PostHog mobile app:

1. Service Health (Total hits, Avg RT, Error rate)
2. Top Endpoints (Bar chart)
3. Error Trend (Line chart)
4. Slow Requests (Table)

---

## 🎯 One-Liner Queries

**Total hits today:**

```
api_request | count | today
```

**Avg response time:**

```
api_request | avg(response_time_ms) | 24h
```

**Error rate:**

```
api_request | (count where is_error) / count * 100 | 24h
```

**Slowest endpoint:**

```
api_request | avg(response_time_ms) by endpoint | sort desc | limit 1
```

---

## 🔧 Troubleshooting Queries

### No data showing?

```
Event: api_request
Time: All time
Show: Total count
```

If this shows 0, check your transport configuration.

### Missing properties?

```
Event: api_request
Show: Property values for response_time_ms
```

This will show if the property exists.

### Check event structure:

```
Event: api_request
Display: Raw data
Limit: 10
```

This shows the actual event structure.

---

## 📚 Related Documentation

- [POSTHOG_QUERIES.md](./POSTHOG_QUERIES.md) - Detailed query guide
- [POSTHOG_ANALYTICS.md](./POSTHOG_ANALYTICS.md) - Analytics guide
- [POSTHOG_BATCH_API.md](./POSTHOG_BATCH_API.md) - Implementation details

---

**Need help?** Check PostHog docs: https://posthog.com/docs/product-analytics
