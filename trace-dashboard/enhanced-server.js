const express = require('express')
const path = require('path')
const MockDataGenerator = require('./mock-data')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 3001

// Initialize mock data generator
const mockGenerator = new MockDataGenerator()
const mockData = mockGenerator.generateDataset()

console.log(`Enhanced server - Generated mock data: ${mockData.requests.length} requests, ${mockData.traces.length} traces, ${mockData.spans.length} spans, ${mockData.logs.length} logs`)

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

    // Filter logs using mock data
    const filters = {
      requestId,
      serviceName,
      level,
      message,
      startTime,
      endTime
    }
    
    let filteredLogs = mockGenerator.filterLogs(mockData.logs, filters)
    
    // Sort logs
    filteredLogs.sort((a, b) => {
      const aValue = a[sortBy] || a.timestamp
      const bValue = b[sortBy] || b.timestamp
      const comparison = sortOrder === 'DESC' 
        ? new Date(bValue) - new Date(aValue)
        : new Date(aValue) - new Date(bValue)
      return comparison
    })
    
    // Apply pagination
    const total = filteredLogs.length
    const paginatedLogs = filteredLogs.slice(offset, offset + parseInt(limit))
    
    // Transform to match expected format
    const transformedLogs = paginatedLogs.map(log => ({
      timestamp: log.timestamp,
      level: log.level,
      message: log.message,
      component: 'application',
      requestId: log.requestId,
      traceId: mockData.spans.find(span => span.spanId === log.spanId)?.traceId || null,
      spanId: log.spanId,
      parentSpanId: null,
      operationName: `${log.serviceName}_operation`,
      serviceName: log.serviceName,
      context: JSON.stringify(log.metadata),
      error: log.level === 'ERROR' ? log.message : null
    }))

    res.json({
      logs: transformedLogs,
      total: total,
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
    const levels = [...new Set(mockData.logs.map(log => log.level))].sort()
    res.json(levels)
  } catch (error) {
    console.error('Error fetching log levels:', error)
    res.status(500).json({ error: 'Failed to fetch log levels' })
  }
})

// Get services for filter dropdown
app.get('/api/logs/services', async (req, res) => {
  try {
    const services = [...new Set(mockData.logs.map(log => log.serviceName).filter(Boolean))].sort()
    res.json(services)
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

    // Filter requests using mock data
    let filteredRequests = mockData.requests.filter(request => {
      if (method && request.method !== method) return false
      if (statusCode && request.statusCode !== parseInt(statusCode)) return false
      if (minDuration && request.duration < parseInt(minDuration)) return false
      if (maxDuration && request.duration > parseInt(maxDuration)) return false
      if (startTime && new Date(request.timestamp) < new Date(startTime)) return false
      if (endTime && new Date(request.timestamp) > new Date(endTime)) return false
      return true
    })

    // Sort by timestamp descending and limit
    filteredRequests = filteredRequests
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, parseInt(limit))

    // Transform to match expected format
    const transformedRequests = filteredRequests.map(request => {
      const associatedTrace = mockData.traces.find(trace => trace.requestId === request.requestId)
      const rootSpan = associatedTrace ? mockData.spans.find(span => span.traceId === associatedTrace.traceId && !span.parentSpanId) : null
      
      return {
        requestId: request.requestId,
        method: request.method,
        url: request.url,
        path: request.path,
        statusCode: request.statusCode,
        duration: request.duration,
        timestamp: request.timestamp,
        userAgent: request.userAgent,
        ip: request.ip,
        traceId: associatedTrace?.traceId || null,
        spanId: rootSpan?.spanId || null,
        operationName: rootSpan?.operationName || `${request.method} ${request.path}`,
        serviceName: rootSpan?.serviceName || 'api-gateway'
      }
    })

    res.json(transformedRequests)
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

    // Filter traces using mock data
    let filteredTraces = mockData.traces.filter(trace => {
      if (traceId && trace.traceId !== traceId) return false
      
      // Get spans for this trace to check service and operation filters
      const traceSpans = mockData.spans.filter(span => span.traceId === trace.traceId)
      
      if (serviceName && !traceSpans.some(span => span.serviceName === serviceName)) return false
      if (operationName && !traceSpans.some(span => span.operationName.toLowerCase().includes(operationName.toLowerCase()))) return false
      if (minDuration && trace.duration < parseInt(minDuration)) return false
      if (maxDuration && trace.duration > parseInt(maxDuration)) return false
      if (status && trace.status !== status) return false
      if (hasErrors === 'true' && trace.status !== 'error') return false
      
      return true
    })

    // Sort by start time descending and limit
    filteredTraces = filteredTraces
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
      .slice(0, parseInt(limit))

    // Transform to match expected format with aggregated span data
    const transformedTraces = filteredTraces.map(trace => {
      const traceSpans = mockData.spans.filter(span => span.traceId === trace.traceId)
      const services = [...new Set(traceSpans.map(span => span.serviceName))]
      const operations = [...new Set(traceSpans.map(span => span.operationName))]
      const errorCount = traceSpans.filter(span => span.status === 'error').length
      
      return {
        traceId: trace.traceId,
        spanCount: traceSpans.length,
        traceStartTime: trace.startTime,
        traceEndTime: trace.endTime,
        totalDuration: trace.duration,
        services: services,
        operations: operations,
        errorCount: errorCount
      }
    })

    res.json(transformedTraces)
  } catch (error) {
    console.error('Error searching traces:', error)
    res.status(500).json({ error: 'Failed to search traces' })
  }
})

// Service dependency map
app.get('/api/services/dependencies', async (req, res) => {
  try {
    // Generate service dependencies from mock spans
    const dependencies = new Map()
    
    mockData.spans.forEach(span => {
      if (span.serviceName && span.tags && span.tags['downstream.service']) {
        const key = `${span.serviceName}->${span.tags['downstream.service']}`
        if (!dependencies.has(key)) {
          dependencies.set(key, {
            source: span.serviceName,
            target: span.tags['downstream.service'],
            callCount: 0,
            totalDuration: 0
          })
        }
        const dep = dependencies.get(key)
        dep.callCount++
        dep.totalDuration += span.duration
      }
    })
    
    // Convert to array and calculate average duration
    const result = Array.from(dependencies.values()).map(dep => ({
      source: dep.source,
      target: dep.target,
      callCount: dep.callCount,
      avgDuration: dep.totalDuration / dep.callCount
    })).sort((a, b) => b.callCount - a.callCount)
    
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

    // Calculate time range
    const now = new Date()
    let startTime
    switch (timeRange) {
      case '24h':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      default: // 1h
        startTime = new Date(now.getTime() - 60 * 60 * 1000)
    }

    // Filter spans by time range and service
    let filteredSpans = mockData.spans.filter(span => {
      const spanTime = new Date(span.startTime)
      if (spanTime < startTime) return false
      if (serviceName && span.serviceName !== serviceName) return false
      return true
    })

    // Group by minute intervals
    const metricsMap = new Map()
    filteredSpans.forEach(span => {
      const spanTime = new Date(span.startTime)
      const minuteKey = new Date(spanTime.getFullYear(), spanTime.getMonth(), spanTime.getDate(), spanTime.getHours(), spanTime.getMinutes()).toISOString()
      
      if (!metricsMap.has(minuteKey)) {
        metricsMap.set(minuteKey, {
          time: minuteKey,
          durations: [],
          errorCount: 0
        })
      }
      
      const metric = metricsMap.get(minuteKey)
      metric.durations.push(span.duration)
      if (span.status === 'error') metric.errorCount++
    })

    // Calculate metrics for each time bucket
    const result = Array.from(metricsMap.values()).map(metric => {
      const durations = metric.durations.sort((a, b) => a - b)
      const requestCount = durations.length
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / requestCount
      const p95Index = Math.floor(requestCount * 0.95)
      const p99Index = Math.floor(requestCount * 0.99)
      
      return {
        time: metric.time,
        requestCount: requestCount,
        avgDuration: avgDuration,
        p95Duration: durations[p95Index] || 0,
        p99Duration: durations[p99Index] || 0,
        errorCount: metric.errorCount
      }
    }).sort((a, b) => new Date(a.time) - new Date(b.time))

    res.json(result)
  } catch (error) {
    console.error('Error fetching performance metrics:', error)
    res.status(500).json({ error: 'Failed to fetch performance metrics' })
  }
})

// Service Statistics APIs

// Application Logs API
app.get('/api/application-logs', (req, res) => {
    const { level, component, serviceName, limit = 100, offset = 0 } = req.query;
    let logs = mockData.applicationLogs || [];
    
    if (level) {
        logs = logs.filter(log => log.level === level);
    }
    if (component) {
        logs = logs.filter(log => log.component === component);
    }
    if (serviceName) {
        logs = logs.filter(log => log.serviceName === serviceName);
    }
    
    const paginatedLogs = logs.slice(offset, offset + parseInt(limit));
    
    res.json({
        logs: paginatedLogs,
        total: logs.length,
        hasMore: offset + parseInt(limit) < logs.length
    });
});

// Access Logs API
app.get('/api/access-logs', (req, res) => {
    const { method, statusCode, serviceName, limit = 100, offset = 0 } = req.query;
    let logs = mockData.accessLogs || [];
    
    if (method) {
        logs = logs.filter(log => log.method === method);
    }
    if (statusCode) {
        logs = logs.filter(log => log.statusCode === parseInt(statusCode));
    }
    if (serviceName) {
        logs = logs.filter(log => log.serviceName === serviceName);
    }
    
    const paginatedLogs = logs.slice(offset, offset + parseInt(limit));
    
    res.json({
        logs: paginatedLogs,
        total: logs.length,
        hasMore: offset + parseInt(limit) < logs.length
    });
});

// Audit Logs API
app.get('/api/audit-logs', (req, res) => {
    const { action, resource, username, limit = 100, offset = 0 } = req.query;
    let logs = mockData.auditLogs || [];
    
    if (action) {
        logs = logs.filter(log => log.action === action);
    }
    if (resource) {
        logs = logs.filter(log => log.resource === resource);
    }
    if (username) {
        logs = logs.filter(log => log.username === username);
    }
    
    const paginatedLogs = logs.slice(offset, offset + parseInt(limit));
    
    res.json({
        logs: paginatedLogs,
        total: logs.length,
        hasMore: offset + parseInt(limit) < logs.length
    });
});

// Event Logs API
app.get('/api/event-logs', (req, res) => {
    const { eventType, eventName, serviceName, limit = 100, offset = 0 } = req.query;
    let logs = mockData.eventLogs || [];
    
    if (eventType) {
        logs = logs.filter(log => log.eventType === eventType);
    }
    if (eventName) {
        logs = logs.filter(log => log.eventName === eventName);
    }
    if (serviceName) {
        logs = logs.filter(log => log.serviceName === serviceName);
    }
    
    const paginatedLogs = logs.slice(offset, offset + parseInt(limit));
    
    res.json({
        logs: paginatedLogs,
        total: logs.length,
        hasMore: offset + parseInt(limit) < logs.length
    });
});

// Distributed Spans API
app.get('/api/distributed-spans', (req, res) => {
    const { traceId, serviceName, operationName, status, limit = 100, offset = 0 } = req.query;
    let spans = mockData.distributedSpans || [];
    
    if (traceId) {
        spans = spans.filter(span => span.traceId === traceId);
    }
    if (serviceName) {
        spans = spans.filter(span => span.serviceName === serviceName);
    }
    if (operationName) {
        spans = spans.filter(span => span.operationName.includes(operationName));
    }
    if (status) {
        spans = spans.filter(span => span.status === status);
    }
    
    const paginatedSpans = spans.slice(offset, offset + parseInt(limit));
    
    res.json({
        spans: paginatedSpans,
        total: spans.length,
        hasMore: offset + parseInt(limit) < spans.length
    });
});

// Service Statistics API
app.get('/api/service-stats', (req, res) => {
    try {
        const accessLogs = mockData.accessLogs || [];
        const applicationLogs = mockData.applicationLogs || [];
        const spans = mockData.distributedSpans || [];
        const auditLogs = mockData.auditLogs || [];
        const eventLogs = mockData.eventLogs || [];
        
        const services = [...new Set([
            ...accessLogs.map(log => log.serviceName),
            ...applicationLogs.map(log => log.serviceName),
            ...spans.map(span => span.serviceName)
        ])].filter(Boolean);
        
        const errorLogs = applicationLogs.filter(log => log.level === 'error');
        const errorSpans = spans.filter(span => span.status === 'error');
        const totalErrors = errorLogs.length + errorSpans.length;
        const totalOperations = applicationLogs.length + spans.length;
        
        const stats = {
            overview: {
                totalServices: services.length,
                totalRequests: accessLogs.length,
                totalTraces: [...new Set(spans.map(span => span.traceId))].length,
                totalSpans: spans.length,
                totalLogs: applicationLogs.length,
                totalEvents: eventLogs.length,
                totalAuditActions: auditLogs.length
            },
            performance: {
                errorRate: totalOperations > 0 ? (totalErrors / totalOperations * 100).toFixed(2) : '0.00',
                avgResponseTime: accessLogs.length > 0 ? 
                    (accessLogs.reduce((sum, log) => sum + log.responseTime, 0) / accessLogs.length).toFixed(2) : '0.00',
                avgSpanDuration: spans.length > 0 ? 
                    (spans.reduce((sum, span) => sum + span.duration, 0) / spans.length).toFixed(2) : '0.00',
                p95ResponseTime: calculatePercentile(accessLogs.map(log => log.responseTime), 95).toFixed(2),
                p99ResponseTime: calculatePercentile(accessLogs.map(log => log.responseTime), 99).toFixed(2)
            },
            health: {
                healthyServices: services.length - getUnhealthyServices(services, applicationLogs, spans).length,
                unhealthyServices: getUnhealthyServices(services, applicationLogs, spans).length,
                uptime: '99.9%', // Mock uptime
                lastIncident: getLastIncident(applicationLogs, spans)
            }
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Error fetching service stats:', error);
        res.status(500).json({ error: 'Failed to fetch service statistics' });
    }
});

// Service Health Details API
app.get('/api/service-health', (req, res) => {
    try {
        const accessLogs = mockData.accessLogs || [];
        const applicationLogs = mockData.applicationLogs || [];
        const spans = mockData.distributedSpans || [];
        
        const services = [...new Set([
            ...accessLogs.map(log => log.serviceName),
            ...applicationLogs.map(log => log.serviceName),
            ...spans.map(span => span.serviceName)
        ])].filter(Boolean);
        
        const serviceHealth = services.map(service => {
            const serviceLogs = applicationLogs.filter(log => log.serviceName === service);
            const serviceSpans = spans.filter(span => span.serviceName === service);
            const serviceAccess = accessLogs.filter(log => log.serviceName === service);
            
            const errorLogs = serviceLogs.filter(log => log.level === 'error');
            const errorSpans = serviceSpans.filter(span => span.status === 'error');
            const totalOps = serviceLogs.length + serviceSpans.length;
            const totalErrors = errorLogs.length + errorSpans.length;
            
            return {
                serviceName: service,
                status: totalErrors / totalOps > 0.05 ? 'unhealthy' : 'healthy',
                errorRate: totalOps > 0 ? (totalErrors / totalOps * 100).toFixed(2) : '0.00',
                requestCount: serviceAccess.length,
                avgResponseTime: serviceAccess.length > 0 ? 
                    (serviceAccess.reduce((sum, log) => sum + log.responseTime, 0) / serviceAccess.length).toFixed(2) : '0.00',
                spanCount: serviceSpans.length,
                lastSeen: serviceLogs.length > 0 ? serviceLogs[0].timestamp : null,
                version: '1.0.0',
                instances: Math.floor(Math.random() * 3) + 1
            };
        });
        
        res.json({ services: serviceHealth });
    } catch (error) {
        console.error('Error fetching service health:', error);
        res.status(500).json({ error: 'Failed to fetch service health' });
    }
});

// Performance Metrics API
app.get('/api/performance-metrics', (req, res) => {
    try {
        const { timeRange = '24h' } = req.query;
        const accessLogs = mockData.accessLogs || [];
        const spans = mockData.distributedSpans || [];
        
        // Group by time intervals
        const timeIntervals = groupByTimeInterval(accessLogs, timeRange);
        const spanIntervals = groupByTimeInterval(spans, timeRange);
        
        const metrics = {
            requestsOverTime: timeIntervals.map(interval => ({
                timestamp: interval.timestamp,
                requests: interval.data.length,
                avgResponseTime: interval.data.length > 0 ? 
                    (interval.data.reduce((sum, log) => sum + log.responseTime, 0) / interval.data.length).toFixed(2) : 0,
                errorRate: interval.data.length > 0 ? 
                    (interval.data.filter(log => log.statusCode >= 400).length / interval.data.length * 100).toFixed(2) : 0
            })),
            spansOverTime: spanIntervals.map(interval => ({
                timestamp: interval.timestamp,
                spans: interval.data.length,
                avgDuration: interval.data.length > 0 ? 
                    (interval.data.reduce((sum, span) => sum + span.duration, 0) / interval.data.length).toFixed(2) : 0,
                errorRate: interval.data.length > 0 ? 
                    (interval.data.filter(span => span.status === 'error').length / interval.data.length * 100).toFixed(2) : 0
            })),
            statusCodeDistribution: getStatusCodeDistribution(accessLogs),
            topSlowEndpoints: getTopSlowEndpoints(accessLogs),
            servicePerformance: getServicePerformanceMetrics(accessLogs, spans)
        };
        
        res.json(metrics);
    } catch (error) {
        console.error('Error fetching performance metrics:', error);
        res.status(500).json({ error: 'Failed to fetch performance metrics' });
    }
});

// Helper functions for analytics
function calculatePercentile(values, percentile) {
    if (values.length === 0) return 0;
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index] || 0;
}

function getUnhealthyServices(services, applicationLogs, spans) {
    return services.filter(service => {
        const serviceLogs = applicationLogs.filter(log => log.serviceName === service);
        const serviceSpans = spans.filter(span => span.serviceName === service);
        const errorLogs = serviceLogs.filter(log => log.level === 'error');
        const errorSpans = serviceSpans.filter(span => span.status === 'error');
        const totalOps = serviceLogs.length + serviceSpans.length;
        const totalErrors = errorLogs.length + errorSpans.length;
        return totalOps > 0 && (totalErrors / totalOps) > 0.05;
    });
}

function getLastIncident(applicationLogs, spans) {
    const errorLogs = applicationLogs.filter(log => log.level === 'error');
    const errorSpans = spans.filter(span => span.status === 'error');
    const allErrors = [...errorLogs, ...errorSpans].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return allErrors.length > 0 ? allErrors[0].timestamp : null;
}

function groupByTimeInterval(data, timeRange) {
    const intervals = [];
    const now = new Date();
    let intervalSize, intervalCount;
    
    switch (timeRange) {
        case '1h':
            intervalSize = 5 * 60 * 1000; // 5 minutes
            intervalCount = 12;
            break;
        case '24h':
            intervalSize = 60 * 60 * 1000; // 1 hour
            intervalCount = 24;
            break;
        case '7d':
            intervalSize = 24 * 60 * 60 * 1000; // 1 day
            intervalCount = 7;
            break;
        default:
            intervalSize = 60 * 60 * 1000; // 1 hour
            intervalCount = 24;
    }
    
    for (let i = intervalCount - 1; i >= 0; i--) {
        const intervalStart = new Date(now.getTime() - (i + 1) * intervalSize);
        const intervalEnd = new Date(now.getTime() - i * intervalSize);
        const intervalData = data.filter(item => {
            const itemTime = new Date(item.timestamp);
            return itemTime >= intervalStart && itemTime < intervalEnd;
        });
        
        intervals.push({
            timestamp: intervalEnd.toISOString(),
            data: intervalData
        });
    }
    
    return intervals;
}

function getStatusCodeDistribution(accessLogs) {
    const distribution = {};
    accessLogs.forEach(log => {
        const statusRange = Math.floor(log.statusCode / 100) * 100;
        const key = `${statusRange}xx`;
        distribution[key] = (distribution[key] || 0) + 1;
    });
    return distribution;
}

function getTopSlowEndpoints(accessLogs, limit = 10) {
    const endpointStats = {};
    
    accessLogs.forEach(log => {
        const key = `${log.method} ${log.path}`;
        if (!endpointStats[key]) {
            endpointStats[key] = {
                endpoint: key,
                totalRequests: 0,
                totalResponseTime: 0,
                maxResponseTime: 0
            };
        }
        
        endpointStats[key].totalRequests++;
        endpointStats[key].totalResponseTime += log.responseTime;
        endpointStats[key].maxResponseTime = Math.max(endpointStats[key].maxResponseTime, log.responseTime);
    });
    
    return Object.values(endpointStats)
        .map(stat => ({
            ...stat,
            avgResponseTime: (stat.totalResponseTime / stat.totalRequests).toFixed(2)
        }))
        .sort((a, b) => b.avgResponseTime - a.avgResponseTime)
        .slice(0, limit);
}

function getServicePerformanceMetrics(accessLogs, spans) {
    const services = [...new Set([
        ...accessLogs.map(log => log.serviceName),
        ...spans.map(span => span.serviceName)
    ])].filter(Boolean);
    
    return services.map(service => {
        const serviceLogs = accessLogs.filter(log => log.serviceName === service);
        const serviceSpans = spans.filter(span => span.serviceName === service);
        
        return {
            serviceName: service,
            requestCount: serviceLogs.length,
            avgResponseTime: serviceLogs.length > 0 ? 
                (serviceLogs.reduce((sum, log) => sum + log.responseTime, 0) / serviceLogs.length).toFixed(2) : '0.00',
            spanCount: serviceSpans.length,
            avgSpanDuration: serviceSpans.length > 0 ? 
                (serviceSpans.reduce((sum, span) => sum + span.duration, 0) / serviceSpans.length).toFixed(2) : '0.00',
            errorRate: {
                requests: serviceLogs.length > 0 ? 
                    (serviceLogs.filter(log => log.statusCode >= 400).length / serviceLogs.length * 100).toFixed(2) : '0.00',
                spans: serviceSpans.length > 0 ? 
                    (serviceSpans.filter(span => span.status === 'error').length / serviceSpans.length * 100).toFixed(2) : '0.00'
            }
        };
    });
}

app.listen(port, () => {
  console.log(`Enhanced Tracing Dashboard running at http://localhost:${port}`)
})
