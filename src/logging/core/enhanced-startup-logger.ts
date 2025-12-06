import * as os from 'os'
import { DEFAULT_SERVER_PORT } from '../../constants'
import { Autowired, Service } from '../../core'
import { Logger } from './logger'

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',

    // Foreground colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

    // Background colors
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
}

// Startup modes
export enum StartupMode {
    SILENT = 'silent',     // Minimal output
    NORMAL = 'normal',     // Default output
    VERBOSE = 'verbose',   // Detailed output
    DEBUG = 'debug',       // Maximum detail
    JSON = 'json',         // Machine-readable JSON
}

// Component categories
export enum ComponentCategory {
    CORE = 'core',
    MIDDLEWARE = 'middleware',
    PLUGIN = 'plugin',
    CONTROLLER = 'controller',
    SERVICE = 'service',
    DATABASE = 'database',
    CACHE = 'cache',
    EXTERNAL = 'external',
}

interface ComponentMetrics {
    name: string
    category: ComponentCategory
    startTime: number
    endTime?: number
    duration?: number
    status: 'starting' | 'completed' | 'failed' | 'warning'
    error?: Error
    details?: Record<string, any>
    memoryBefore?: NodeJS.MemoryUsage
    memoryAfter?: NodeJS.MemoryUsage
}

interface StartupConfig {
    mode: StartupMode
    showColors: boolean
    performanceThreshold: number // ms - warn if component takes longer
    slowStartupThreshold: number // ms - warn if total startup is slow
    enableHealthCheck: boolean
    validateConfig: boolean
}

@Service({ eager: true })
export class EnhancedStartupLogger {
    private startupStartTime: number
    private components: Map<string, ComponentMetrics> = new Map()
    private config: StartupConfig
    private healthChecks: Map<string, () => Promise<boolean>> = new Map()

    @Autowired(Logger)
    private readonly logger!: Logger

    constructor() {
        this.startupStartTime = Date.now()
        this.config = {
            mode: this.getStartupMode(),
            showColors: this.shouldShowColors(),
            performanceThreshold: Number(process.env.STARTUP_PERF_THRESHOLD) || 1000,
            slowStartupThreshold: Number(process.env.SLOW_STARTUP_THRESHOLD) || 5000,
            enableHealthCheck: process.env.ENABLE_HEALTH_CHECK !== 'false',
            validateConfig: process.env.VALIDATE_CONFIG !== 'false',
        }
    }

    // ============ Public API ============

    public logStartupBanner(): void {
        if (this.config.mode === StartupMode.SILENT || this.config.mode === StartupMode.JSON) {
            return
        }

        const banner = this.createStartupBanner()
        console.log(banner)

        this.logger.info('Application startup initiated', {
            component: 'Application',
            phase: 'starting',
            mode: this.config.mode,
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version,
            platform: os.platform(),
            arch: os.arch(),
            memory: this.formatMemory(os.totalmem()),
            cpus: os.cpus().length,
            hostname: os.hostname(),
        })
    }

    public logComponentStart(
        component: string,
        category: ComponentCategory = ComponentCategory.CORE,
        details?: Record<string, any>
    ): void {
        const metrics: ComponentMetrics = {
            name: component,
            category,
            startTime: Date.now(),
            status: 'starting',
            details,
            memoryBefore: process.memoryUsage(),
        }

        this.components.set(component, metrics)

        if (this.config.mode === StartupMode.JSON) {
            console.log(JSON.stringify({ event: 'component_start', ...metrics }))
            return
        }

        if (this.config.mode !== StartupMode.SILENT) {
            const icon = this.getCategoryIcon(category)
            const msg = this.colorize(`${icon} Starting ${component}...`, colors.dim)

            if (this.config.mode === StartupMode.VERBOSE || this.config.mode === StartupMode.DEBUG) {
                console.log(msg)
            }
        }

        this.logger.debug(`Starting ${component}`, {
            component,
            category,
            phase: 'starting',
            details,
        })
    }

    public logComponentComplete(
        component: string,
        details?: Record<string, any>
    ): void {
        const metrics = this.components.get(component)
        if (!metrics) {
            this.logger.warn(`Component ${component} completed but was never started`)
            return
        }

        metrics.endTime = Date.now()
        metrics.duration = metrics.endTime - metrics.startTime
        metrics.status = 'completed'
        metrics.details = { ...metrics.details, ...details }
        metrics.memoryAfter = process.memoryUsage()

        // Check for performance issues
        if (metrics.duration > this.config.performanceThreshold) {
            metrics.status = 'warning'
            this.logPerformanceWarning(component, metrics.duration)
        }

        if (this.config.mode === StartupMode.JSON) {
            console.log(JSON.stringify({ event: 'component_complete', ...metrics }))
            return
        }

        if (this.config.mode !== StartupMode.SILENT) {
            const icon = metrics.status === 'warning' ? '⚠️' : '✅'
            const color = metrics.status === 'warning' ? colors.yellow : colors.green
            const durationStr = this.colorize(`(${metrics.duration}ms)`, colors.gray)
            const msg = this.colorize(`${icon} ${component} initialized`, color)

            console.log(`${msg} ${durationStr}`)

            // Show memory delta in debug mode
            if (this.config.mode === StartupMode.DEBUG && metrics.memoryBefore && metrics.memoryAfter) {
                const memDelta = metrics.memoryAfter.heapUsed - metrics.memoryBefore.heapUsed
                const memStr = this.formatMemory(Math.abs(memDelta))
                const sign = memDelta > 0 ? '+' : '-'
                console.log(this.colorize(`   Memory: ${sign}${memStr}`, colors.gray))
            }
        }

        this.logger.info(`${component} initialized successfully`, {
            component: metrics.name,
            category: metrics.category,
            phase: 'completed',
            duration: metrics.duration,
            memoryDelta: metrics.memoryAfter && metrics.memoryBefore
                ? metrics.memoryAfter.heapUsed - metrics.memoryBefore.heapUsed
                : undefined,
            details: metrics.details,
        })
    }

    public logComponentFailed(
        component: string,
        error: Error,
        details?: Record<string, any>
    ): void {
        const metrics = this.components.get(component)
        if (metrics) {
            metrics.endTime = Date.now()
            metrics.duration = metrics.endTime - metrics.startTime
            metrics.status = 'failed'
            metrics.error = error
            metrics.details = { ...metrics.details, ...details }
        }

        if (this.config.mode === StartupMode.JSON) {
            console.log(JSON.stringify({
                event: 'component_failed',
                component,
                error: error.message,
                stack: error.stack,
                ...metrics,
            }))
            return
        }

        const errorMsg = this.colorize(`❌ ${component} initialization failed`, colors.red)
        console.error(errorMsg)
        console.error(this.colorize(`   Error: ${error.message}`, colors.red))

        // Show suggestions for common errors
        const suggestion = this.getErrorSuggestion(error)
        if (suggestion) {
            console.error(this.colorize(`   💡 Suggestion: ${suggestion}`, colors.yellow))
        }

        // Show stack trace in debug mode
        if (this.config.mode === StartupMode.DEBUG && error.stack) {
            console.error(this.colorize(`   Stack:`, colors.gray))
            error.stack.split('\n').slice(1, 5).forEach(line => {
                console.error(this.colorize(`   ${line}`, colors.gray))
            })
        }

        this.logger.error(`${component} initialization failed`, error, {
            component,
            phase: 'failed',
            duration: metrics?.duration,
            details,
        })
    }

    public logStartupComplete(): void {
        const totalDuration = Date.now() - this.startupStartTime

        // Check for slow startup
        if (totalDuration > this.config.slowStartupThreshold) {
            this.logSlowStartupWarning(totalDuration)
        }

        if (this.config.mode === StartupMode.JSON) {
            console.log(JSON.stringify({
                event: 'startup_complete',
                duration: totalDuration,
                components: Array.from(this.components.values()),
            }))
            return
        }

        this.logger.info('Application startup completed', {
            component: 'Application',
            phase: 'completed',
            duration: totalDuration,
            memoryUsage: process.memoryUsage(),
            componentCount: this.components.size,
        })
    }

    public async logStartupSummary(port?: number, host?: string): Promise<void> {
        const totalDuration = Date.now() - this.startupStartTime
        const actualPort = port || process.env.PORT || DEFAULT_SERVER_PORT
        const actualHost = host || 'localhost'

        // Run health checks if enabled
        let healthStatus = 'unknown'
        if (this.config.enableHealthCheck && this.healthChecks.size > 0) {
            healthStatus = await this.runHealthChecks() ? 'healthy' : 'unhealthy'
        }

        if (this.config.mode === StartupMode.JSON) {
            console.log(JSON.stringify({
                event: 'startup_summary',
                duration: totalDuration,
                port: actualPort,
                host: actualHost,
                health: healthStatus,
                components: this.getComponentSummary(),
            }))
            return
        }

        if (this.config.mode === StartupMode.SILENT) {
            console.log(`Server started on http://${actualHost}:${actualPort}`)
            return
        }

        // Build summary
        const summary = this.buildStartupSummary(totalDuration, actualPort, actualHost, healthStatus)
        console.log(summary)

        // Show component breakdown in verbose/debug mode
        if (this.config.mode === StartupMode.VERBOSE || this.config.mode === StartupMode.DEBUG) {
            this.logComponentBreakdown()
        }
    }

    public registerHealthCheck(name: string, check: () => Promise<boolean>): void {
        this.healthChecks.set(name, check)
    }

    public setMode(mode: StartupMode): void {
        this.config.mode = mode
    }

    // ============ Private Methods ============

    private getStartupMode(): StartupMode {
        const mode = process.env.STARTUP_MODE?.toLowerCase()
        switch (mode) {
            case 'silent': return StartupMode.SILENT
            case 'verbose': return StartupMode.VERBOSE
            case 'debug': return StartupMode.DEBUG
            case 'json': return StartupMode.JSON
            default: return StartupMode.NORMAL
        }
    }

    private shouldShowColors(): boolean {
        // Disable colors in CI or if NO_COLOR is set
        if (process.env.CI || process.env.NO_COLOR) {
            return false
        }
        // Check if terminal supports colors
        return process.stdout.isTTY || false
    }

    private colorize(text: string, color: string): string {
        if (!this.config.showColors) {
            return text
        }
        return `${color}${text}${colors.reset}`
    }

    private getCategoryIcon(category: ComponentCategory): string {
        const icons = {
            [ComponentCategory.CORE]: '🔧',
            [ComponentCategory.MIDDLEWARE]: '🔀',
            [ComponentCategory.PLUGIN]: '🔌',
            [ComponentCategory.CONTROLLER]: '🎮',
            [ComponentCategory.SERVICE]: '⚙️',
            [ComponentCategory.DATABASE]: '💾',
            [ComponentCategory.CACHE]: '📦',
            [ComponentCategory.EXTERNAL]: '🌐',
        }
        return icons[category] || '📌'
    }

    private logPerformanceWarning(component: string, duration: number): void {
        if (this.config.mode === StartupMode.SILENT || this.config.mode === StartupMode.JSON) {
            return
        }

        const msg = this.colorize(
            `⚠️  Performance Warning: ${component} took ${duration}ms to initialize (threshold: ${this.config.performanceThreshold}ms)`,
            colors.yellow
        )
        console.warn(msg)

        this.logger.warn(`Slow component initialization`, {
            component,
            duration,
            threshold: this.config.performanceThreshold,
        })
    }

    private logSlowStartupWarning(duration: number): void {
        if (this.config.mode === StartupMode.SILENT || this.config.mode === StartupMode.JSON) {
            return
        }

        const msg = this.colorize(
            `⚠️  Slow Startup Warning: Application took ${duration}ms to start (threshold: ${this.config.slowStartupThreshold}ms)`,
            colors.yellow
        )
        console.warn(msg)
        console.warn(this.colorize(`   Consider optimizing slow components or enabling lazy loading`, colors.yellow))
    }

    private getErrorSuggestion(error: Error): string | null {
        const message = error.message.toLowerCase()

        if (message.includes('econnrefused')) {
            return 'Check if the service is running and the connection details are correct'
        }
        if (message.includes('eaddrinuse')) {
            return 'Port is already in use. Try a different port or stop the conflicting process'
        }
        if (message.includes('module not found') || message.includes('cannot find module')) {
            return 'Install missing dependencies with: npm install'
        }
        if (message.includes('permission denied') || message.includes('eacces')) {
            return 'Check file/directory permissions or run with appropriate privileges'
        }
        if (message.includes('timeout')) {
            return 'Increase timeout value or check network connectivity'
        }
        if (message.includes('authentication') || message.includes('unauthorized')) {
            return 'Verify credentials and authentication configuration'
        }

        return null
    }

    private async runHealthChecks(): Promise<boolean> {
        const results = await Promise.allSettled(
            Array.from(this.healthChecks.entries()).map(async ([name, check]) => {
                try {
                    const result = await check()
                    return { name, healthy: result }
                } catch (error) {
                    return { name, healthy: false, error }
                }
            })
        )

        let allHealthy = true
        for (const result of results) {
            if (result.status === 'fulfilled') {
                const { name, healthy } = result.value
                if (!healthy) {
                    allHealthy = false
                    console.warn(this.colorize(`⚠️  Health check failed: ${name}`, colors.yellow))
                }
            }
        }

        return allHealthy
    }

    private getComponentSummary() {
        const summary: Record<string, any> = {}

        for (const [category, _] of Object.entries(ComponentCategory)) {
            const components = Array.from(this.components.values())
                .filter(c => c.category === category.toLowerCase())

            if (components.length > 0) {
                summary[category.toLowerCase()] = {
                    count: components.length,
                    totalDuration: components.reduce((sum, c) => sum + (c.duration || 0), 0),
                    avgDuration: components.reduce((sum, c) => sum + (c.duration || 0), 0) / components.length,
                    failed: components.filter(c => c.status === 'failed').length,
                    warnings: components.filter(c => c.status === 'warning').length,
                }
            }
        }

        return summary
    }

    private buildStartupSummary(
        totalDuration: number,
        port: number | string,
        host: string,
        healthStatus: string
    ): string {
        const lines: string[] = ['']

        // Header
        lines.push(this.colorize('🚀 BootifyJS Application Started Successfully', colors.bright + colors.green))
        lines.push(this.colorize('─'.repeat(60), colors.gray))

        // Timing
        const durationColor = totalDuration > this.config.slowStartupThreshold ? colors.yellow : colors.green
        lines.push(`⏱️  Total startup time: ${this.colorize(`${totalDuration}ms`, durationColor)}`)

        // Environment
        lines.push(`🔧 Environment: ${this.colorize(process.env.NODE_ENV || 'development', colors.cyan)}`)
        lines.push(`📦 Node.js: ${this.colorize(process.version, colors.cyan)}`)

        // Memory
        const memUsage = process.memoryUsage()
        lines.push(`💾 Memory usage: ${this.colorize(this.formatMemory(memUsage.heapUsed), colors.cyan)} / ${this.formatMemory(memUsage.heapTotal)}`)

        // Server info
        lines.push(`🌐 Server: ${this.colorize(`http://${host}:${port}`, colors.bright + colors.blue)}`)
        lines.push(`📚 API Docs: ${this.colorize(`http://${host}:${port}/api-docs`, colors.bright + colors.blue)}`)

        // Health status
        if (healthStatus !== 'unknown') {
            const healthColor = healthStatus === 'healthy' ? colors.green : colors.red
            const healthIcon = healthStatus === 'healthy' ? '✅' : '❌'
            lines.push(`${healthIcon} Health: ${this.colorize(healthStatus, healthColor)}`)
        }

        // Component summary
        const componentCount = this.components.size
        const failedCount = Array.from(this.components.values()).filter(c => c.status === 'failed').length
        const warningCount = Array.from(this.components.values()).filter(c => c.status === 'warning').length

        lines.push(`📊 Components: ${this.colorize(String(componentCount), colors.cyan)} initialized`)
        if (warningCount > 0) {
            lines.push(`   ${this.colorize(`⚠️  ${warningCount} warnings`, colors.yellow)}`)
        }
        if (failedCount > 0) {
            lines.push(`   ${this.colorize(`❌ ${failedCount} failed`, colors.red)}`)
        }

        lines.push(this.colorize('─'.repeat(60), colors.gray))
        lines.push('')

        return lines.join('\n')
    }

    private logComponentBreakdown(): void {
        console.log(this.colorize('\n📊 Component Breakdown:', colors.bright))
        console.log(this.colorize('─'.repeat(60), colors.gray))

        // Group by category
        const byCategory = new Map<ComponentCategory, ComponentMetrics[]>()
        for (const component of this.components.values()) {
            const list = byCategory.get(component.category) || []
            list.push(component)
            byCategory.set(component.category, list)
        }

        // Display each category
        for (const [category, components] of byCategory.entries()) {
            const icon = this.getCategoryIcon(category)
            console.log(`\n${icon} ${this.colorize(category.toUpperCase(), colors.bright)}`)

            // Sort by duration (slowest first)
            components.sort((a, b) => (b.duration || 0) - (a.duration || 0))

            for (const comp of components) {
                const statusIcon = comp.status === 'completed' ? '✅' : comp.status === 'warning' ? '⚠️' : '❌'
                const durationColor = (comp.duration || 0) > this.config.performanceThreshold ? colors.yellow : colors.gray
                const duration = this.colorize(`${comp.duration || 0}ms`, durationColor)
                console.log(`  ${statusIcon} ${comp.name.padEnd(30)} ${duration}`)
            }
        }

        console.log(this.colorize('\n' + '─'.repeat(60), colors.gray))
    }

    private createStartupBanner(): string {
        const version = this.getVersion()
        const banner = `
  ____              _   _  __       _ ____  
 |  _ \\            | | (_)/ _|     | / ___| 
 | |_) | ___   ___ | |_ _| |_ _   _| \\___ \\ 
 |  _ < / _ \\ / _ \\| __| |  _| | | | |___) |
 | |_) | (_) | (_) | |_| | | | |_| | |____/ 
 |____/ \\___/ \\___/ \\__|_|_|  \\__, |_|      
                              __/ |        
                             |___/         

 :: BootifyJS Framework ::        (v${version})
`
        return this.colorize(banner, colors.cyan)
    }

    private getVersion(): string {
        try {
            // Try to read from package.json
            const fs = require('fs')
            const path = require('path')

            // Look for package.json in common locations
            const possiblePaths = [
                path.join(process.cwd(), 'package.json'),
                path.join(__dirname, '../../../package.json'),
                path.join(__dirname, '../../package.json'),
            ]

            for (const pkgPath of possiblePaths) {
                if (fs.existsSync(pkgPath)) {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
                    if (pkg.version) {
                        return pkg.version
                    }
                }
            }
        } catch (error) {
            // Fallback to environment variable or default
        }

        return process.env.SERVICE_VERSION || '1.0.0'
    }

    private formatMemory(bytes: number): string {
        const mb = bytes / 1024 / 1024
        return `${mb.toFixed(2)} MB`
    }
}
