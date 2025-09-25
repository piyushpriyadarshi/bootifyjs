class EnhancedTracingDashboard {
    constructor() {
        this.currentTab = 'logs-explorer'
        this.currentView = 'table'
        this.currentPage = 1
        this.pageSize = 50
        this.totalPages = 1
        this.logs = []
        this.filteredLogs = []
        this.sortBy = 'timestamp'
        this.sortOrder = 'DESC'
        this.filters = {
            requestId: '',
            serviceName: '',
            level: '',
            message: '',
            startTime: '',
            endTime: ''
        }
        this.init()
    }

    init() {
        this.bindEvents()
        this.loadInitialData()
        this.showTab(this.currentTab)
    }

    bindEvents() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab
                this.showTab(tab)
                
                // Initialize tab-specific functionality
                if (tab === 'service-stats') {
                    setTimeout(() => initServiceStats(), 100);
                } else if (tab === 'service-map') {
                    setTimeout(() => initServiceMap(), 100);
                }
            })
        })

        // View mode switching
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view
                this.switchView(view)
            })
        })

        // Search and filters
        document.getElementById('searchLogsBtn').addEventListener('click', () => {
            this.searchLogs()
        })

        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            this.clearFilters()
        })

        // Filter inputs
        Object.keys(this.filters).forEach(key => {
            const element = document.getElementById(`${key}Filter`)
            if (element) {
                element.addEventListener('input', (e) => {
                    this.filters[key] = e.target.value
                })
            }
        })

        // Pagination
        document.getElementById('prevPageBtn').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--
                this.searchLogs()
            }
        })

        document.getElementById('nextPageBtn').addEventListener('click', () => {
            if (this.currentPage < this.totalPages) {
                this.currentPage++
                this.searchLogs()
            }
        })

        // Table sorting
        document.querySelectorAll('.logs-table th[data-sort]').forEach(th => {
            th.addEventListener('click', (e) => {
                const sortField = e.currentTarget.dataset.sort
                this.sortLogs(sortField)
            })
        })

        // Export functionality
        document.getElementById('exportLogsBtn').addEventListener('click', () => {
            this.exportLogs()
        })

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            this.refreshData()
        })
    }

    async loadInitialData() {
        try {
            // Load filter options
            await Promise.all([
                this.loadServices(),
                this.loadLogLevels()
            ])
            
            // Load initial logs
            await this.searchLogs()
        } catch (error) {
            console.error('Error loading initial data:', error)
            this.showError('Failed to load initial data')
        }
    }

    async loadServices() {
        try {
            const response = await fetch('/api/logs/services')
            const services = await response.json()
            
            const select = document.getElementById('serviceFilter')
            select.innerHTML = '<option value="">All Services</option>'
            
            services.forEach(service => {
                const option = document.createElement('option')
                option.value = service
                option.textContent = service
                select.appendChild(option)
            })
        } catch (error) {
            console.error('Error loading services:', error)
        }
    }

    async loadLogLevels() {
        try {
            const response = await fetch('/api/logs/levels')
            const levels = await response.json()
            
            const select = document.getElementById('levelFilter')
            select.innerHTML = '<option value="">All Levels</option>'
            
            levels.forEach(level => {
                const option = document.createElement('option')
                option.value = level
                option.textContent = level.toUpperCase()
                select.appendChild(option)
            })
        } catch (error) {
            console.error('Error loading log levels:', error)
        }
    }

    async searchLogs() {
        try {
            this.showLoading(true)
            
            const params = new URLSearchParams({
                ...this.filters,
                limit: this.pageSize,
                offset: (this.currentPage - 1) * this.pageSize,
                sortBy: this.sortBy,
                sortOrder: this.sortOrder
            })

            // Remove empty filters
            for (const [key, value] of params.entries()) {
                if (!value) {
                    params.delete(key)
                }
            }

            const response = await fetch(`/api/logs/search?${params}`)
            const data = await response.json()
            
            this.logs = data.logs
            this.totalPages = Math.ceil(data.total / this.pageSize)
            
            this.renderLogs()
            this.updatePagination()
        } catch (error) {
            console.error('Error searching logs:', error)
            this.showError('Failed to search logs')
        } finally {
            this.showLoading(false)
        }
    }

    renderLogs() {
        switch (this.currentView) {
            case 'table':
                this.renderTableView()
                break
            case 'list':
                this.renderListView()
                break
            case 'json':
                this.renderJsonView()
                break
        }
    }

    renderTableView() {
        const tbody = document.getElementById('logsTableBody')
        
        if (this.logs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state">
                        <h3>No logs found</h3>
                        <p>Try adjusting your search criteria.</p>
                    </td>
                </tr>
            `
            return
        }

        tbody.innerHTML = this.logs.map(log => `
            <tr>
                <td>${this.formatTimestamp(log.timestamp)}</td>
                <td><span class="log-level ${log.level}">${log.level}</span></td>
                <td>${log.serviceName || 'N/A'}</td>
                <td class="log-message">${this.truncateText(log.message, 100)}</td>
                <td>${log.requestId || 'N/A'}</td>
                <td>
                    <button class="btn btn-outline" onclick="dashboard.viewLogDetails('${log.requestId}', '${log.spanId}')">
                        <i class="fas fa-eye"></i>
                    </button>
                </td>
            </tr>
        `).join('')
    }

    renderListView() {
        const container = document.getElementById('logsListContainer')
        
        if (this.logs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No logs found</h3>
                    <p>Try adjusting your search criteria.</p>
                </div>
            `
            return
        }

        container.innerHTML = this.logs.map(log => `
            <div class="log-item fade-in">
                <div class="log-header">
                    <div>
                        <span class="log-level ${log.level}">${log.level}</span>
                        <span style="margin-left: 1rem; color: #6c757d; font-size: 0.875rem;">
                            ${this.formatTimestamp(log.timestamp)}
                        </span>
                    </div>
                    <div style="font-size: 0.75rem; color: #6c757d;">
                        ${log.serviceName || 'Unknown Service'} | ${log.requestId || 'No Request ID'}
                    </div>
                </div>
                <div class="log-message">${log.message}</div>
                ${log.error ? `<div style="color: #dc3545; margin-top: 0.5rem; font-size: 0.875rem;">${log.error}</div>` : ''}
            </div>
        `).join('')
    }

    renderJsonView() {
        const container = document.getElementById('logsJsonContainer')
        container.textContent = JSON.stringify(this.logs, null, 2)
    }

    switchView(view) {
        // Update active view button
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active')
        })
        document.querySelector(`[data-view="${view}"]`).classList.add('active')

        // Show/hide view containers
        document.querySelectorAll('.logs-view').forEach(container => {
            container.classList.remove('active')
        })
        document.getElementById(`logs${view.charAt(0).toUpperCase() + view.slice(1)}View`).classList.add('active')

        this.currentView = view
        this.renderLogs()
    }

    showTab(tabName) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active')
        })
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active')

        // Show/hide tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active')
        })
        document.getElementById(tabName).classList.add('active')

        this.currentTab = tabName
    }

    sortLogs(field) {
        if (this.sortBy === field) {
            this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC'
        } else {
            this.sortBy = field
            this.sortOrder = 'DESC'
        }
        
        this.currentPage = 1
        this.searchLogs()
    }

    clearFilters() {
        // Reset all filters
        Object.keys(this.filters).forEach(key => {
            this.filters[key] = ''
            const element = document.getElementById(`${key}Filter`)
            if (element) {
                element.value = ''
            }
        })
        
        this.currentPage = 1
        this.searchLogs()
    }

    updatePagination() {
        const prevBtn = document.getElementById('prevPageBtn')
        const nextBtn = document.getElementById('nextPageBtn')
        const pageInfo = document.getElementById('pageInfo')
        
        prevBtn.disabled = this.currentPage <= 1
        nextBtn.disabled = this.currentPage >= this.totalPages
        pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`
    }

    async exportLogs() {
        try {
            const params = new URLSearchParams(this.filters)
            
            // Remove empty filters
            for (const [key, value] of params.entries()) {
                if (!value) {
                    params.delete(key)
                }
            }
            
            const response = await fetch(`/api/logs/search?${params}&limit=10000`)
            const data = await response.json()
            
            // Create CSV content
            const headers = ['Timestamp', 'Level', 'Service', 'Message', 'Request ID', 'Trace ID', 'Span ID']
            const csvContent = [
                headers.join(','),
                ...data.logs.map(log => [
                    log.timestamp,
                    log.level,
                    log.serviceName || '',
                    `"${log.message.replace(/"/g, '""')}"`,
                    log.requestId || '',
                    log.traceId || '',
                    log.spanId || ''
                ].join(','))
            ].join('\n')
            
            // Download file
            const blob = new Blob([csvContent], { type: 'text/csv' })
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `logs-${new Date().toISOString().split('T')[0]}.csv`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Error exporting logs:', error)
            alert('Failed to export logs')
        }
    }

    async refreshData() {
        await this.loadInitialData()
    }

    viewLogDetails(requestId, spanId) {
        // Switch to traces tab and filter by request/span
        this.showTab('traces')
        // Implementation for viewing specific log details
        console.log('View details for:', { requestId, spanId })
    }

    showLoading(show) {
        const logsResults = document.querySelector('.logs-results')
        
        if (show) {
            logsResults.style.opacity = '0.5'
            logsResults.style.pointerEvents = 'none'
        } else {
            logsResults.style.opacity = '1'
            logsResults.style.pointerEvents = 'auto'
        }
    }

    showError(message) {
        const container = document.querySelector('.logs-results')
        container.innerHTML = `
            <div class="error">
                <h3>Error</h3>
                <p>${message}</p>
            </div>
        `
    }

    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString()
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text
        return text.substring(0, maxLength) + '...'
    }
}

// Service Statistics functionality
let performanceChart = null;
let errorChart = null;

function initServiceStats() {
    loadServiceStats();
    setupStatsEventListeners();
    initializeCharts();
}

function setupStatsEventListeners() {
    const refreshBtn = document.getElementById('refresh-stats');
    const timeRangeSelect = document.getElementById('stats-time-range');

    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadServiceStats);
    }

    if (timeRangeSelect) {
        timeRangeSelect.addEventListener('change', loadServiceStats);
    }
}

async function loadServiceStats() {
    try {
        const timeRange = document.getElementById('stats-time-range')?.value || '24h';
        
        // Load overview stats
        const statsResponse = await fetch(`/api/service-stats?timeRange=${timeRange}`);
        const statsData = await statsResponse.json();
        updateOverviewCards(statsData);

        // Load service health data
        const healthResponse = await fetch(`/api/service-health?timeRange=${timeRange}`);
        const healthData = await healthResponse.json();
        updateServiceHealthTable(healthData.services || []);

        // Load performance metrics for charts
        const metricsResponse = await fetch(`/api/performance-metrics?timeRange=${timeRange}&interval=1h`);
        const metricsData = await metricsResponse.json();
        updateCharts(metricsData);

    } catch (error) {
        console.error('Error loading service stats:', error);
        showNotification('Error loading service statistics', 'error');
    }
}

function updateOverviewCards(data) {
    const overview = data.overview || {};
    
    document.getElementById('total-services').textContent = overview.totalServices || '0';
    document.getElementById('error-rate').textContent = `${(overview.errorRate || 0).toFixed(2)}%`;
    document.getElementById('avg-response-time').textContent = `${(overview.avgResponseTime || 0).toFixed(0)}ms`;
    document.getElementById('total-requests').textContent = (overview.totalRequests || 0).toLocaleString();
}

function updateServiceHealthTable(services) {
    const tbody = document.querySelector('#service-health-table tbody');
    if (!tbody) return;

    tbody.innerHTML = services.map(service => {
        const statusClass = getStatusClass(service.status);
        const uptime = ((service.uptime || 0) * 100).toFixed(2);
        const errorRate = ((service.errorRate || 0) * 100).toFixed(2);
        const avgResponseTime = (service.avgResponseTime || 0).toFixed(0);
        const totalRequests = (service.totalRequests || 0).toLocaleString();
        const lastSeen = new Date(service.lastSeen).toLocaleString();

        return `
            <tr>
                <td><strong>${service.service}</strong></td>
                <td><span class="status-badge ${statusClass}">${service.status}</span></td>
                <td>${uptime}%</td>
                <td>${errorRate}%</td>
                <td>${avgResponseTime}ms</td>
                <td>${totalRequests}</td>
                <td>${lastSeen}</td>
            </tr>
        `;
    }).join('');
}

function getStatusClass(status) {
    switch (status?.toLowerCase()) {
        case 'healthy': return 'status-healthy';
        case 'warning': return 'status-warning';
        case 'critical': return 'status-critical';
        default: return 'status-warning';
    }
}

function initializeCharts() {
    const performanceCtx = document.getElementById('performance-chart');
    const errorCtx = document.getElementById('error-chart');

    if (performanceCtx) {
        performanceChart = new Chart(performanceCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Avg Response Time (ms)',
                    data: [],
                    borderColor: '#3498db',
                    backgroundColor: 'rgba(52, 152, 219, 0.1)',
                    tension: 0.4
                }, {
                    label: 'Request Count',
                    data: [],
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    yAxisID: 'y1',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Response Time (ms)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Request Count'
                        },
                        grid: {
                            drawOnChartArea: false,
                        }
                    }
                }
            }
        });
    }

    if (errorCtx) {
        errorChart = new Chart(errorCtx, {
            type: 'doughnut',
            data: {
                labels: ['Success', 'Client Error', 'Server Error'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#27ae60', '#f39c12', '#e74c3c']
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }
}

function updateCharts(data) {
    if (performanceChart && data.timeline) {
        const labels = data.timeline.map(item => new Date(item.timestamp).toLocaleTimeString());
        const responseTimes = data.timeline.map(item => item.avgResponseTime || 0);
        const requestCounts = data.timeline.map(item => item.requestCount || 0);

        performanceChart.data.labels = labels;
        performanceChart.data.datasets[0].data = responseTimes;
        performanceChart.data.datasets[1].data = requestCounts;
        performanceChart.update();
    }

    if (errorChart && data.statusDistribution) {
        const dist = data.statusDistribution;
        errorChart.data.datasets[0].data = [
            dist.success || 0,
            dist.clientError || 0,
            dist.serverError || 0
        ];
        errorChart.update();
    }
}

// Service Map functionality
function initServiceMap() {
    // Service map implementation would go here
    console.log('Service map initialized');
}

// Initialize enhanced dashboard
const dashboard = new EnhancedTracingDashboard()