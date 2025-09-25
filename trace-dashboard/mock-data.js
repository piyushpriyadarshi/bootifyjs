// Mock Data Generator for Tracing Dashboard
const crypto = require('crypto')

class MockDataGenerator {
    constructor() {
        this.services = ['user-service', 'order-service', 'payment-service', 'inventory-service', 'notification-service', 'auth-service', 'analytics-service']
        this.methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
        this.logLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'TRACE']
        this.statusCodes = [200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504]
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
        ]
        this.paths = [
            '/api/users',
            '/api/users/{id}',
            '/api/orders',
            '/api/orders/{id}',
            '/api/payments',
            '/api/inventory/check',
            '/api/notifications/send',
            '/api/auth/login',
            '/api/auth/logout',
            '/api/analytics/reports'
        ]
        this.usernames = ['john_doe', 'jane_smith', 'admin', 'api_user', 'system', 'service_account', 'test_user']
        this.components = ['auth', 'database', 'cache', 'queue', 'api', 'middleware', 'validator', 'processor']
        this.eventTypes = ['user_action', 'system_event', 'business_event', 'security_event', 'performance_event']
        this.eventNames = ['user_login', 'user_logout', 'order_created', 'payment_processed', 'inventory_updated', 'cache_miss', 'db_query', 'api_call']
        this.auditActions = ['CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'IMPORT']
        this.auditResources = ['user', 'order', 'payment', 'product', 'inventory', 'report', 'configuration', 'permission']
        this.spanStatuses = ['ok', 'error', 'timeout', 'cancelled']
    }

    generateId() {
        return crypto.randomUUID()
    }

    generateTraceId() {
        return this.generateId();
    }

    generateSpanId() {
        return this.generateId().substring(0, 16);
    }

    generateRequestId() {
        return 'req_' + this.generateId().substring(0, 12);
    }

    generateCorrelationId() {
        return 'corr_' + this.generateId().substring(0, 10);
    }

    generateSessionId() {
        return 'sess_' + this.generateId().substring(0, 8);
    }

    randomChoice(array) {
        if (!array || array.length === 0) {
            return null;
        }
        return array[Math.floor(Math.random() * array.length)]
    }

    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    generateTimestamp(hoursAgo = 0) {
        const now = new Date()
        const timestamp = new Date(now.getTime() - (hoursAgo * 60 * 60 * 1000) + this.randomInt(-3600000, 0))
        return timestamp.toISOString()
    }

    generateRequest() {
        const requestId = this.generateId()
        const method = this.randomChoice(this.methods)
        const path = this.randomChoice(this.paths)
        const statusCode = this.randomChoice(this.statusCodes)
        const duration = this.randomInt(10, 2000)
        const timestamp = this.generateTimestamp(this.randomInt(0, 24))
        
        return {
            requestId,
            method,
            url: `https://api.example.com${path}`,
            path,
            statusCode,
            duration,
            responseTime: duration,
            timestamp,
            userAgent: this.randomChoice(this.userAgents),
            ip: `192.168.1.${this.randomInt(1, 254)}`,
            userId: this.randomInt(1000, 9999).toString(),
            sessionId: this.generateId().substring(0, 8)
        }
    }

    generateTrace(requestId) {
        const traceId = this.generateId()
        const serviceName = this.randomChoice(this.services)
        const operationName = `${serviceName.split('-')[0]}_operation`
        const duration = this.randomInt(50, 1500)
        const timestamp = this.generateTimestamp(this.randomInt(0, 24))
        
        return {
            traceId,
            requestId,
            serviceName,
            operationName,
            duration,
            timestamp,
            status: this.randomChoice(['SUCCESS', 'ERROR', 'TIMEOUT']),
            tags: {
                'service.name': serviceName,
                'service.version': '1.0.0',
                'environment': 'production'
            }
        }
    }

    generateSpan(traceId, parentSpanId = null) {
        const spanId = this.generateId()
        const serviceName = this.randomChoice(this.services)
        const operationName = `${serviceName.replace('-service', '')}.${this.randomChoice(['query', 'insert', 'update', 'delete', 'process'])}`
        const duration = this.randomInt(5, 500)
        const timestamp = this.generateTimestamp(this.randomInt(0, 24))
        
        return {
            spanId,
            traceId,
            parentSpanId,
            serviceName,
            operationName,
            duration,
            timestamp,
            status: this.randomChoice(['OK', 'ERROR', 'CANCELLED']),
            tags: {
                'component': this.randomChoice(['http', 'database', 'cache', 'queue']),
                'db.type': this.randomChoice(['postgresql', 'redis', 'mongodb']),
                'http.method': this.randomChoice(this.methods),
                'error': Math.random() < 0.1 ? 'true' : 'false'
            },
            logs: []
        }
    }

    generateLog(requestId, spanId = null, serviceName = null) {
        const level = this.randomChoice(this.logLevels) || 'INFO'
        const service = serviceName || this.randomChoice(this.services) || 'unknown-service'
        const messages = {
            DEBUG: [`Debug info for request ${requestId}`, 'Processing started', 'Validation passed'],
            INFO: [`Request processed successfully`, 'User authenticated', 'Data retrieved'],
            WARN: [`Slow query detected`, 'Rate limit approaching', 'Cache miss'],
            ERROR: [`Database connection failed`, 'Authentication failed', 'Validation error']
        }
        
        return {
            id: this.generateId(),
            requestId,
            spanId,
            serviceName: service,
            level,
            message: this.randomChoice(messages[level]) || `${level} message for ${service}`,
            timestamp: this.generateTimestamp(this.randomInt(0, 24)),
            metadata: {
                userId: this.randomInt(1000, 9999).toString(),
                sessionId: this.generateId().substring(0, 8),
                correlationId: this.generateId().substring(0, 12)
            }
        }
    }

    generateMockRequests(count = 50) {
        return Array.from({ length: count }, () => this.generateRequest())
    }

    generateMockTraces(requestId, count = 3) {
        return Array.from({ length: count }, () => this.generateTrace(requestId))
    }

    generateMockSpans(traceId, count = 5) {
        const spans = []
        const rootSpan = this.generateSpan(traceId)
        spans.push(rootSpan)
        
        // Generate child spans
        for (let i = 1; i < count; i++) {
            const parentSpanId = i === 1 ? rootSpan.spanId : spans[this.randomInt(0, spans.length - 1)].spanId
            spans.push(this.generateSpan(traceId, parentSpanId))
        }
        
        return spans
    }

    generateMockLogs(requestId, spanId = null, count = 10) {
        return Array.from({ length: count }, () => this.generateLog(requestId, spanId))
    }

    // Generate application logs
    generateApplicationLogs(count = 1000) {
        const logs = [];
        const now = new Date();
        
        for (let i = 0; i < count; i++) {
            const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
            const level = this.logLevels[Math.floor(Math.random() * this.logLevels.length)].toLowerCase();
            const serviceName = this.services[Math.floor(Math.random() * this.services.length)];
            const component = this.components[Math.floor(Math.random() * this.components.length)];
            const username = Math.random() > 0.3 ? this.usernames[Math.floor(Math.random() * this.usernames.length)] : null;
            const traceId = this.generateId();
            const spanId = this.generateId();
            const parentSpanId = Math.random() > 0.5 ? this.generateId() : null;
            
            logs.push({
                timestamp: timestamp.toISOString(),
                level,
                message: this.generateLogMessage(level, serviceName, component),
                component,
                username,
                requestId: this.generateId(),
                userId: username ? `user_${Math.floor(Math.random() * 1000)}` : null,
                traceId,
                spanId,
                parentSpanId,
                correlationId: this.generateId().substring(0, 12),
                operationName: `${serviceName.split('-')[0]}_operation`,
                serviceName,
                context: {
                    environment: 'development',
                    version: '1.0.0',
                    instance: `${serviceName}-${Math.floor(Math.random() * 3) + 1}`
                },
                error: level === 'error' ? {
                    type: 'ApplicationError',
                    message: 'Sample error message',
                    stack: 'Error stack trace...'
                } : null,
                application: 'bootifyjs-app'
            });
        }
        
        return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    generateLogMessage(level, serviceName, component) {
        const messages = {
            debug: [`Debug info for ${serviceName}`, `${component} processing started`, 'Validation passed'],
            info: [`${serviceName} processed successfully`, 'User authenticated', 'Data retrieved'],
            warn: [`Slow query detected in ${component}`, 'Rate limit approaching', 'Cache miss'],
            error: [`${component} connection failed`, 'Authentication failed', 'Validation error']
        };
        return this.randomChoice(messages[level] || messages.info);
    }

    // Generate access logs
    generateAccessLogs(count = 800) {
        const logs = [];
        const now = new Date();
        
        for (let i = 0; i < count; i++) {
            const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
            const method = this.methods[Math.floor(Math.random() * this.methods.length)];
            const path = this.paths[Math.floor(Math.random() * this.paths.length)];
            const statusCode = this.statusCodes[Math.floor(Math.random() * this.statusCodes.length)];
            const responseTime = Math.random() * 2000 + 10;
            const username = Math.random() > 0.4 ? this.usernames[Math.floor(Math.random() * this.usernames.length)] : null;
            const traceId = this.generateId();
            const spanId = this.generateId();
            const serviceName = this.services[Math.floor(Math.random() * this.services.length)];
            
            logs.push({
                timestamp: timestamp.toISOString(),
                level: 'info',
                message: `${method} ${path} ${statusCode} ${responseTime.toFixed(2)}ms`,
                method,
                url: `http://localhost:3000${path}`,
                path,
                statusCode,
                responseTime: parseFloat(responseTime.toFixed(2)),
                contentLength: Math.floor(Math.random() * 10000),
                username,
                requestId: this.generateId(),
                userId: username ? `user_${Math.floor(Math.random() * 1000)}` : null,
                traceId,
                spanId,
                parentSpanId: Math.random() > 0.5 ? this.generateId() : null,
                correlationId: this.generateId().substring(0, 12),
                operationName: `${method} ${path}`,
                serviceName,
                ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
                userAgent: this.userAgents[Math.floor(Math.random() * this.userAgents.length)],
                context: {
                    referer: Math.random() > 0.5 ? 'http://localhost:3000/dashboard' : null,
                    sessionId: this.generateId().substring(0, 8)
                },
                error: statusCode >= 400 ? {
                    type: 'HttpError',
                    message: `HTTP ${statusCode} error`
                } : null,
                application: 'bootifyjs-app'
            });
        }
        
        return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Generate audit logs
    generateAuditLogs(count = 500) {
        const logs = [];
        const now = new Date();
        
        for (let i = 0; i < count; i++) {
            const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
            const action = this.auditActions[Math.floor(Math.random() * this.auditActions.length)];
            const resource = this.auditResources[Math.floor(Math.random() * this.auditResources.length)];
            const username = this.usernames[Math.floor(Math.random() * this.usernames.length)];
            const success = Math.random() > 0.1;
            
            logs.push({
                timestamp: timestamp.toISOString(),
                level: 'info',
                message: `User ${username} performed ${action} on ${resource}`,
                action,
                resource,
                resourceId: `${resource}_${Math.floor(Math.random() * 1000)}`,
                username,
                userId: `user_${Math.floor(Math.random() * 1000)}`,
                success,
                ip: `192.168.1.${Math.floor(Math.random() * 255)}`,
                userAgent: this.userAgents[Math.floor(Math.random() * this.userAgents.length)],
                sessionId: this.generateId().substring(0, 8),
                requestId: this.generateId(),
                traceId: this.generateId(),
                spanId: this.generateId(),
                correlationId: this.generateId().substring(0, 12),
                changes: action === 'UPDATE' ? {
                    before: { status: 'active' },
                    after: { status: 'inactive' }
                } : null,
                context: {
                    environment: 'development',
                    application: 'bootifyjs-app'
                }
            });
        }
        
        return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Generate event logs
    generateEventLogs(count = 600) {
        const logs = [];
        const now = new Date();
        
        for (let i = 0; i < count; i++) {
            const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
            const eventType = this.eventTypes[Math.floor(Math.random() * this.eventTypes.length)];
            const eventName = this.eventNames[Math.floor(Math.random() * this.eventNames.length)];
            const serviceName = this.services[Math.floor(Math.random() * this.services.length)];
            const username = Math.random() > 0.3 ? this.usernames[Math.floor(Math.random() * this.usernames.length)] : null;
            
            logs.push({
                timestamp: timestamp.toISOString(),
                level: 'info',
                message: `Event ${eventName} occurred`,
                eventType,
                eventName,
                eventId: this.generateId(),
                serviceName,
                username,
                userId: username ? `user_${Math.floor(Math.random() * 1000)}` : null,
                requestId: this.generateId(),
                traceId: this.generateId(),
                spanId: this.generateId(),
                correlationId: this.generateId().substring(0, 12),
                payload: {
                    orderId: eventName.includes('order') ? `order_${Math.floor(Math.random() * 1000)}` : null,
                    amount: eventName.includes('payment') ? Math.floor(Math.random() * 1000) : null,
                    productId: eventName.includes('inventory') ? `product_${Math.floor(Math.random() * 100)}` : null
                },
                context: {
                    environment: 'development',
                    application: 'bootifyjs-app',
                    version: '1.0.0'
                }
            });
        }
        
        return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Generate spans for distributed tracing
    generateSpans(count = 400) {
        const spans = [];
        const now = new Date();
        
        for (let i = 0; i < count; i++) {
            const timestamp = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
            const serviceName = this.services[Math.floor(Math.random() * this.services.length)];
            const operationName = `${serviceName.replace('-service', '')}.${this.randomChoice(['query', 'insert', 'update', 'delete', 'process'])}`;
            const duration = Math.random() * 1000 + 1;
            const status = this.spanStatuses[Math.floor(Math.random() * this.spanStatuses.length)];
            const traceId = this.generateId();
            const spanId = this.generateId();
            const parentSpanId = Math.random() > 0.4 ? this.generateId() : null;
            
            spans.push({
                timestamp: timestamp.toISOString(),
                traceId,
                spanId,
                parentSpanId,
                operationName,
                serviceName,
                duration: parseFloat(duration.toFixed(2)),
                status,
                tags: {
                    'service.name': serviceName,
                    'service.version': '1.0.0',
                    'environment': 'development',
                    'component': this.randomChoice(['http', 'database', 'cache', 'queue']),
                    'db.type': this.randomChoice(['postgresql', 'redis', 'mongodb']),
                    'http.method': this.randomChoice(this.methods),
                    'error': status === 'error' ? 'true' : 'false'
                },
                logs: status === 'error' ? [{
                    timestamp: timestamp.toISOString(),
                    level: 'error',
                    message: 'Span error occurred'
                }] : [],
                requestId: this.generateId(),
                correlationId: this.generateId().substring(0, 12)
            });
        }
        
        return spans.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    // Generate comprehensive dataset
    generateDataset() {
        const requests = this.generateMockRequests(100)
        const allTraces = []
        const allSpans = []
        const allLogs = []
        
        requests.forEach(request => {
            const traces = this.generateMockTraces(request.requestId, this.randomInt(1, 3))
            allTraces.push(...traces)
            
            traces.forEach(trace => {
                const spans = this.generateMockSpans(trace.traceId, this.randomInt(3, 8))
                allSpans.push(...spans)
                
                spans.forEach(span => {
                    const logs = this.generateMockLogs(request.requestId, span.spanId, this.randomInt(2, 5))
                    allLogs.push(...logs)
                })
            })
        })
        
        return {
            requests,
            traces: allTraces,
            spans: allSpans,
            logs: allLogs,
            applicationLogs: this.generateApplicationLogs(),
            accessLogs: this.generateAccessLogs(),
            auditLogs: this.generateAuditLogs(),
            eventLogs: this.generateEventLogs(),
            distributedSpans: this.generateSpans()
        }
    }

    // Search and filter helpers
    filterRequests(requests, filters = {}) {
        return requests.filter(request => {
            if (filters.method && request.method !== filters.method) return false
            if (filters.statusCode && request.statusCode !== parseInt(filters.statusCode)) return false
            if (filters.path && !request.path.includes(filters.path)) return false
            if (filters.startTime && new Date(request.timestamp) < new Date(filters.startTime)) return false
            if (filters.endTime && new Date(request.timestamp) > new Date(filters.endTime)) return false
            return true
        })
    }

    filterLogs(logs, filters = {}) {
        return logs.filter(log => {
            if (filters.requestId && log.requestId !== filters.requestId) return false
            if (filters.serviceName && log.serviceName !== filters.serviceName) return false
            if (filters.level && log.level !== filters.level) return false
            if (filters.message && !log.message.toLowerCase().includes(filters.message.toLowerCase())) return false
            if (filters.startTime && new Date(log.timestamp) < new Date(filters.startTime)) return false
            if (filters.endTime && new Date(log.timestamp) > new Date(filters.endTime)) return false
            return true
        })
    }

    paginateResults(results, page = 1, limit = 50) {
        const startIndex = (page - 1) * limit
        const endIndex = startIndex + limit
        return {
            data: results.slice(startIndex, endIndex),
            pagination: {
                page,
                limit,
                total: results.length,
                totalPages: Math.ceil(results.length / limit)
            }
        }
    }
}

module.exports = MockDataGenerator