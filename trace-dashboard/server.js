const express = require('express')
const path = require('path')
const MockDataGenerator = require('./mock-data')

const app = express()
const port = 3001

// Initialize mock data generator
const mockGenerator = new MockDataGenerator()
const mockData = mockGenerator.generateDataset()

console.log(`Generated mock data: ${mockData.requests.length} requests, ${mockData.traces.length} traces, ${mockData.spans.length} spans, ${mockData.logs.length} logs`)

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
    // Use mock data instead of ClickHouse
    const requests = mockData.requests.map(request => ({
      ...request,
      logCount: mockData.logs.filter(log => log.requestId === request.requestId).length
    }))
    
    // Sort by timestamp descending and limit to 100
    const sortedRequests = requests
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 100)
    
    res.json(sortedRequests)
  } catch (error) {
    console.error('Error fetching requests:', error)
    res.status(500).json({ error: 'Failed to fetch requests' })
  }
})

// API: Get traces for a specific request
app.get('/api/requests/:requestId/traces', async (req, res) => {
  try {
    const { requestId } = req.params
    
    // Get traces for the specific request from mock data
    const traces = mockData.traces.filter(trace => trace.requestId === requestId)
    
    // Transform to match expected format
    const result = traces.map(trace => {
      const traceSpans = mockData.spans.filter(span => span.traceId === trace.traceId)
      return {
        traceId: trace.traceId,
        startTime: trace.timestamp,
        endTime: new Date(new Date(trace.timestamp).getTime() + trace.duration).toISOString(),
        spanCount: traceSpans.length,
        uniqueSpans: traceSpans.length,
        serviceName: trace.serviceName,
        operationName: trace.operationName,
        status: trace.status
      }
    })
    
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
    
    // Get spans for the specific trace from mock data
    const spans = mockData.spans.filter(span => span.traceId === traceId)
    
    // Transform to match expected format
    const transformedSpans = spans.map(span => ({
      ...span,
      startTime: span.timestamp,
      endTime: new Date(new Date(span.timestamp).getTime() + span.duration).toISOString(),
      statusCode: span.status === 'OK' ? 200 : 500
    }))
    
    // Build hierarchical structure
    const spanMap = new Map()
    const rootSpans = []

    // First pass: create span objects
    transformedSpans.forEach((span) => {
      spanMap.set(span.spanId, {
        ...span,
        children: [],
      })
    })

    // Second pass: build hierarchy
    transformedSpans.forEach((span) => {
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
    
    // Get logs for the specific span from mock data
    const logs = mockData.logs.filter(log => log.spanId === spanId)
    
    // Transform to match expected format
    const transformedResult = logs.map((log) => ({
      timestamp: log.timestamp,
      level: log.level,
      message: log.message,
      logType: 'application',
      context: JSON.stringify(log.metadata),
      error: log.level === 'ERROR' ? log.message : null,
      metadata: {
        operationName: `${log.serviceName}_operation`,
        serviceName: log.serviceName,
        ...log.metadata
      },
    }))
    
    // Sort by timestamp
    transformedResult.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    res.json(transformedResult)
  } catch (error) {
    console.error('Error fetching logs:', error)
    res.status(500).json({ error: 'Failed to fetch logs' })
  }
})

app.listen(port, () => {
  console.log(`Trace dashboard running at http://localhost:${port}`)
})
