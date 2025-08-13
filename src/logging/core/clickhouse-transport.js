'use strict'

const { createClient } = require('@clickhouse/client')
const { Transform } = require('stream')

// Helper function to format timestamp for ClickHouse
function formatClickHouseDateTime(dateInput) {
  const date = new Date(dateInput)
  const isoString = date.toISOString()
  return isoString.replace('T', ' ').replace('Z', '')
}

module.exports = async function clickHouseTransport(options) {
  const {
    url,
    username = 'default',
    password = '',
    database = 'default',
    application = 'bootifyjs-app',
    maxBatchSize = 1000,
    flushInterval = 5000,
    retryDelay = 1000,
    maxRetries = 5,
  } = options

  if (!url) {
    console.error(
      '[ClickHouseTransport] `url` option is required. Transport will not process logs.'
    )
    return new Transform({
      transform(chunk, enc, cb) {
        cb()
      },
      final(cb) {
        cb()
      },
    })
  }

  const client = createClient({
    host: url,
    username,
    password,
    database,
    application,
    clickhouse_settings: {
      date_time_input_format: 'best_effort',
      input_format_import_nested_json: 1,
    },
  })

  try {
    await initializeClickHouseTables(client, database)
  } catch (initError) {
    console.error(
      '[ClickHouseTransport] CRITICAL: Failed to initialize ClickHouse tables during setup.',
      initError
    )
  }

  // Enhanced batch maps for different log types including spans
  const batchMap = new Map([
    ['application', []],
    ['access', []],
    ['audit', []],
    ['event', []],
    ['span', []], // NEW: Added span support
    ['default', []],
  ])

  let isFlushing = false
  let currentRetryCount = 0
  let flushTimer = null

  const flushBatch = async (logType, recordsToFlush) => {
    if (recordsToFlush.length === 0) return

    // Format records before sending
    const formattedBatch = recordsToFlush.map((record) => {
      return {
        ...record,
        timestamp: formatClickHouseDateTime(record.timestamp),
        startTime: record.startTime ? formatClickHouseDateTime(record.startTime) : null,
        endTime: record.endTime ? formatClickHouseDateTime(record.endTime) : null,
        // Ensure JSON fields are properly stringified
        context: record.context ? JSON.stringify(record.context) : null,
        error: record.error ? JSON.stringify(record.error) : null,
        tags: record.tags ? JSON.stringify(record.tags) : null,
        logs: record.logs ? JSON.stringify(record.logs) : null,
        baggage: record.baggage ? JSON.stringify(record.baggage) : null,
        metadata: record.metadata ? JSON.stringify(record.metadata) : null,
        details: record.details ? JSON.stringify(record.details) : null,
        oldValues: record.oldValues ? JSON.stringify(record.oldValues) : null,
        newValues: record.newValues ? JSON.stringify(record.newValues) : null,
      }
    })

    // Determine table name based on log type
    const tableName = logType === 'span' ? `${database}.spans` : `${database}.${logType}_logs`

    // console.log('--- Sending to ClickHouse ---', JSON.stringify(formattedBatch, null, 2))
    // console.log(tableName)

    try {
      await client.insert({
        table: tableName,
        values: formattedBatch,
        format: 'JSONEachRow',
        clickhouse_settings: {
          input_format_skip_unknown_fields: 1,
          input_format_import_nested_json: 1,
        },
      })
      currentRetryCount = 0
    } catch (err) {
      console.error(
        `[ClickHouseTransport] Insert failed for ${tableName}:`,
        err instanceof Error ? err.message : String(err),
        `Retrying ${formattedBatch.length} records.`
      )
      const batchForLogType = batchMap.get(logType) || batchMap.get('default')
      if (batchForLogType) {
        batchForLogType.unshift(...recordsToFlush) // Keep original records for retry
      }

      if (currentRetryCount < maxRetries) {
        currentRetryCount++
        if (flushTimer) clearInterval(flushTimer)
        setTimeout(() => {
          flushAll()
          if (flushTimer) clearInterval(flushTimer)
          flushTimer = setInterval(flushAll, flushInterval)
        }, retryDelay * Math.pow(2, currentRetryCount))
      } else {
        console.error(
          `[ClickHouseTransport] Max retries (${maxRetries}) reached for ${tableName}. Dropping ${formattedBatch.length} logs.`
        )
        currentRetryCount = 0
      }
    }
  }

  const flushAll = async () => {
    if (isFlushing) return
    isFlushing = true
    try {
      await Promise.all(
        Array.from(batchMap.entries()).map(([logType, batch]) => {
          if (batch.length > 0) {
            console.log(
              `[ClickHouseTransport] Flushing ${logType} batch of ${batch.length} records`
            )
            const recordsToProcess = batch.splice(0, batch.length)
            return flushBatch(logType, recordsToProcess)
          }
          return Promise.resolve()
        })
      )
    } finally {
      isFlushing = false
    }
  }

  flushTimer = setInterval(flushAll, flushInterval)

  const transportStream = new Transform({
    writableObjectMode: false,
    readableObjectMode: false,
    transform(chunk, _enc, cb) {
      try {
        const log = JSON.parse(chunk.toString())

        // console.log('clickhouse transport', log, 'log')

        // Enhanced log type determination
        let logType = 'application'
        if (log.logType === 'audit' || log.action) {
          logType = 'audit'
        } else if (log.logType === 'event' || log.eventName) {
          logType = 'event'
        } else if (log.logType === 'span') {
          logType = 'span' // NEW: Handle span logs
        } else if (
          log.component === 'HTTP' ||
          log.logType === 'http' ||
          log.logType === 'access' ||
          log.method
        ) {
          logType = 'access'
        }

        console.log('logType', logType)
        const batch = batchMap.get(logType) || batchMap.get('default')

        // Create base record with enhanced tracing fields
        const record = {
          timestamp: log.timestamp || log.time || Date.now(),
          level: String(log.level || 'info'),
          message: log.message || '',
          username: log.username,
          requestId: log.requestId,
          userId: log.userId,
          traceId: log.traceId,
          spanId: log.spanId,
          parentSpanId: log.parentSpanId, // NEW: Enhanced tracing
          correlationId: log.correlationId,
          operationName: log.operationName, // NEW: Enhanced tracing
          serviceName: log.serviceName, // NEW: Enhanced tracing
          application: log.application || options.application,
        }

        // Add log type specific fields
        if (logType === 'access') {
          record.method = log.method
          record.url = log.url
          record.path = log.path || (log.url ? log.url.split('?')[0] : '')
          record.statusCode = log.statusCode
          record.responseTime = log.duration || log.responseTime
          record.contentLength = log.contentLength
          record.ip = log.ip
          record.userAgent = log.userAgent
        } else if (logType === 'audit') {
          record.action = log.action
          record.resource = log.resource
          record.resourceId = log.resourceId
          record.resources = log.resources || []
          record.details = log.details
          record.oldValues = log.oldValues
          record.newValues = log.newValues
          record.metadata = log.metadata
          record.ip = log.ip
          record.userAgent = log.userAgent
        } else if (logType === 'event') {
          record.eventName = log.eventName
          record.eventType = log.eventType
          record.status = log.status
          record.duration = log.duration
          record.metadata = log.metadata
          record.ip = log.ip
          record.userAgent = log.userAgent
        } else if (logType === 'span') {
          // NEW: Handle span-specific fields
          record.startTime = log.startTime
          record.endTime = log.endTime
          record.duration = log.duration
          record.status = log.status || 'ok'
          record.statusCode = log.statusCode
          record.tags = log.tags
          record.logs = log.logs
          record.baggage = log.baggage
        } else {
          // application logs
          record.component = log.component || 'application'
        }

        // Add error and context information
        if (log.err && typeof log.err === 'object') {
          record.error = log.err
        } else if (log.error && typeof log.error === 'object') {
          record.error = log.error
        }

        if (log.context && typeof log.context === 'object') {
          record.context = log.context
        } else if (log.additionalContext && typeof log.additionalContext === 'object') {
          record.context = log.additionalContext
        }

        if (batch) {
          batch.push(record)

          console.log('batchMap', batchMap)
        }

        if (batch && batch.length >= maxBatchSize) {
          const recordsToFlush = batch.splice(0, batch.length)
          flushBatch(logType, recordsToFlush).catch((err) => {
            console.error(
              `[ClickHouseTransport] Error during batch-full flush for ${logType}:`,
              err.message
            )
          })
        }
      } catch (err) {
        console.error(
          '[ClickHouseTransport] Log parse/processing error in transform:',
          err instanceof Error ? err.message : String(err),
          `Chunk: ${chunk.toString().substring(0, 100)}...`
        )
      }
      cb()
    },
    final(cb) {
      if (flushTimer) clearInterval(flushTimer)
      console.info('[ClickHouseTransport] Finalizing stream, flushing remaining logs...')
      flushAll()
        .then(() => {
          if (client) return client.close()
          return Promise.resolve()
        })
        .then(() => {
          console.info('[ClickHouseTransport] Stream ended, final flush complete, client closed.')
          cb()
        })
        .catch((err) => {
          console.error('[ClickHouseTransport] Error during final flush/close:', err.message)
          cb(err)
        })
    },
  })

  // Add an error handler to the client to catch async errors
  if ('on' in client) {
    client.on('error', (err) => {
      console.error('[ClickHouseTransport] ClickHouse client emitted an error:', err)
    })
  }

  return transportStream
}

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
