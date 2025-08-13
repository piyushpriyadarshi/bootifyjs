const express = require('express')
const path = require('path')
const { ClickHouse } = require('clickhouse')

const app = express()
const port = 3001

// ClickHouse client setup
const clickhouse = new ClickHouse({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  port: process.env.CLICKHOUSE_PORT || 8123,
  debug: false,
  basicAuth: {
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  },
  isUseGzip: false,
  format: 'json',
  config: {
    session_timeout: 60,
    output_format_json_quote_64bit_integers: 0,
    enable_http_compression: 0,
    database: process.env.CLICKHOUSE_DATABASE || 'default',
  },
})

// Set EJS as template engine
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())

// Main dashboard route
app.get('/', (req, res) => {
  res.render('dashboard')
})

// API: Get all requests with basic metadata
app.get('/api/requests', async (req, res) => {
  try {
    const query = `
      SELECT 
        requestId,
        method,
        url,
        path,
        statusCode,
        responseTime as duration,
        timestamp,
        userAgent,
        ip,
        traceId,
        spanId,
        operationName,
        serviceName,
        COUNT(*) as logCount
      FROM access_logs 
      WHERE requestId IS NOT NULL 
        AND requestId != ''
      GROUP BY requestId, method, url, path, statusCode, responseTime, timestamp, userAgent, ip, traceId, spanId, operationName, serviceName
      ORDER BY timestamp DESC
      LIMIT 100
    `

    const result = await clickhouse.query(query).toPromise()

    // Transform the data to match expected format
    const transformedResult = result.map((row) => ({
      requestId: row.requestId,
      method: row.method,
      url: row.url,
      statusCode: row.statusCode,
      timestamp: row.timestamp,
      duration: row.duration, // responseTime from access_logs
      userAgent: row.userAgent || 'N/A',
      ip: row.ip || 'N/A',
      logCount: row.logCount,
      traceId: row.traceId,
      spanId: row.spanId,
      operationName: row.operationName,
      serviceName: row.serviceName,
    }))

    res.json(transformedResult)
  } catch (error) {
    console.error('Error fetching requests:', error)
    res.status(500).json({ error: 'Failed to fetch requests' })
  }
})

// API: Get traces for a specific request
app.get('/api/requests/:requestId/traces', async (req, res) => {
  try {
    const { requestId } = req.params

    // First try spans table, then fallback to application_logs
    let query = `
      SELECT DISTINCT
        traceId,
        MIN(startTime) as startTime,
        MAX(endTime) as endTime,
        COUNT(*) as spanCount,
        COUNT(DISTINCT spanId) as uniqueSpans
      FROM spans
      WHERE requestId = '${requestId}'
      GROUP BY traceId
      ORDER BY startTime DESC
    `

    let result
    try {
      result = await clickhouse.query(query).toPromise()
    } catch (spanError) {
      // Fallback to application_logs if spans table doesn't exist or has no data
      query = `
        SELECT DISTINCT
          traceId,
          MIN(timestamp) as startTime,
          MAX(timestamp) as endTime,
          COUNT(*) as spanCount,
          COUNT(DISTINCT spanId) as uniqueSpans
        FROM application_logs
        WHERE requestId = '${requestId}'
          AND traceId IS NOT NULL
        GROUP BY traceId
        ORDER BY startTime DESC
      `
      result = await clickhouse.query(query).toPromise()
    }

    res.json(result)
  } catch (error) {
    console.error('Error fetching traces:', error)
    res.status(500).json({ error: 'Failed to fetch traces' })
  }
})

// API: Get spans for a specific trace
app.get('/api/traces/:traceId/spans', async (req, res) => {
  try {
    const { traceId } = req.params

    // First try spans table, then fallback to application_logs
    let query = `
      SELECT 
        distinct spanId,
        parentSpanId,
        operationName,
        serviceName,
        startTime,
        endTime,
        duration,
        status,
        statusCode,
        tags,
        requestId
      FROM spans
      WHERE traceId = '${traceId}'
      ORDER BY startTime ASC
    `

    let spans
    try {
      spans = await clickhouse.query(query).toPromise()
    } catch (spanError) {
      // Fallback to application_logs

      console.log('spanError', spanError)
      query = `
        SELECT 
          spanId,
          parentSpanId,
          operationName,
          serviceName,
          timestamp as startTime,
          timestamp as endTime,
          0 as duration,
          'ok' as status,
          200 as statusCode,
          '{}' as tags,
          error,
          requestId
        FROM application_logs
        WHERE traceId = '${traceId}'
          AND spanId IS NOT NULL
        ORDER BY timestamp ASC
      `
      spans = await clickhouse.query(query).toPromise()
    }

    console.log(spans)
    // Build hierarchical structure
    const spanMap = new Map()
    const rootSpans = []

    // First pass: create span objects
    spans.forEach((span) => {
      spanMap.set(span.spanId, {
        ...span,
        children: [],
      })
    })

    // Second pass: build hierarchy
    spans.forEach((span) => {
      if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
        spanMap.get(span.parentSpanId).children.push(spanMap.get(span.spanId))
      } else {
        rootSpans.push(spanMap.get(span.spanId))
      }
    })

    res.json(rootSpans)
  } catch (error) {
    console.error('Error fetching spans:', error)
    res.status(500).json({ error: 'Failed to fetch spans' })
  }
})

// API: Get logs for a specific span
app.get('/api/spans/:spanId/logs', async (req, res) => {
  try {
    const { spanId } = req.params

    const query = `
      SELECT 
        timestamp,
        level,
        message,
        component,
        context,
        error,
        operationName,
        serviceName
      FROM application_logs
      WHERE spanId = '${spanId}'
      ORDER BY timestamp ASC
    `

    const result = await clickhouse.query(query).toPromise()

    // Transform to match expected format
    const transformedResult = result.map((row) => ({
      timestamp: row.timestamp,
      level: row.level,
      message: row.message,
      logType: row.component || 'application',
      context: row.context,
      error: row.error,
      metadata: {
        operationName: row.operationName,
        serviceName: row.serviceName,
      },
    }))

    res.json(transformedResult)
  } catch (error) {
    console.error('Error fetching logs:', error)
    res.status(500).json({ error: 'Failed to fetch logs' })
  }
})

app.listen(port, () => {
  console.log(`Trace dashboard running at http://localhost:${port}`)
})
