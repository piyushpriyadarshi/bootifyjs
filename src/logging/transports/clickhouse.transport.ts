import { createClient, ClickHouseClient } from '@clickhouse/client'
import { Transform } from 'stream'
import { ClickHouseTransportOptions } from '../types/logging.types'

export default async function (opts: ClickHouseTransportOptions) {
  const {
    url,
    username = 'default',
    password = '',
    database = 'default',
    application = 'bootifyjs-app',
    maxBatchSize = 1000,
    flushInterval = 5000,
  } = opts

  const client = createClient({
    host: url,
    username,
    password,
    database,
    application,
  })

  const batch: any[] = []
  let flushTimeout: NodeJS.Timeout | null = null

  const flush = async () => {
    if (batch.length === 0) return
    const currentBatch = [...batch]
    batch.length = 0

    try {
      await client.insert({
        table: `${database}.application_logs`,
        values: currentBatch,
        format: 'JSONEachRow',
      })
    } catch (err) {
      console.error('ClickHouse insert failed:', err)
    }
  }

  const stream = new Transform({
    objectMode: true,
    transform(chunk, _enc, cb) {
      try {
        const record = JSON.parse(chunk.toString())
        batch.push({
          timestamp: new Date(record.time || Date.now()).toISOString(),
          level: record.level,
          message: record.msg || record.message,
          ...record,
        })

        if (batch.length >= maxBatchSize) {
          flush().catch((err) => console.error('Flush error:', err))
        } else if (!flushTimeout) {
          flushTimeout = setTimeout(() => {
            flushTimeout = null
            flush().catch((err) => console.error('Flush error:', err))
          }, flushInterval)
        }
      } catch (err) {
        console.error('Log processing error:', err)
      }
      cb()
    },
    final(cb) {
      if (flushTimeout) clearTimeout(flushTimeout)
      flush().finally(() => cb())
    },
  })

  return stream
}
