async function initializeClickHouseTables(client, dbName) {
  // Application logs table with enhanced tracing
  const createApplicationLogTable = `
    CREATE TABLE IF NOT EXISTS ${dbName}.application_logs (
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
      application Nullable(String),
      
      date Date MATERIALIZED toDate(timestamp) CODEC(ZSTD),
      INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
      INDEX idx_level level TYPE set(0) GRANULARITY 1,
      INDEX idx_component component TYPE set(0) GRANULARITY 1,
      INDEX idx_username username TYPE bloom_filter GRANULARITY 1,
      INDEX idx_requestId requestId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_userId userId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_traceId traceId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_spanId spanId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_parentSpanId parentSpanId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_operationName operationName TYPE set(0) GRANULARITY 1,
      INDEX idx_application application TYPE bloom_filter GRANULARITY 1
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, level, component, timestamp)
    SETTINGS index_granularity = 8192;
  `

  // Access logs table with enhanced tracing
  const createAccessLogTable = `
    CREATE TABLE IF NOT EXISTS ${dbName}.access_logs (
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
      parentSpanId Nullable(String),
      correlationId Nullable(String),
      operationName Nullable(String),
      serviceName Nullable(String),
      ip Nullable(String),
      userAgent Nullable(String),
      context Nullable(JSON),
      error Nullable(JSON),
      application Nullable(String),

      date Date MATERIALIZED toDate(timestamp) CODEC(ZSTD),
      INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
      INDEX idx_statusCode statusCode TYPE set(0) GRANULARITY 1,
      INDEX idx_method method TYPE set(0) GRANULARITY 1,
      INDEX idx_path path TYPE bloom_filter GRANULARITY 1,
      INDEX idx_username username TYPE bloom_filter GRANULARITY 1,
      INDEX idx_requestId requestId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_userId userId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_traceId traceId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_spanId spanId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_parentSpanId parentSpanId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_operationName operationName TYPE set(0) GRANULARITY 1,
      INDEX idx_application application TYPE bloom_filter GRANULARITY 1
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, method, statusCode, timestamp)
    SETTINGS index_granularity = 8192;
  `

  // Audit logs table with enhanced tracing
  const createAuditLogTable = `
    CREATE TABLE IF NOT EXISTS ${dbName}.audit_logs (
      timestamp DateTime64(3, 'UTC'),
      level LowCardinality(String),
      action String,
      resource String,
      resourceId Nullable(String),
      resources Array(String) DEFAULT [],
      details Nullable(JSON),
      oldValues Nullable(JSON),
      newValues Nullable(JSON),
      metadata Nullable(JSON),
      username Nullable(String),
      userId Nullable(String),
      ip Nullable(String),
      userAgent Nullable(String),
      requestId Nullable(String),
      traceId Nullable(String),
      spanId Nullable(String),
      parentSpanId Nullable(String),
      correlationId Nullable(String),
      operationName Nullable(String),
      serviceName Nullable(String),
      application Nullable(String),

      date Date MATERIALIZED toDate(timestamp) CODEC(ZSTD),
      INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
      INDEX idx_action action TYPE set(0) GRANULARITY 1,
      INDEX idx_resource resource TYPE set(0) GRANULARITY 1,
      INDEX idx_resourceId resourceId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_username username TYPE bloom_filter GRANULARITY 1,
      INDEX idx_userId userId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_traceId traceId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_spanId spanId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_parentSpanId parentSpanId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_operationName operationName TYPE set(0) GRANULARITY 1,
      INDEX idx_application application TYPE bloom_filter GRANULARITY 1
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, action, resource, timestamp)
    SETTINGS index_granularity = 8192;
  `

  // Event logs table with enhanced tracing
  const createEventLogTable = `
    CREATE TABLE IF NOT EXISTS ${dbName}.event_logs (
      timestamp DateTime64(3, 'UTC'),
      level LowCardinality(String),
      eventName String,
      eventType LowCardinality(String),
      status LowCardinality(String),
      duration Nullable(Float32),
      metadata Nullable(JSON),
      username Nullable(String),
      userId Nullable(String),
      ip Nullable(String),
      userAgent Nullable(String),
      requestId Nullable(String),
      traceId Nullable(String),
      spanId Nullable(String),
      parentSpanId Nullable(String),
      correlationId Nullable(String),
      operationName Nullable(String),
      serviceName Nullable(String),
      application Nullable(String),

      date Date MATERIALIZED toDate(timestamp) CODEC(ZSTD),
      INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
      INDEX idx_eventName eventName TYPE set(0) GRANULARITY 1,
      INDEX idx_eventType eventType TYPE set(0) GRANULARITY 1,
      INDEX idx_status status TYPE set(0) GRANULARITY 1,
      INDEX idx_username username TYPE bloom_filter GRANULARITY 1,
      INDEX idx_userId userId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_traceId traceId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_spanId spanId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_parentSpanId parentSpanId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_operationName operationName TYPE set(0) GRANULARITY 1,
      INDEX idx_application application TYPE bloom_filter GRANULARITY 1
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, eventType, eventName, timestamp)
    SETTINGS index_granularity = 8192;
  `

  // NEW: Dedicated spans table for distributed tracing
  const createSpansTable = `
    CREATE TABLE IF NOT EXISTS ${dbName}.spans (
      timestamp DateTime64(3, 'UTC'),
      traceId String,
      spanId String,
      parentSpanId Nullable(String),
      operationName String,
      serviceName String,
      startTime DateTime64(3, 'UTC'),
      endTime Nullable(DateTime64(3, 'UTC')),
      duration Nullable(Float32),
      status LowCardinality(String), -- 'ok', 'error', 'timeout'
      statusCode Nullable(UInt16),
      tags Nullable(JSON),
      logs Nullable(JSON),
      baggage Nullable(JSON),
      username Nullable(String),
      userId Nullable(String),
      requestId Nullable(String),
      correlationId Nullable(String),
      application Nullable(String),
      
      date Date MATERIALIZED toDate(timestamp) CODEC(ZSTD),
      INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
      INDEX idx_traceId traceId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_spanId spanId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_parentSpanId parentSpanId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_operationName operationName TYPE set(0) GRANULARITY 1,
      INDEX idx_serviceName serviceName TYPE set(0) GRANULARITY 1,
      INDEX idx_status status TYPE set(0) GRANULARITY 1,
      INDEX idx_username username TYPE bloom_filter GRANULARITY 1,
      INDEX idx_userId userId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_application application TYPE bloom_filter GRANULARITY 1
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, traceId, startTime, spanId)
    SETTINGS index_granularity = 8192;
  `

  // Enhanced analytics views
  const createAccessAnalyticsView = `
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${dbName}.access_analytics_daily
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, method, path, statusCode, operationName, serviceName)
    POPULATE AS
    SELECT
      toDate(timestamp) AS date,
      method,
      path,
      statusCode,
      operationName,
      serviceName,
      count() AS requests,
      avg(responseTime) AS avg_response_time,
      min(responseTime) AS min_response_time,
      max(responseTime) AS max_response_time,
      sum(responseTime) AS total_response_time
    FROM ${dbName}.access_logs
    GROUP BY date, method, path, statusCode, operationName, serviceName;
  `

  const createEventAnalyticsView = `
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${dbName}.event_analytics_daily
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, eventType, eventName, status, operationName, serviceName)
    POPULATE AS
    SELECT
      toDate(timestamp) AS date,
      eventType,
      eventName,
      status,
      operationName,
      serviceName,
      count() AS events,
      avg(duration) AS avg_duration,
      min(duration) AS min_duration,
      max(duration) AS max_duration,
      sum(duration) AS total_duration
    FROM ${dbName}.event_logs
    WHERE duration IS NOT NULL
    GROUP BY date, eventType, eventName, status, operationName, serviceName;
  `

  const createAuditAnalyticsView = `
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${dbName}.audit_analytics_daily
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, action, resource, operationName, serviceName)
    POPULATE AS
    SELECT
      toDate(timestamp) AS date,
      action,
      resource,
      operationName,
      serviceName,
      count() AS actions,
      uniq(userId) AS unique_users,
      uniq(resourceId) AS unique_resources
    FROM ${dbName}.audit_logs
    GROUP BY date, action, resource, operationName, serviceName;
  `

  // NEW: Spans analytics view for tracing insights
  const createSpansAnalyticsView = `
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${dbName}.spans_analytics_daily
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, serviceName, operationName, status)
    POPULATE AS
    SELECT
      toDate(timestamp) AS date,
      serviceName,
      operationName,
      status,
      count() AS spans,
      avg(duration) AS avg_duration,
      min(duration) AS min_duration,
      max(duration) AS max_duration,
      sum(duration) AS total_duration,
      uniq(traceId) AS unique_traces
    FROM ${dbName}.spans
    WHERE duration IS NOT NULL
    GROUP BY date, serviceName, operationName, status;
  `

  const tableQueries = [
    createApplicationLogTable,
    createAccessLogTable,
    createAuditLogTable,
    createEventLogTable,
    createSpansTable,
    createAccessAnalyticsView,
    createEventAnalyticsView,
    createAuditAnalyticsView,
    createSpansAnalyticsView,
  ]

  console.info(`[ClickHouseTransport] Initializing ClickHouse tables in database '${dbName}'...`)
  for (const query of tableQueries) {
    try {
      await client.command({ query, clickhouse_settings: { wait_for_async_insert: 0 } })
      console.info(`[ClickHouseTransport] Table/view creation successful.`)
    } catch (err) {
      console.error(
        `[ClickHouseTransport] Failed to execute table query: ${
          err instanceof Error ? err.message : String(err)
        }. Query: ${query.substring(0, 100)}...`
      )
    }
  }
  console.info('[ClickHouseTransport] Table initialization complete.')
}

module.exports = { initializeClickHouseTables }
