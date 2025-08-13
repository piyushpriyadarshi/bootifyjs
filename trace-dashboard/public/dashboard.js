class TracingDashboard {
    constructor() {
        this.requests = []
        this.init()
    }

    init() {
        this.bindEvents()
        this.loadRequests()
    }

    bindEvents() {
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.loadRequests()
        })

        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.filterRequests(e.target.value)
        })
    }

    async loadRequests() {
        try {
            this.showLoading(true)
            const response = await fetch('/api/requests')
            this.requests = await response.json()
            this.renderRequests(this.requests)
        } catch (error) {
            console.error('Error loading requests:', error)
            this.showError('Failed to load requests')
        } finally {
            this.showLoading(false)
        }
    }

    filterRequests(searchTerm) {
        const filtered = this.requests.filter(request => 
            request.url.toLowerCase().includes(searchTerm.toLowerCase()) ||
            request.method.toLowerCase().includes(searchTerm.toLowerCase()) ||
            request.requestId.includes(searchTerm)
        )
        this.renderRequests(filtered)
    }

    renderRequests(requests) {
        const container = document.getElementById('requestsList')
        
        if (requests.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No requests found</h3>
                    <p>Try adjusting your search criteria or refresh the data.</p>
                </div>
            `
            return
        }

        container.innerHTML = requests.map(request => `
            <div class="request-item" data-request-id="${request.requestId}">
                <div class="request-header" onclick="dashboard.toggleRequest('${request.requestId}')">
                    <div class="request-info">
                        <span class="request-method method-${request.method}">${request.method}</span>
                        <span class="request-url">${request.url}</span>
                        <div class="request-meta">
                            <span class="status-code status-${Math.floor(request.statusCode / 100)}xx">${request.statusCode}</span>
                            <span>${this.formatDuration(request.duration)}</span>
                            <span>${this.formatTimestamp(request.timestamp)}</span>
                            <span>ID: ${request.requestId.substring(0, 8)}...</span>
                        </div>
                    </div>
                    <span class="expand-icon">▶</span>
                </div>
                <div class="request-details" id="details-${request.requestId}">
                    <div class="traces-section">
                        <h3 class="section-title">Traces</h3>
                        <div id="traces-${request.requestId}">Loading traces...</div>
                    </div>
                </div>
            </div>
        `).join('')
    }

    async toggleRequest(requestId) {
        const header = document.querySelector(`[data-request-id="${requestId}"] .request-header`)
        const details = document.getElementById(`details-${requestId}`)
        const icon = header.querySelector('.expand-icon')
        
        if (details.classList.contains('expanded')) {
            details.classList.remove('expanded')
            header.classList.remove('active')
            icon.classList.remove('expanded')
        } else {
            details.classList.add('expanded')
            header.classList.add('active')
            icon.classList.add('expanded')
            await this.loadTraces(requestId)
        }
    }

    async loadTraces(requestId) {
        try {
            const response = await fetch(`/api/requests/${requestId}/traces`)
            const traces = await response.json()
            this.renderTraces(requestId, traces)
        } catch (error) {
            console.error('Error loading traces:', error)
            document.getElementById(`traces-${requestId}`).innerHTML = 
                '<div class="error">Failed to load traces</div>'
        }
    }

    renderTraces(requestId, traces) {
        const container = document.getElementById(`traces-${requestId}`)
        
        if (traces.length === 0) {
            container.innerHTML = '<div class="empty-state">No traces found for this request</div>'
            return
        }

        container.innerHTML = traces.map(trace => `
            <div class="trace-item" data-trace-id="${trace.traceId}">
                <div class="trace-header" onclick="dashboard.toggleTrace('${trace.traceId}')">
                    <div class="trace-info">
                        <span class="trace-id">Trace: ${trace.traceId.substring(0, 16)}...</span>
                        <span>${trace.spanCount} spans</span>
                        <span>${this.formatDuration(new Date(trace.endTime) - new Date(trace.startTime))}</span>
                    </div>
                    <span class="expand-icon">▶</span>
                </div>
                <div class="span-tree" id="spans-${trace.traceId}">
                    Loading spans...
                </div>
            </div>
        `).join('')
    }

    async toggleTrace(traceId) {
        const header = document.querySelector(`[data-trace-id="${traceId}"] .trace-header`)
        const spanTree = document.getElementById(`spans-${traceId}`)
        const icon = header.querySelector('.expand-icon')
        
        if (spanTree.classList.contains('expanded')) {
            spanTree.classList.remove('expanded')
            icon.classList.remove('expanded')
        } else {
            spanTree.classList.add('expanded')
            icon.classList.add('expanded')
            await this.loadSpans(traceId)
        }
    }

    async loadSpans(traceId) {
        try {
            const response = await fetch(`/api/traces/${traceId}/spans`)
            const spans = await response.json()
            this.renderSpans(traceId, spans)
        } catch (error) {
            console.error('Error loading spans:', error)
            document.getElementById(`spans-${traceId}`).innerHTML = 
                '<div class="error">Failed to load spans</div>'
        }
    }

    renderSpans(traceId, spans) {
        const container = document.getElementById(`spans-${traceId}`)
        container.innerHTML = this.renderSpanHierarchy(spans)
    }

    renderSpanHierarchy(spans, level = 0) {
        return spans.map(span => {
            const hasError = span.status === 'error' || span.error
            const spanClass = level === 0 ? 'root' : 'child'
            const errorClass = hasError ? 'error' : ''
            
            return `
                <div class="span-item ${spanClass} ${errorClass}" style="margin-left: ${level * 20}px">
                    <div class="span-header" onclick="dashboard.toggleSpan('${span.spanId}')">
                        <div class="span-info">
                            <span class="operation-name">${span.operationName}</span>
                            <span class="service-name">${span.serviceName}</span>
                            <span class="span-duration">${this.formatDuration(span.duration / 1000)}</span>
                            ${hasError ? '<span style="color: #dc3545;">⚠ Error</span>' : ''}
                        </div>
                        <span class="expand-icon">▶</span>
                    </div>
                    <div class="span-logs" id="logs-${span.spanId}">
                        Loading logs...
                    </div>
                    ${span.children && span.children.length > 0 ? 
                        this.renderSpanHierarchy(span.children, level + 1) : ''}
                </div>
            `
        }).join('')
    }

    async toggleSpan(spanId) {
        const header = document.querySelector(`#logs-${spanId}`).previousElementSibling
        const logs = document.getElementById(`logs-${spanId}`)
        const icon = header.querySelector('.expand-icon')
        
        if (logs.classList.contains('expanded')) {
            logs.classList.remove('expanded')
            icon.classList.remove('expanded')
        } else {
            logs.classList.add('expanded')
            icon.classList.add('expanded')
            await this.loadLogs(spanId)
        }
    }

    async loadLogs(spanId) {
        try {
            const response = await fetch(`/api/spans/${spanId}/logs`)
            const logs = await response.json()
            this.renderLogs(spanId, logs)
        } catch (error) {
            console.error('Error loading logs:', error)
            document.getElementById(`logs-${spanId}`).innerHTML = 
                '<div class="error">Failed to load logs</div>'
        }
    }

    renderLogs(spanId, logs) {
        const container = document.getElementById(`logs-${spanId}`)
        
        if (logs.length === 0) {
            container.innerHTML = '<div class="empty-state">No logs found for this span</div>'
            return
        }

        container.innerHTML = logs.map(log => `
            <div class="log-entry ${log.level}">
                <span class="log-timestamp">${this.formatTimestamp(log.timestamp)}</span>
                <span class="log-message">${log.message}</span>
                ${log.error ? `<div style="color: #dc3545; margin-top: 4px; font-size: 12px;">${log.error}</div>` : ''}
            </div>
        `).join('')
    }

    formatDuration(ms) {
        if (ms < 1000) return `${Math.round(ms)}ms`
        if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
        return `${(ms / 60000).toFixed(2)}m`
    }

    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString()
    }

    showLoading(show) {
        const spinner = document.getElementById('loadingSpinner')
        const list = document.getElementById('requestsList')
        
        if (show) {
            spinner.style.display = 'block'
            list.style.display = 'none'
        } else {
            spinner.style.display = 'none'
            list.style.display = 'block'
        }
    }

    showError(message) {
        document.getElementById('requestsList').innerHTML = `
            <div class="empty-state">
                <h3>Error</h3>
                <p>${message}</p>
            </div>
        `
    }
}

// Initialize dashboard
const dashboard = new TracingDashboard()