const express = require('express')
const { ClickHouse } = require('clickhouse')
const path = require('path')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 3001

// ClickHouse connection
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

app.use(express.static('public'))
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(express.json())

// Enhanced dashboard route
app.get('/', (req, res) => {
  res.render('enhanced-dashboard')
})

// LOGS EXPLORER APIs

// Advanced logs search with multiple filters
app.get('/api/logs/search', async (req, res) => {
  try {
    const {
      requestId,
      serviceName,
      level,
      message,
      startTime,
      endTime,
      limit = 100,
      offset = 0,
      sortBy = 'timestamp',
      sortOrder = 'DESC',
    } = req.query

    let whereConditions = []
    let params = []

    if (requestId) {
      whereConditions.push('requestId = ?')
      params.push(requestId)
    }
    if (serviceName) {
      whereConditions.push('serviceName = ?')
      params.push(serviceName)
    }
    if (level) {
      whereConditions.push('level = ?')
      params.push(level)
    }
    if (message) {
      whereConditions.push('message ILIKE ?')
      params.push(`%${message}%`)
    }
    if (startTime) {
      whereConditions.push('timestamp >= ?')
      params.push(startTime)
    }
    if (endTime) {
      whereConditions.push('timestamp <= ?')
      params.push(endTime)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    const query = `
      SELECT 
        timestamp,
        level,
        message,
        component,
        requestId,
        traceId,
        spanId,
        parentSpanId,
        operationName,
        serviceName,
        context,
        error
      FROM application_logs 
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ${limit} OFFSET ${offset}
    `

    const result = await clickhouse.query(query).toPromise()

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM application_logs ${whereClause}`
    const countResult = await clickhouse.query(countQuery).toPromise()

    res.json({
      logs: result,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    })
  } catch (error) {
    console.error('Error searching logs:', error)
    res.status(500).json({ error: 'Failed to search logs' })
  }
})

// Get log levels for filter dropdown
app.get('/api/logs/levels', async (req, res) => {
  try {
    const query = 'SELECT DISTINCT level FROM application_logs ORDER BY level'
    const result = await clickhouse.query(query).toPromise()
    res.json(result.map((row) => row.level))
  } catch (error) {
    console.error('Error fetching log levels:', error)
    res.status(500).json({ error: 'Failed to fetch log levels' })
  }
})

// Get services for filter dropdown
app.get('/api/logs/services', async (req, res) => {
  try {
    const query =
      'SELECT DISTINCT serviceName FROM application_logs WHERE serviceName IS NOT NULL ORDER BY serviceName'
    const result = await clickhouse.query(query).toPromise()
    res.json(result.map((row) => row.serviceName))
  } catch (error) {
    console.error('Error fetching services:', error)
    res.status(500).json({ error: 'Failed to fetch services' })
  }
})

// ENHANCED TRACING APIs

// Enhanced requests with better filtering
app.get('/api/requests', async (req, res) => {
  try {
    const {
      method,
      statusCode,
      minDuration,
      maxDuration,
      startTime,
      endTime,
      limit = 100,
    } = req.query

    let whereConditions = ['requestId IS NOT NULL', "requestId != ''"]

    if (method) whereConditions.push(`method = '${method}'`)
    if (statusCode) whereConditions.push(`statusCode = ${statusCode}`)
    if (minDuration) whereConditions.push(`responseTime >= ${minDuration}`)
    if (maxDuration) whereConditions.push(`responseTime <= ${maxDuration}`)
    if (startTime) whereConditions.push(`timestamp >= '${startTime}'`)
    if (endTime) whereConditions.push(`timestamp <= '${endTime}'`)

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
        serviceName
      FROM access_logs 
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `

    const result = await clickhouse.query(query).toPromise()
    res.json(result)
  } catch (error) {
    console.error('Error fetching requests:', error)
    res.status(500).json({ error: 'Failed to fetch requests' })
  }
})

// Trace search with advanced filters
app.get('/api/traces/search', async (req, res) => {
  try {
    const {
      traceId,
      serviceName,
      operationName,
      minDuration,
      maxDuration,
      status,
      hasErrors,
      limit = 50,
    } = req.query

    let whereConditions = []

    if (traceId) whereConditions.push(`traceId = '${traceId}'`)
    if (serviceName) whereConditions.push(`serviceName = '${serviceName}'`)
    if (operationName) whereConditions.push(`operationName ILIKE '%${operationName}%'`)
    if (minDuration) whereConditions.push(`duration >= ${minDuration}`)
    if (maxDuration) whereConditions.push(`duration <= ${maxDuration}`)
    if (status) whereConditions.push(`status = '${status}'`)
    if (hasErrors === 'true') whereConditions.push(`status = 'error' OR statusCode >= 400`)

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    const query = `
      SELECT 
        traceId,
        COUNT(*) as spanCount,
        MIN(startTime) as traceStartTime,
        MAX(endTime) as traceEndTime,
        MAX(endTime) - MIN(startTime) as totalDuration,
        groupArray(DISTINCT serviceName) as services,
        groupArray(DISTINCT operationName) as operations,
        countIf(status = 'error') as errorCount
      FROM spans 
      ${whereClause}
      GROUP BY traceId
      ORDER BY traceStartTime DESC
      LIMIT ${limit}
    `

    const result = await clickhouse.query(query).toPromise()
    res.json(result)
  } catch (error) {
    console.error('Error searching traces:', error)
    res.status(500).json({ error: 'Failed to search traces' })
  }
})

// Service dependency map
app.get('/api/services/dependencies', async (req, res) => {
  try {
    const query = `
      SELECT 
        serviceName as source,
        arrayJoin(extractAll(tags, '"downstream.service":"([^"]+)"')) as target,
        COUNT(*) as callCount,
        AVG(duration) as avgDuration
      FROM spans 
      WHERE serviceName IS NOT NULL 
        AND tags LIKE '%downstream.service%'
        AND timestamp >= now() - INTERVAL 1 HOUR
      GROUP BY serviceName, target
      ORDER BY callCount DESC
    `

    const result = await clickhouse.query(query).toPromise()
    res.json(result)
  } catch (error) {
    console.error('Error fetching service dependencies:', error)
    res.status(500).json({ error: 'Failed to fetch service dependencies' })
  }
})

// Performance metrics
app.get('/api/metrics/performance', async (req, res) => {
  try {
    const { timeRange = '1h', serviceName } = req.query

    let timeFilter = 'timestamp >= now() - INTERVAL 1 HOUR'
    if (timeRange === '24h') timeFilter = 'timestamp >= now() - INTERVAL 24 HOUR'
    if (timeRange === '7d') timeFilter = 'timestamp >= now() - INTERVAL 7 DAY'

    let serviceFilter = serviceName ? `AND serviceName = '${serviceName}'` : ''

    const query = `
      SELECT 
        toStartOfMinute(timestamp) as time,
        COUNT(*) as requestCount,
        AVG(duration) as avgDuration,
        quantile(0.95)(duration) as p95Duration,
        quantile(0.99)(duration) as p99Duration,
        countIf(status = 'error') as errorCount
      FROM spans 
      WHERE ${timeFilter} ${serviceFilter}
      GROUP BY time
      ORDER BY time
    `

    const result = await clickhouse.query(query).toPromise()
    res.json(result)
  } catch (error) {
    console.error('Error fetching performance metrics:', error)
    res.status(500).json({ error: 'Failed to fetch performance metrics' })
  }
})

app.listen(port, () => {
  console.log(`Enhanced Tracing Dashboard running at http://localhost:${port}`)
})
