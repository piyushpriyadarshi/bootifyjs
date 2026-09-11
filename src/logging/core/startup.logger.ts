import { DEFAULT_SERVER_PORT } from '../../constants'
import { Autowired, Service } from '../../core'
import { BaseLogger } from './base-logger'
import type { ILogger } from './interfaces'
import { DefaultSystemInfoProvider, SystemInfoProvider } from './system-info'

interface StartupLogPayload {
  component: string
  phase: 'starting' | 'completed' | 'failed'
  duration?: number
  details?: Record<string, any>
}

@Service({ eager: true }) // Eagerly load to ensure it's available at startup
export class StartupLoggerService {
  private startupStartTime: number
  private componentTimings: Map<string, number> = new Map()
  @Autowired(BaseLogger)
  private readonly logger!: ILogger

  /** Injectable system facts (tests provide static data). */
  public systemInfoProvider: SystemInfoProvider = new DefaultSystemInfoProvider()
  constructor() {
    this.startupStartTime = Date.now()
  }

  public logStartupBanner(): void {
    const banner = this.createStartupBanner()
    console.log(banner) // Always log banner to console for visibility

    this.logger.info('Application startup initiated', {
      component: 'Application',
      phase: 'starting',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: this.systemInfoProvider.get().platform,
      arch: this.systemInfoProvider.get().arch,
      memory: this.formatMemory(this.systemInfoProvider.get().totalMemoryBytes),
      cpus: this.systemInfoProvider.get().cpuCount,
    })
  }

  public logComponentStart(component: string, details?: Record<string, any>): void {
    this.componentTimings.set(component, Date.now())

    const payload: StartupLogPayload = { component, phase: 'starting', details }
    this.logger.debug(`Starting ${component}`, payload)
  }

  public logComponentComplete(component: string, details?: Record<string, any>): void {
    const startTime = this.componentTimings.get(component)
    const duration = startTime ? Date.now() - startTime : undefined

    const payload: StartupLogPayload = { component, phase: 'completed', duration, details }
    this.logger.info(`${component} initialized successfully`, payload)

    if (startTime) {
      this.componentTimings.delete(component)
    }
  }

  public logComponentFailed(component: string, error: Error, details?: Record<string, any>): void {
    const startTime = this.componentTimings.get(component)
    const duration = startTime ? Date.now() - startTime : undefined

    const payload: StartupLogPayload = { component, phase: 'failed', duration, details }
    this.logger.error(`${component} initialization failed`, error, payload)

    if (startTime) {
      this.componentTimings.delete(component)
    }
  }

  public logStartupComplete(): void {
    const totalDuration = Date.now() - this.startupStartTime

    this.logger.info('Application startup completed', {
      component: 'Application',
      phase: 'completed',
      duration: totalDuration,
      memoryUsage: process.memoryUsage(),
    })

    // if (process.env.NODE_ENV === 'development') {
    // this.logStartupSummary()
    // }
  }

  logStartupSummary(port?: number, host?: string, options: { docsPath?: string } = {}): void {
    const totalDuration = Date.now() - this.startupStartTime
    const actualPort = port || process.env.PORT || DEFAULT_SERVER_PORT
    const actualHost = host || 'localhost'
    const summary = [
      '',
      '🚀 BootifyJS Application Started Successfully',
      '─'.repeat(50),
      `⏱️  Total startup time: ${totalDuration}ms`,
      `🔧 Environment: ${process.env.NODE_ENV || 'development'}`,
      `📦 Node.js: ${process.version}`,
      `💾 Memory usage: ${this.formatMemory(process.memoryUsage().heapUsed)}`,
      `🌐 Server: http://${actualHost}:${actualPort}`,
      ...(options.docsPath ? [`📚 API Docs: http://${actualHost}:${actualPort}${options.docsPath}`] : []),
      '─'.repeat(50),
      '',
    ].join('\n')

    console.log(summary)
  }

  private createStartupBanner(): string {
    const version = this.systemInfoProvider.get().appVersion
    return `
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
  }

  private formatMemory(bytes: number): string {
    const mb = bytes / 1024 / 1024
    return `${mb.toFixed(2)} MB`
  }
}
