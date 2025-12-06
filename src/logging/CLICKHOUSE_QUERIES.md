# ClickHouse Queries for PostHog API Analytics

This guide provides ClickHouse SQL queries to analyze your API performance data stored in PostHog.

## 📊 Event Structure

With the new implementation, we have two event types:

### 1. api_request Event

```json
{
  "event": "api_request",
  "distinct_id": "user-123",
  "timestamp": "2025-01-11T10:30:00.000Z",
  "properties": {
    "method": "POST",
    "url": "/api/users",
    "endpoint": "POST /api/users",
    "status_code": 201,
    "response_time_ms": 45,
    "is_error": false,
    "is_client_error": false,
    "is_server_error": false,
    "is_success": true,
    "service": "my-api",
    "request_id": "req-123",
    "user_id": "user-123"
  }
}
```

---

## 🎯 Complete Service Summary

### Query: Service Stats with All Metrics

```sql
SELECT
    -- Service overview
    COUNT(*) AS total_hits,
    COUNT(DISTINCT distinct_id) AS unique_users,

    -- Response time metrics
    AVG(JSONExtractInt(properties, 'response_time_ms')) AS avg_response_time_ms,
    quantile(0.50)(JSONExtractInt(properties, 'response_time_ms')) AS p50_response_time_ms,
    quantile(0.95)(JSONExtractInt(properties, 'response_time_ms')) AS p95_response_time_ms,
    quantile(0.99)(JSONExtractInt(properties, 'response_time_ms')) AS p99_response_time_ms,
    MIN(JSONExtractInt(properties, 'response_time_ms')) AS min_response_time_ms,
    MAX(JSONExtractInt(properties, 'response_time_ms')) AS max_response_time_ms,

    -- Error metrics
    SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) AS total_errors,
    SUM(CASE WHEN JSONExtractBool(properties, 'is_client_error') = 1 THEN 1 ELSE 0 END) AS client_errors_4xx,
    SUM(CASE WHEN JSONExtractBool(properties, 'is_server_error') = 1 THEN 1 ELSE 0 END) AS server_errors_5xx,

    -- Error rate
    ROUND(
        (SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*),
        2
    ) AS error_rate_percent,

    -- Success rate
    ROUND(
        (SUM(CASE WHEN JSONExtractBool(properties, 'is_success') = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*),
        2
    ) AS success_rate_percent,

    -- Time range
    MIN(timestamp) AS first_request,
    MAX(timestamp) AS last_request

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
```

**Example Output:**

```
total_hits: 125,432
unique_users: 1,234
avg_response_time_ms: 156
p50_response_time_ms: 89
p95_response_time_ms: 456
p99_response_time_ms: 1,234
min_response_time_ms: 12
max_response_time_ms: 5,678
total_errors: 628
client_errors_4xx: 523
server_errors_5xx: 105
error_rate_percent: 0.50
success_rate_percent: 99.50
first_request: 2025-01-10 10:30:00
last_request: 2025-01-11 10:30:00
```

---

## 📈 Complete Endpoint Summary (Group by URL)

### Query: All Stats Grouped by Endpoint

```sql
SELECT
    -- Endpoint identification
    JSONExtractString(properties, 'endpoint') AS endpoint,
    JSONExtractString(properties, 'method') AS method,
    JSONExtractString(properties, 'url') AS url,

    -- Traffic metrics
    COUNT(*) AS total_hits,
    COUNT(DISTINCT distinct_id) AS unique_users,

    -- Response time metrics
    ROUND(AVG(JSONExtractInt(properties, 'response_time_ms')), 2) AS avg_response_time_ms,
    quantile(0.50)(JSONExtractInt(properties, 'response_time_ms')) AS p50_response_time_ms,
    quantile(0.95)(JSONExtractInt(properties, 'response_time_ms')) AS p95_response_time_ms,
    quantile(0.99)(JSONExtractInt(properties, 'response_time_ms')) AS p99_response_time_ms,
    MIN(JSONExtractInt(properties, 'response_time_ms')) AS min_response_time_ms,
    MAX(JSONExtractInt(properties, 'response_time_ms')) AS max_response_time_ms,

    -- Error metrics
    SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) AS total_errors,
    SUM(CASE WHEN JSONExtractBool(properties, 'is_client_error') = 1 THEN 1 ELSE 0 END) AS errors_4xx,
    SUM(CASE WHEN JSONExtractBool(properties, 'is_server_error') = 1 THEN 1 ELSE 0 END) AS errors_5xx,

    -- Error rate
    ROUND(
        (SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*),
        2
    ) AS error_rate_percent,

    -- Success metrics
    SUM(CASE WHEN JSONExtractBool(properties, 'is_success') = 1 THEN 1 ELSE 0 END) AS successful_requests,
    ROUND(
        (SUM(CASE WHEN JSONExtractBool(properties, 'is_success') = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*),
        2
    ) AS success_rate_percent

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY endpoint, method, url
ORDER BY total_hits DESC
LIMIT 100
```

**Example Output:**

```
endpoint                method  url              hits    users  avg_rt  p50   p95    p99    errors  4xx   5xx   error%  success%
POST /api/orders        POST    /api/orders      15,234  2,345  156     89    456    1,234  152     145   7     1.00    99.00
GET /api/users          GET     /api/users       12,456  1,890  45      23    123    345    25      23    2     0.20    99.80
GET /api/products       GET     /api/products    8,901   1,234  89      45    234    567    45      42    3     0.51    99.49
POST /api/payments      POST    /api/payments    5,678   987    245     123   678    1,456  142     120   22    2.50    97.50
```

---

## 🔥 Top Endpoints by Traffic

### Query: Most Used Endpoints

```sql
SELECT
    JSONExtractString(properties, 'endpoint') AS endpoint,
    COUNT(*) AS total_hits,
    ROUND(AVG(JSONExtractInt(properties, 'response_time_ms')), 2) AS avg_response_time_ms,
    ROUND(
        (SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*),
        2
    ) AS error_rate_percent

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY endpoint
ORDER BY total_hits DESC
LIMIT 10
```

---

## 🐌 Slowest Endpoints

### Query: Endpoints with Highest Average Response Time

```sql
SELECT
    JSONExtractString(properties, 'endpoint') AS endpoint,
    COUNT(*) AS total_hits,
    ROUND(AVG(JSONExtractInt(properties, 'response_time_ms')), 2) AS avg_response_time_ms,
    quantile(0.95)(JSONExtractInt(properties, 'response_time_ms')) AS p95_response_time_ms,
    MAX(JSONExtractInt(properties, 'response_time_ms')) AS max_response_time_ms

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY endpoint
HAVING COUNT(*) >= 10  -- Only endpoints with significant traffic
ORDER BY avg_response_time_ms DESC
LIMIT 10
```

---

## ⚠️ Highest Error Rate Endpoints

### Query: Endpoints with Most Errors

```sql
SELECT
    JSONExtractString(properties, 'endpoint') AS endpoint,
    COUNT(*) AS total_hits,
    SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) AS total_errors,
    SUM(CASE WHEN JSONExtractBool(properties, 'is_client_error') = 1 THEN 1 ELSE 0 END) AS errors_4xx,
    SUM(CASE WHEN JSONExtractBool(properties, 'is_server_error') = 1 THEN 1 ELSE 0 END) AS errors_5xx,
    ROUND(
        (SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*),
        2
    ) AS error_rate_percent

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY endpoint
HAVING COUNT(*) >= 10  -- Only endpoints with significant traffic
ORDER BY error_rate_percent DESC
LIMIT 10
```

---

## 📊 Response Time Distribution

### Query: Response Time Buckets

```sql
SELECT
    CASE
        WHEN JSONExtractInt(properties, 'response_time_ms') < 50 THEN '0-50ms (Fast)'
        WHEN JSONExtractInt(properties, 'response_time_ms') < 100 THEN '50-100ms (Good)'
        WHEN JSONExtractInt(properties, 'response_time_ms') < 200 THEN '100-200ms (OK)'
        WHEN JSONExtractInt(properties, 'response_time_ms') < 500 THEN '200-500ms (Slow)'
        ELSE '500ms+ (Very Slow)'
    END AS response_time_bucket,
    COUNT(*) AS request_count,
    ROUND((COUNT(*) * 100.0) / (SELECT COUNT(*) FROM events WHERE event = 'api_request' AND timestamp >= now() - INTERVAL 24 HOUR), 2) AS percentage

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY response_time_bucket
ORDER BY
    CASE response_time_bucket
        WHEN '0-50ms (Fast)' THEN 1
        WHEN '50-100ms (Good)' THEN 2
        WHEN '100-200ms (OK)' THEN 3
        WHEN '200-500ms (Slow)' THEN 4
        ELSE 5
    END
```

**Example Output:**

```
response_time_bucket    request_count    percentage
0-50ms (Fast)           45,678          36.42%
50-100ms (Good)         38,901          31.02%
100-200ms (OK)          25,432          20.28%
200-500ms (Slow)        12,345          9.84%
500ms+ (Very Slow)      3,076           2.45%
```

---

## 📈 Hourly Traffic Pattern

### Query: Requests per Hour (Last 24 Hours)

```sql
SELECT
    toStartOfHour(timestamp) AS hour,
    COUNT(*) AS total_requests,
    ROUND(AVG(JSONExtractInt(properties, 'response_time_ms')), 2) AS avg_response_time_ms,
    SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) AS total_errors,
    ROUND(
        (SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*),
        2
    ) AS error_rate_percent

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY hour
ORDER BY hour ASC
```

---

## 🔍 Status Code Distribution

### Query: Requests by Status Code

```sql
SELECT
    JSONExtractInt(properties, 'status_code') AS status_code,
    CASE
        WHEN JSONExtractInt(properties, 'status_code') BETWEEN 200 AND 299 THEN '2xx Success'
        WHEN JSONExtractInt(properties, 'status_code') BETWEEN 300 AND 399 THEN '3xx Redirect'
        WHEN JSONExtractInt(properties, 'status_code') BETWEEN 400 AND 499 THEN '4xx Client Error'
        WHEN JSONExtractInt(properties, 'status_code') BETWEEN 500 AND 599 THEN '5xx Server Error'
        ELSE 'Other'
    END AS status_category,
    COUNT(*) AS request_count,
    ROUND((COUNT(*) * 100.0) / (SELECT COUNT(*) FROM events WHERE event = 'api_request' AND timestamp >= now() - INTERVAL 24 HOUR), 2) AS percentage

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY status_code, status_category
ORDER BY request_count DESC
```

---

## 👥 User Activity Analysis

### Query: Top Users by Request Count

```sql
SELECT
    distinct_id AS user_id,
    JSONExtractString(properties, 'username') AS username,
    COUNT(*) AS total_requests,
    COUNT(DISTINCT JSONExtractString(properties, 'endpoint')) AS unique_endpoints,
    ROUND(AVG(JSONExtractInt(properties, 'response_time_ms')), 2) AS avg_response_time_ms,
    SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) AS errors_encountered

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
  AND distinct_id != 'anonymous'
  AND distinct_id != 'system'
GROUP BY user_id, username
ORDER BY total_requests DESC
LIMIT 20
```

---

## 🚨 Error Analysis

### Query: Recent Errors with Details

```sql
SELECT
    timestamp,
    JSONExtractString(properties, 'endpoint') AS endpoint,
    JSONExtractInt(properties, 'status_code') AS status_code,
    JSONExtractInt(properties, 'response_time_ms') AS response_time_ms,
    JSONExtractString(properties, 'request_id') AS request_id,
    JSONExtractString(properties, 'user_id') AS user_id,
    JSONExtractString(properties, 'ip') AS client_ip,
    distinct_id

FROM events
WHERE event = 'api_request'
  AND JSONExtractBool(properties, 'is_error') = 1
  AND timestamp >= now() - INTERVAL 1 HOUR
ORDER BY timestamp DESC
LIMIT 100
```

---

## 🔥 Slow Requests (>1 second)

### Query: Find Slow Requests

```sql
SELECT
    timestamp,
    JSONExtractString(properties, 'endpoint') AS endpoint,
    JSONExtractInt(properties, 'response_time_ms') AS response_time_ms,
    JSONExtractInt(properties, 'status_code') AS status_code,
    JSONExtractString(properties, 'request_id') AS request_id,
    JSONExtractString(properties, 'user_id') AS user_id,
    distinct_id

FROM events
WHERE event = 'api_request'
  AND JSONExtractInt(properties, 'response_time_ms') > 1000
  AND timestamp >= now() - INTERVAL 24 HOUR
ORDER BY response_time_ms DESC
LIMIT 100
```

---

## 📊 Endpoint Performance Matrix

### Query: Complete Performance Matrix

```sql
SELECT
    JSONExtractString(properties, 'endpoint') AS endpoint,

    -- Traffic
    COUNT(*) AS total_hits,
    ROUND((COUNT(*) * 100.0) / (SELECT COUNT(*) FROM events WHERE event = 'api_request' AND timestamp >= now() - INTERVAL 24 HOUR), 2) AS traffic_percent,

    -- Response Time
    ROUND(AVG(JSONExtractInt(properties, 'response_time_ms')), 2) AS avg_rt,
    quantile(0.50)(JSONExtractInt(properties, 'response_time_ms')) AS p50_rt,
    quantile(0.95)(JSONExtractInt(properties, 'response_time_ms')) AS p95_rt,
    quantile(0.99)(JSONExtractInt(properties, 'response_time_ms')) AS p99_rt,

    -- Errors
    SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) AS errors,
    ROUND((SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2) AS error_rate,

    -- Status Codes
    SUM(CASE WHEN JSONExtractInt(properties, 'status_code') BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS status_2xx,
    SUM(CASE WHEN JSONExtractInt(properties, 'status_code') BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS status_4xx,
    SUM(CASE WHEN JSONExtractInt(properties, 'status_code') BETWEEN 500 AND 599 THEN 1 ELSE 0 END) AS status_5xx,

    -- Users
    COUNT(DISTINCT distinct_id) AS unique_users

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY endpoint
ORDER BY total_hits DESC
LIMIT 50
```

---

## 🎯 Service Health Score

### Query: Calculate Health Score per Endpoint

```sql
SELECT
    JSONExtractString(properties, 'endpoint') AS endpoint,
    COUNT(*) AS total_requests,

    -- Error rate score (0-100, lower is better)
    ROUND(
        100 - (SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*)),
        2
    ) AS error_score,

    -- Performance score (0-100, based on response time)
    ROUND(
        CASE
            WHEN AVG(JSONExtractInt(properties, 'response_time_ms')) < 50 THEN 100
            WHEN AVG(JSONExtractInt(properties, 'response_time_ms')) < 100 THEN 90
            WHEN AVG(JSONExtractInt(properties, 'response_time_ms')) < 200 THEN 75
            WHEN AVG(JSONExtractInt(properties, 'response_time_ms')) < 500 THEN 50
            ELSE 25
        END,
        2
    ) AS performance_score,

    -- Overall health score (average of error and performance scores)
    ROUND(
        (
            (100 - (SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*))) +
            CASE
                WHEN AVG(JSONExtractInt(properties, 'response_time_ms')) < 50 THEN 100
                WHEN AVG(JSONExtractInt(properties, 'response_time_ms')) < 100 THEN 90
                WHEN AVG(JSONExtractInt(properties, 'response_time_ms')) < 200 THEN 75
                WHEN AVG(JSONExtractInt(properties, 'response_time_ms')) < 500 THEN 50
                ELSE 25
            END
        ) / 2,
        2
    ) AS health_score

FROM events
WHERE event = 'api_request'
  AND timestamp >= now() - INTERVAL 24 HOUR
GROUP BY endpoint
HAVING COUNT(*) >= 10
ORDER BY health_score DESC
```

---

## 📅 Time-Based Comparisons

### Query: Compare Current vs Previous Period

```sql
WITH current_period AS (
    SELECT
        JSONExtractString(properties, 'endpoint') AS endpoint,
        COUNT(*) AS requests,
        AVG(JSONExtractInt(properties, 'response_time_ms')) AS avg_rt,
        SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) AS errors
    FROM events
    WHERE event = 'api_request'
      AND timestamp >= now() - INTERVAL 24 HOUR
    GROUP BY endpoint
),
previous_period AS (
    SELECT
        JSONExtractString(properties, 'endpoint') AS endpoint,
        COUNT(*) AS requests,
        AVG(JSONExtractInt(properties, 'response_time_ms')) AS avg_rt,
        SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) AS errors
    FROM events
    WHERE event = 'api_request'
      AND timestamp >= now() - INTERVAL 48 HOUR
      AND timestamp < now() - INTERVAL 24 HOUR
    GROUP BY endpoint
)
SELECT
    c.endpoint,
    c.requests AS current_requests,
    p.requests AS previous_requests,
    ROUND(((c.requests - p.requests) * 100.0) / p.requests, 2) AS requests_change_percent,
    ROUND(c.avg_rt, 2) AS current_avg_rt,
    ROUND(p.avg_rt, 2) AS previous_avg_rt,
    ROUND(c.avg_rt - p.avg_rt, 2) AS rt_change_ms,
    c.errors AS current_errors,
    p.errors AS previous_errors

FROM current_period c
LEFT JOIN previous_period p ON c.endpoint = p.endpoint
ORDER BY c.requests DESC
LIMIT 20
```

---

## 🔧 Query Tips

### 1. Adjust Time Range

Replace `now() - INTERVAL 24 HOUR` with:

- Last hour: `now() - INTERVAL 1 HOUR`
- Last 7 days: `now() - INTERVAL 7 DAY`
- Last 30 days: `now() - INTERVAL 30 DAY`
- Specific date: `'2025-01-11 00:00:00'`

### 2. Filter by Service

Add to WHERE clause:

```sql
AND JSONExtractString(properties, 'service') = 'my-api'
```

### 3. Filter by Environment

Add to WHERE clause:

```sql
AND JSONExtractString(properties, 'environment') = 'production'
```

### 4. Filter by Specific Endpoint

Add to WHERE clause:

```sql
AND JSONExtractString(properties, 'endpoint') = 'POST /api/users'
```

---

## 📊 Export Results

### To CSV

```bash
clickhouse-client --query="YOUR_QUERY_HERE" --format CSV > results.csv
```

### To JSON

```bash
clickhouse-client --query="YOUR_QUERY_HERE" --format JSONEachRow > results.json
```

---

## 🚀 Performance Optimization

### Add Indexes (if you have access)

```sql
-- Index on event type
ALTER TABLE events ADD INDEX idx_event event TYPE set(100) GRANULARITY 1;

-- Index on timestamp
ALTER TABLE events ADD INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1;
```

### Use Materialized Views (Advanced)

```sql
CREATE MATERIALIZED VIEW api_stats_hourly
ENGINE = SummingMergeTree()
ORDER BY (hour, endpoint)
AS SELECT
    toStartOfHour(timestamp) AS hour,
    JSONExtractString(properties, 'endpoint') AS endpoint,
    COUNT(*) AS requests,
    SUM(JSONExtractInt(properties, 'response_time_ms')) AS total_response_time,
    SUM(CASE WHEN JSONExtractBool(properties, 'is_error') = 1 THEN 1 ELSE 0 END) AS errors
FROM events
WHERE event = 'api_request'
GROUP BY hour, endpoint;
```

---

For more ClickHouse query optimization, see: <https://clickhouse.com/docs/en/sql-reference/>
