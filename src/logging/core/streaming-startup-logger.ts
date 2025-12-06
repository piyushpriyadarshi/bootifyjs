import * as os from 'os'
import { DEFAULT_SERVER_PORT } from '../../constants'
import { Autowired, Service } from '../../core'
import { Logger } from './logger'

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
}

interface ComponentInfo {
    name: string
    startTime: number
    endTime?: number
}

@Service({ eager: true })
export class StreamingStartupLogger {
    private startupStartTime: number
    private currentComponent: ComponentInfo | null = null
    private showColors: boolean
    private indent = '  '

    @Autowired(Logger)
    private readonly logger!: Logger

    constructor() {
        this.startupStartTime = Date.now()
        this.showColors = this.shouldShowColors()
    }

    // ============ Public API ============

    public logStartupBanner(): void {
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

 ${this.colorize(':: BootifyJS Framework ::', colors.bright)}        ${this.colorize(`(v${version})`, colors.cyan)}
`
        console.log(banner)

        // Log startup info
        const timestamp = new Date().toISOString()
        console.log(`${this.colorize('Starting BootifyJS Application', colors.bright)} ${this.colorize(`on ${os.hostname()}`, colors.dim)}`)
        console.log(`${this.colorize('Started by', colors.dim)} ${os.userInfo().username} ${this.colorize('in', colors.dim)} ${process.cwd()}`)
        console.log(`${this.colorize('The following profiles are active:', colors.dim)} ${this.colorize(process.env.NODE_ENV || 'development', colors.cyan)}`)
        console.log('')
    }

    public logPhaseStart(phase: string): void {
        console.log(`${this.colorize('═'.repeat(60), colors.gray)}`)
        console.log(`${this.colorize(`▶ ${phase}`, colors.bright + colors.cyan)}`)
        console.log(`${this.colorize('─'.repeat(60), colors.gray)}`)
    }

    public logComponentStart(component: string, details?: string): void {
        this.currentComponent = {
            name: component,
            startTime: Date.now(),
        }

        const detailsStr = details ? this.colorize(` : ${details}`, colors.dim) : ''
        process.stdout.write(`${this.indent}${component}${detailsStr} ... `)
    }

    public logComponentComplete(duration?: number): void {
        if (!this.currentComponent) return

        const actualDuration = duration || (Date.now() - this.currentComponent.startTime)
        const durationStr = this.colorize(`${actualDuration}ms`, colors.gray)

        console.log(`${this.colorize('✓', colors.green)} ${durationStr}`)

        this.logger.info(`${this.currentComponent.name} initialized`, {
            component: this.currentComponent.name,
            duration: actualDuration,
        })

        this.currentComponent = null
    }

    public logComponentFailed(error: Error): void {
        if (!this.currentComponent) return

        console.log(`${this.colorize('✗', colors.yellow)}`)
        console.log(`${this.indent}${this.colorize('└─ Error:', colors.yellow)} ${error.message}`)

        this.logger.error(`${this.currentComponent.name} failed`, error)

        this.currentComponent = null
    }

    public logInfo(message: string, value?: string): void {
        const valueStr = value ? this.colorize(value, colors.cyan) : ''
        console.log(`${this.indent}${this.colorize('•', colors.blue)} ${message} ${valueStr}`)
    }

    public logStartupComplete(): void {
        const totalDuration = Date.now() - this.startupStartTime
        const seconds = (totalDuration / 1000).toFixed(3)

        console.log('')
        console.log(`${this.colorize('═'.repeat(60), colors.gray)}`)
        console.log(`${this.colorize('✓ Application Startup Complete', colors.bright + colors.green)}`)
        console.log(`${this.colorize('─'.repeat(60), colors.gray)}`)
    }

    public logStartupSummary(port?: number, host?: string): void {
        const totalDuration = Date.now() - this.startupStartTime
        const seconds = (totalDuration / 1000).toFixed(3)
        const actualPort = port || process.env.PORT || DEFAULT_SERVER_PORT
        const actualHost = host || 'localhost'

        // Startup complete message
        console.log(`${this.colorize('Started BootifyJS Application in', colors.dim)} ${this.colorize(seconds, colors.bright)} ${this.colorize('seconds', colors.dim)}`)
        console.log('')

        // Server info
        console.log(`${this.colorize('Server:', colors.dim)}`)
        console.log(`${this.indent}${this.colorize('•', colors.blue)} HTTP: ${this.colorize(`http://${actualHost}:${actualPort}`, colors.bright + colors.cyan)}`)
        console.log(`${this.indent}${this.colorize('•', colors.blue)} Docs: ${this.colorize(`http://${actualHost}:${actualPort}/api-docs`, colors.cyan)}`)
        console.log('')

        // System info
        const memUsage = process.memoryUsage()
        console.log(`${this.colorize('System:', colors.dim)}`)
        console.log(`${this.indent}${this.colorize('•', colors.blue)} Node.js: ${this.colorize(process.version, colors.cyan)}`)
        console.log(`${this.indent}${this.colorize('•', colors.blue)} Memory: ${this.colorize(this.formatMemory(memUsage.heapUsed), colors.cyan)} / ${this.formatMemory(memUsage.heapTotal)}`)
        console.log(`${this.indent}${this.colorize('•', colors.blue)} CPUs: ${this.colorize(String(os.cpus().length), colors.cyan)}`)
        console.log('')

        console.log(`${this.colorize('═'.repeat(60), colors.gray)}`)
        console.log('')
    }

    // ============ Private Methods ============

    private shouldShowColors(): boolean {
        if (process.env.CI || process.env.NO_COLOR) {
            return false
        }
        return process.stdout.isTTY || false
    }

    private colorize(text: string, color: string): string {
        if (!this.showColors) {
            return text
        }
        return `${color}${text}${colors.reset}`
    }

    private getVersion(): string {
        try {
            const fs = require('fs')
            const path = require('path')

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
            // Fallback
        }

        return process.env.SERVICE_VERSION || '1.0.0'
    }

    private formatMemory(bytes: number): string {
        const mb = bytes / 1024 / 1024
        return `${mb.toFixed(2)} MB`
    }
}
