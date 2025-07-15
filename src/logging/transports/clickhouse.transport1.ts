import { createClient, ClickHouseClient } from '@clickhouse/client'
import { Transform } from 'stream'
import { ClickHouseTransportOptions } from '../types/logging.types'

// Helper function to initialize ClickHouse tables
async function initializeClickHouseTables(client: ClickHouseClient, dbName: string) {
  // Application logs table
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
      correlationId Nullable(String),
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
      INDEX idx_application application TYPE bloom_filter GRANULARITY 1
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, level, component, timestamp)
    SETTINGS index_granularity = 8192;
  `

  // HTTP access logs table
  const createHttpLogTable = `
    CREATE TABLE IF NOT EXISTS ${dbName}.http_logs (
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
      correlationId Nullable(String),
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
      INDEX idx_application application TYPE bloom_filter GRANULARITY 1
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, method, statusCode, timestamp)
    SETTINGS index_granularity = 8192;
  `

  // Audit logs table
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
      correlationId Nullable(String),
      application Nullable(String),

      date Date MATERIALIZED toDate(timestamp) CODEC(ZSTD),
      INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
      INDEX idx_action action TYPE set(0) GRANULARITY 1,
      INDEX idx_resource resource TYPE set(0) GRANULARITY 1,
      INDEX idx_resourceId resourceId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_username username TYPE bloom_filter GRANULARITY 1,
      INDEX idx_userId userId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_application application TYPE bloom_filter GRANULARITY 1
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, action, resource, timestamp)
    SETTINGS index_granularity = 8192;
  `

  // Event logs table
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
      correlationId Nullable(String),
      application Nullable(String),

      date Date MATERIALIZED toDate(timestamp) CODEC(ZSTD),
      INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
      INDEX idx_eventName eventName TYPE set(0) GRANULARITY 1,
      INDEX idx_eventType eventType TYPE set(0) GRANULARITY 1,
      INDEX idx_status status TYPE set(0) GRANULARITY 1,
      INDEX idx_username username TYPE bloom_filter GRANULARITY 1,
      INDEX idx_userId userId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_application application TYPE bloom_filter GRANULARITY 1
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, eventType, eventName, timestamp)
    SETTINGS index_granularity = 8192;
  `

  // Performance logs table
  const createPerformanceLogTable = `
    CREATE TABLE IF NOT EXISTS ${dbName}.performance_logs (
      timestamp DateTime64(3, 'UTC'),
      level LowCardinality(String),
      operation String,
      duration Float32,
      memoryUsage Nullable(JSON),
      metadata Nullable(JSON),
      component Nullable(String),
      requestId Nullable(String),
      traceId Nullable(String),
      spanId Nullable(String),
      correlationId Nullable(String),
      application Nullable(String),

      date Date MATERIALIZED toDate(timestamp) CODEC(ZSTD),
      INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1,
      INDEX idx_operation operation TYPE set(0) GRANULARITY 1,
      INDEX idx_duration duration TYPE minmax GRANULARITY 1,
      INDEX idx_component component TYPE set(0) GRANULARITY 1,
      INDEX idx_requestId requestId TYPE bloom_filter GRANULARITY 1,
      INDEX idx_application application TYPE bloom_filter GRANULARITY 1
    ) ENGINE = MergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, operation, duration, timestamp)
    SETTINGS index_granularity = 8192;
  `

  // Create views for analytics
  const createHttpAnalyticsView = `
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${dbName}.http_analytics_daily
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, method, path, statusCode)
    POPULATE AS
    SELECT
      toDate(timestamp) AS date,
      method,
      path,
      statusCode,
      count() AS requests,
      avg(responseTime) AS avg_response_time,
      min(responseTime) AS min_response_time,
      max(responseTime) AS max_response_time,
      sum(responseTime) AS total_response_time
    FROM ${dbName}.http_logs
    GROUP BY date, method, path, statusCode;
  `

  const createEventAnalyticsView = `
    CREATE MATERIALIZED VIEW IF NOT EXISTS ${dbName}.event_analytics_daily
    ENGINE = SummingMergeTree()
    PARTITION BY toYYYYMM(date)
    ORDER BY (date, eventType, eventName, status)
    POPULATE AS
    SELECT
      toDate(timestamp) AS date,
      eventType,
      eventName,
      status,
      count() AS events,
      avg(duration) AS avg_duration,
      min(duration) AS min_duration,
      max(duration) AS max_duration,
      sum(duration) AS total_duration
    FROM ${dbName}.event_logs
    WHERE duration IS NOT NULL
    GROUP BY date, eventType, eventName, status;
  `

  const tableQueries = [
    createApplicationLogTable,
    createHttpLogTable,
    createAuditLogTable,
    createEventLogTable,
    createPerformanceLogTable,
    createHttpAnalyticsView,
    createEventAnalyticsView,
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

export default async function clickHouseTransport(options: ClickHouseTransportOptions) {
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
    // await initializeClickHouseTables(client, database)
  } catch (initError) {
    console.error(
      '[ClickHouseTransport] CRITICAL: Failed to initialize ClickHouse tables during setup.',
      initError
    )
  }

  // Create batch maps for different log types
  const batchMap = new Map<string, any[]>([
    ['application', []],
    ['http', []],
    ['audit', []],
    ['event', []],
    ['performance', []],
    ['default', []],
  ])

  let isFlushing = false
  let currentRetryCount = 0
  let flushTimer: NodeJS.Timeout | null = null

  const flushBatch = async (logType: string, recordsToFlush: any[]) => {
    if (recordsToFlush.length === 0) return

    const currentBatch = [...recordsToFlush]

    try {
      await client.insert({
        table: `${database}.${logType}_logs`,
        values: currentBatch,
        format: 'JSONEachRow',
      })
      currentRetryCount = 0
    } catch (err) {
      console.error(
        `[ClickHouseTransport] Insert failed for ${database}.${logType}_logs:`,
        err instanceof Error ? err.message : String(err),
        `Retrying ${currentBatch.length} records.`
      )
      const batchForLogType = batchMap.get(logType) || batchMap.get('default')
      if (batchForLogType) {
        batchForLogType.unshift(...currentBatch)
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
          `[ClickHouseTransport] Max retries (${maxRetries}) reached for ${database}.${logType}_logs. Dropping ${currentBatch.length} logs.`
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

        // Determine log type
        let logType = 'application'

        if (log.logType === 'audit') {
          logType = 'audit'
        } else if (log.logType === 'event') {
          logType = 'event'
        } else if (log.logType === 'performance') {
          logType = 'performance'
        } else if (log.component === 'HTTP' || log.logType === 'http') {
          logType = 'http'
        }

        const batch = batchMap.get(logType) || batchMap.get('default')

        // Create base record with common fields
        const record: any = {
          timestamp: new Date(log.timestamp || log.time || Date.now()).toISOString(),
          level: String(log.level || 'info'),
          message: log.message || '',
          username: log.username,
          requestId: log.requestId,
          userId: log.userId,
          traceId: log.traceId,
          spanId: log.spanId,
          correlationId: log.correlationId,
          application: log.application || options.application,
        }

        // Add log type specific fields
        if (logType === 'http') {
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
          record.resources = log.resources
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
        } else if (logType === 'performance') {
          record.operation = log.operation
          record.duration = log.duration
          record.memoryUsage = log.memoryUsage
          record.metadata = log.metadata
          record.component = log.component
        }

        // Add error information if present
        if (log.err && typeof log.err === 'object') {
          record.error = log.err
        } else if (log.error && typeof log.error === 'object') {
          record.error = log.error
        }

        // Add context if present
        if (log.context && typeof log.context === 'object') {
          record.context = log.context
        } else if (log.additionalContext && typeof log.additionalContext === 'object') {
          record.context = log.additionalContext
        }

        if (batch) {
          batch.push(record)
        }

        if (batch && batch.length >= maxBatchSize) {
          const recordsToFlush = batch?.splice(0, batch?.length || 0) || []
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
    ;(client as any).on('error', (err: Error) => {
      console.error('[ClickHouseTransport] ClickHouse client emitted an error:', err)
    })
  }

  return transportStream
}
