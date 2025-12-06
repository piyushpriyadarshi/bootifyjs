# PostHog Queries for API Analytics

This guide provides ready-to-use PostHog queries and insights for monitoring your service's API performance.

## Quick Start Dashboard

Create a dashboard with these insights to get a complete overview of your API performance.

---

## 1. Service Summary Statistics

### Total API Hits (Last 24 Hours)

**Insight Type:** Number

**Configuration:**

```
Event: api_request
Aggregate: Total count
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Show: Total count
4. Date range: Last 24 hours
5. Display as: Number

---

### Average Response Time

**Insight Type:** Number

**Configuration:**

```
Event: api_request
Aggregate: Average of response_time_ms
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Show: Average of property `response_time_ms`
4. Date range: Last 24 hours
5. Display as: Number

---

### Error Rate (Percentage)

**Insight Type:** Formula

**Configuration:**

```
Event: api_request
Formula: (B / A) * 100
Where:
  A = Total count of api_request
  B = Total count of api_request where is_error = true
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Series A: Event `api_request`, Total count
3. Series B: Event `api_request`, Total count, Filter: `is_error = true`
4. Formula: `(B / A) * 100`
5. Display as: Number with "%" suffix

---

### Total Errors

**Insight Type:** Number

**Configuration:**

```
Event: api_request
Filter: is_error = true
Aggregate: Total count
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Add filter: `is_error = true`
4. Show: Total count
5. Display as: Number

---

## 2. API Performance by Endpoint

### Requests per Endpoint (Top 10)

**Insight Type:** Bar Chart

**Configuration:**

```
Event: api_request
Aggregate: Total count
Group by: endpoint
Order by: Total count descending
Limit: 10
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Show: Total count
4. Break down by: `endpoint`
5. Display as: Bar chart
6. Sort: Descending
7. Limit: 10

**Example Output:**

```
POST /api/orders        15,234 requests
GET /api/users          12,456 requests
GET /api/products        8,901 requests
POST /api/payments       5,678 requests
GET /api/users/:id       4,321 requests
```

---

### Average Response Time by Endpoint

**Insight Type:** Table

**Configuration:**

```
Event: api_request
Metrics:
  - Total count
  - Average of response_time_ms
  - Minimum of response_time_ms
  - Maximum of response_time_ms
Group by: endpoint
Order by: Average response_time_ms descending
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Show multiple metrics:
   - Total count
   - Average of `response_time_ms`
   - Min of `response_time_ms`
   - Max of `response_time_ms`
4. Break down by: `endpoint`
5. Display as: Table
6. Sort by: Average response_time_ms (descending)

**Example Output:**

```
Endpoint                Count    Avg (ms)   Min (ms)   Max (ms)
POST /api/payments      5,678    245        45         1,234
POST /api/orders       15,234    156        23           987
GET /api/products       8,901     89        12           456
GET /api/users         12,456     45         8           234
```

---

### Error Rate by Endpoint

**Insight Type:** Table

**Configuration:**

```
Event: api_request
Metrics:
  - Total count (as "Total Requests")
  - Count where is_error = true (as "Errors")
  - Formula: (Errors / Total) * 100 (as "Error Rate %")
Group by: endpoint
Order by: Error Rate descending
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Series A: Event `api_request`, Total count, Break down by `endpoint`
3. Series B: Event `api_request`, Total count, Filter `is_error = true`, Break down by `endpoint`
4. Formula: `(B / A) * 100`
5. Display as: Table
6. Sort by: Formula (descending)

**Example Output:**

```
Endpoint                Total    Errors    Error Rate %
POST /api/payments      5,678       142         2.50%
POST /api/orders       15,234       152         1.00%
GET /api/products       8,901        45         0.51%
GET /api/users         12,456        25         0.20%
```

---

## 3. Detailed Endpoint Statistics

### Complete Endpoint Summary Table

**Insight Type:** Table

**Configuration:**

```
Event: api_request
Metrics:
  1. Total count (Total Hits)
  2. Average of response_time_ms (Avg Response Time)
  3. Count where is_error = true (Total Errors)
  4. Count where is_client_error = true (4xx Errors)
  5. Count where is_server_error = true (5xx Errors)
  6. Formula: (Errors / Total) * 100 (Error Rate %)
Group by: endpoint
Order by: Total count descending
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Data Table
2. Event: `api_request`
3. Add columns:
   - `endpoint` (Group by)
   - Total count
   - Average `response_time_ms`
   - Count where `is_error = true`
   - Count where `is_client_error = true`
   - Count where `is_server_error = true`
4. Add formula column: `(errors / total) * 100`
5. Sort by: Total count (descending)

**Example Output:**

```
Endpoint              Total    Avg RT   Errors   4xx   5xx   Error %
POST /api/orders     15,234    156ms      152   145     7     1.00%
GET /api/users       12,456     45ms       25    23     2     0.20%
GET /api/products     8,901     89ms       45    42     3     0.51%
POST /api/payments    5,678    245ms      142   120    22     2.50%
GET /api/users/:id    4,321     67ms       18    15     3     0.42%
```

---

## 4. Time-Series Analysis

### Response Time Trend (Last 24 Hours)

**Insight Type:** Line Chart

**Configuration:**

```
Event: api_request
Aggregate: Average of response_time_ms
Interval: Hourly
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Show: Average of `response_time_ms`
4. Interval: Hour
5. Display as: Line chart
6. Date range: Last 24 hours

---

### Request Volume Over Time

**Insight Type:** Line Chart

**Configuration:**

```
Event: api_request
Aggregate: Total count
Break down by: endpoint (top 5)
Interval: Hourly
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Show: Total count
4. Break down by: `endpoint`
5. Limit: 5
6. Interval: Hour
7. Display as: Line chart (stacked)

---

### Error Rate Over Time

**Insight Type:** Line Chart

**Configuration:**

```
Event: api_request
Formula: (B / A) * 100
Where:
  A = Total count
  B = Count where is_error = true
Interval: Hourly
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Series A: Event `api_request`, Total count
3. Series B: Event `api_request`, Count where `is_error = true`
4. Formula: `(B / A) * 100`
5. Interval: Hour
6. Display as: Line chart

---

## 5. Performance Distribution

### Response Time Distribution (Histogram)

**Insight Type:** Bar Chart

**Configuration:**

```
Event: api_request
Property: response_time_ms
Buckets:
  - 0-50ms (Fast)
  - 50-100ms (Good)
  - 100-200ms (Acceptable)
  - 200-500ms (Slow)
  - 500ms+ (Very Slow)
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Add filters for each bucket:
   - Filter 1: `response_time_ms < 50`
   - Filter 2: `response_time_ms >= 50 AND response_time_ms < 100`
   - Filter 3: `response_time_ms >= 100 AND response_time_ms < 200`
   - Filter 4: `response_time_ms >= 200 AND response_time_ms < 500`
   - Filter 5: `response_time_ms >= 500`
4. Display as: Bar chart

---

### Status Code Distribution

**Insight Type:** Pie Chart

**Configuration:**

```
Event: api_request
Aggregate: Total count
Group by: status_code
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Show: Total count
4. Break down by: `status_code`
5. Display as: Pie chart

---

## 6. Slow Requests Analysis

### Slowest Endpoints (P95 Response Time)

**Insight Type:** Table

**Configuration:**

```
Event: api_request
Metrics:
  - Total count
  - Average of response_time_ms
  - 95th percentile of response_time_ms
  - Maximum of response_time_ms
Group by: endpoint
Order by: 95th percentile descending
Limit: 10
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Event: `api_request`
3. Show multiple metrics:
   - Total count
   - Average `response_time_ms`
   - 95th percentile `response_time_ms`
   - Max `response_time_ms`
4. Break down by: `endpoint`
5. Display as: Table
6. Sort by: 95th percentile (descending)
7. Limit: 10

---

### Requests Slower Than 1 Second

**Insight Type:** Table

**Configuration:**

```
Event: api_request
Filter: response_time_ms > 1000
Aggregate: Total count
Group by: endpoint
Order by: Total count descending
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Add filter: `response_time_ms > 1000`
4. Show: Total count
5. Break down by: `endpoint`
6. Display as: Table
7. Sort by: Count (descending)

---

## 7. Error Analysis

### Error Breakdown by Type

**Insight Type:** Bar Chart

**Configuration:**

```
Event: api_request
Filter: is_error = true
Aggregate: Total count
Group by: status_code
Order by: Total count descending
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Add filter: `is_error = true`
4. Show: Total count
5. Break down by: `status_code`
6. Display as: Bar chart
7. Sort: Descending

---

### 4xx vs 5xx Errors by Endpoint

**Insight Type:** Stacked Bar Chart

**Configuration:**

```
Event: api_request
Series:
  - Count where is_client_error = true (4xx)
  - Count where is_server_error = true (5xx)
Group by: endpoint
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Series A: Event `api_request`, Count where `is_client_error = true`
3. Series B: Event `api_request`, Count where `is_server_error = true`
4. Break down by: `endpoint`
5. Display as: Stacked bar chart

---

## 8. User Activity Analysis

### Active Users (Last 24 Hours)

**Insight Type:** Number

**Configuration:**

```
Event: api_request
Aggregate: Unique user_id
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Show: Unique `user_id`
4. Display as: Number

---

### Top Users by Request Count

**Insight Type:** Table

**Configuration:**

```
Event: api_request
Aggregate: Total count
Group by: user_id
Order by: Total count descending
Limit: 20
Time Range: Last 24 hours
```

**PostHog UI Steps:**

1. Create New Insight → Trends
2. Select event: `api_request`
3. Show: Total count
4. Break down by: `user_id`
5. Display as: Table
6. Sort: Descending
7. Limit: 20

---

## 9. Complete Dashboard Configuration

### Recommended Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│                  API Performance Dashboard                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Total   │  │   Avg    │  │  Error   │  │  Active  │  │
│  │  Hits    │  │ Response │  │   Rate   │  │  Users   │  │
│  │ 125,432  │  │   45ms   │  │  0.5%    │  │  1,234   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Endpoint Performance Summary (Table)                       │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Endpoint        Hits   Avg RT  Errors  Error %    │   │
│  │ POST /orders   15,234   156ms    152    1.00%     │   │
│  │ GET /users     12,456    45ms     25    0.20%     │   │
│  │ GET /products   8,901    89ms     45    0.51%     │   │
│  └────────────────────────────────────────────────────┘   │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Response Time Trend (Line Chart)                           │
│  [Graph showing response time over last 24 hours]           │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Request Volume by Endpoint (Stacked Area Chart)            │
│  [Graph showing request volume per endpoint]                │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Error Rate Over Time (Line Chart)                          │
│  [Graph showing error percentage over time]                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 10. SQL-Style Query Reference

For those familiar with SQL, here's how PostHog queries map to SQL:

### Total Hits

```sql
SELECT COUNT(*) as total_hits
FROM api_request
WHERE timestamp >= NOW() - INTERVAL '24 hours';
```

### Average Response Time

```sql
SELECT AVG(response_time_ms) as avg_response_time
FROM api_request
WHERE timestamp >= NOW() - INTERVAL '24 hours';
```

### Error Rate

```sql
SELECT
  COUNT(*) as total_requests,
  SUM(CASE WHEN is_error = true THEN 1 ELSE 0 END) as total_errors,
  (SUM(CASE WHEN is_error = true THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as error_rate
FROM api_request
WHERE timestamp >= NOW() - INTERVAL '24 hours';
```

### Stats by Endpoint

```sql
SELECT
  endpoint,
  COUNT(*) as total_hits,
  AVG(response_time_ms) as avg_response_time,
  SUM(CASE WHEN is_error = true THEN 1 ELSE 0 END) as total_errors,
  (SUM(CASE WHEN is_error = true THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as error_rate,
  MIN(response_time_ms) as min_response_time,
  MAX(response_time_ms) as max_response_time,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_response_time
FROM api_request
WHERE timestamp >= NOW() - INTERVAL '24 hours'
GROUP BY endpoint
ORDER BY total_hits DESC;
```

---

## 11. Export & API Access

### Using PostHog API

You can query PostHog data programmatically:

```bash
curl -X POST https://app.posthog.com/api/projects/{project_id}/insights/trend/ \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{"id": "api_request"}],
    "properties": [],
    "date_from": "-24h",
    "interval": "hour"
  }'
```

### Export to CSV

1. Create any insight
2. Click "..." menu
3. Select "Export to CSV"
4. Download the data

---

## 12. Alerts Configuration

### High Error Rate Alert

```
Insight: Error Rate
Condition: When error rate > 5% for 5 minutes
Action: Send notification
```

### Slow Response Time Alert

```
Insight: Average Response Time
Condition: When avg response_time_ms > 500ms for 10 minutes
Action: Send notification
```

### High Traffic Alert

```
Insight: Total Requests
Condition: When total requests > 10,000 in 5 minutes
Action: Send notification
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────┐
│ Metric                  | Event         | Aggregation   │
├─────────────────────────────────────────────────────────┤
│ Total Hits              | api_request   | Count         │
│ Avg Response Time       | api_request   | Avg(RT)       │
│ Error Rate              | api_request   | Formula       │
│ Active Users            | api_request   | Unique(user)  │
│ Requests by Endpoint    | api_request   | Count by EP   │
│ Slow Requests           | api_request   | Filter RT>1s  │
│ 4xx Errors              | api_request   | Filter 4xx    │
│ 5xx Errors              | api_request   | Filter 5xx    │
└─────────────────────────────────────────────────────────┘
```

---

For more details on creating insights, visit: <https://posthog.com/docs/product-analytics/insights>
