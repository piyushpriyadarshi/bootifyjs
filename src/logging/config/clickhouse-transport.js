// 'use strict'
// const { createClient } = require('@clickhouse/client')

// module.exports = async function (opts) {
//   const {
//     url,
//     username = 'default',
//     password = '',
//     database = 'default',
//     application = 'bootifyjs-app',
//     maxBatchSize = 1000,
//     flushInterval = 5000,
//   } = opts

//   const client = createClient({
//     host: url,
//     username,
//     password,
//     database,
//     application,
//   })

//   const batch = []
//   let flushTimeout

//   const flush = async () => {
//     if (batch.length === 0) return
//     const currentBatch = [...batch]
//     batch.length = 0

//     try {
//       await client.insert({
//         table: `${database}.application_logs`,
//         values: currentBatch,
//         format: 'JSONEachRow',
//       })
//     } catch (err) {
//       console.error('ClickHouse insert failed:', err)
//     }
//   }

//   return {
//     async write(log) {
//       try {
//         const record = JSON.parse(log)
//         batch.push({
//           timestamp: new Date(record.time || Date.now()).toISOString(),
//           level: record.level,
//           message: record.msg || record.message,
//           ...record,
//         })

//         if (batch.length >= maxBatchSize) {
//           await flush()
//         } else if (!flushTimeout) {
//           flushTimeout = setTimeout(() => {
//             flushTimeout = null
//             flush()
//           }, flushInterval)
//         }
//       } catch (err) {
//         console.error('Log processing error:', err)
//       }
//     },
//     flush,
//     [Symbol.for('needsFlush')]: true,
//   }
// }
'use strict'

const { createClient } = require('@clickhouse/client')
const { Transform } = require('stream')

// Helper function to format timestamp for ClickHouse
function formatClickHouseDateTime(dateInput) {
  const date = new Date(dateInput)
  const isoString = date.toISOString()
  return isoString.replace('T', ' ').replace('Z', '')
}

// Helper function to initialize ClickHouse tables
async function initializeClickHouseTables(client, dbName) {
  // ... (keep all your table creation queries exactly as they were in TypeScript)
  // This should include all the CREATE TABLE statements for:
  // - application_logs
  // - http_logs
  // - audit_logs
  // - event_logs
  // - performance_logs
  // - analytics views
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
    // await initializeClickHouseTables(client, database);
  } catch (initError) {
    console.error(
      '[ClickHouseTransport] CRITICAL: Failed to initialize ClickHouse tables during setup.',
      initError
    )
  }

  // Create batch maps for different log types
  const batchMap = new Map([
    ['application', []],
    ['http', []],
    ['audit', []],
    ['event', []],
    ['performance', []],
    ['default', []],
  ])

  let isFlushing = false
  let currentRetryCount = 0
  let flushTimer = null

  const flushBatch = async (logType, recordsToFlush) => {
    if (recordsToFlush.length === 0) return

    // Format records before sending
    const formattedBatch = recordsToFlush.map((record) => {
      // console.log('Individual record', record)

      return {
        ...record,
        timestamp: formatClickHouseDateTime(record.timestamp),
        // Ensure JSON fields are properly stringified
        context: record.context ? JSON.stringify(record.context) : {},
        error: record.error || null,
        // Add other JSON fields as needed
      }
    })
    console.log('--- Sending to ClickHouse ---', JSON.stringify(formattedBatch, null, 2))

    try {
      await client.insert({
        table: `${database}.${logType}_logs`,
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
        `[ClickHouseTransport] Insert failed for ${database}.${logType}_logs:`,
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
          `[ClickHouseTransport] Max retries (${maxRetries}) reached for ${database}.${logType}_logs. Dropping ${formattedBatch.length} logs.`
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
        const record = {
          timestamp: log.timestamp || log.time || Date.now(),
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
          // console.log('clickhouse record', record)
          batch.push(record)
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
