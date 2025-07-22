import pino from 'pino'
import { LogContextService } from './log-context.service'
import {
  LoggingConfig,
  LogPayload,
  AuditLogPayload,
  EventLogPayload,
  PerformanceLogPayload,
} from '../types/logging.types'
import { LoggingMetricsService } from '../metrics/logging-metrics.service'

export class LoggerService {
  private static instance: LoggerService
  private pinoInstance: pino.Logger
  private config: LoggingConfig

  private constructor(config: LoggingConfig) {
    this.config = config
    this.pinoInstance = this.createPinoInstance()
  }

  static getInstance(config?: LoggingConfig): LoggerService {
    if (!LoggerService.instance) {
      if (!config) {
        throw new Error('LoggerService must be initialized with config')
      }
      LoggerService.instance = new LoggerService(config)
    }
    return LoggerService.instance
  }

  private createPinoInstance(): pino.Logger {
    const pinoOptions: pino.LoggerOptions = {
      level: this.config.level,
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      messageKey: 'message',
      base: {
        pid: process.pid,
        hostname: require('os').hostname(),
        service: this.config.serviceName,
        version: this.config.serviceVersion,
        environment: this.config.environment,
      },
      formatters: {
        bindings: (bindings: any) => ({
          ...bindings,
          service: this.config.serviceName,
        }),
      },
      serializers: {
        ...pino.stdSerializers,
        req: this.requestSerializer,
        res: this.responseSerializer,
        err: this.errorSerializer,
      },
      mixin: () => {
        const logContext = LogContextService.getLogContext()
        return {
          requestId: logContext?.requestId,
          traceId: logContext?.traceId,
          spanId: logContext?.spanId,
          userId: logContext?.userId,
          username: logContext?.username,
          correlationId: logContext?.correlationId,
          sessionId: logContext?.sessionId,
          ...logContext?.additionalContext,
        }
      },
    }

    if (this.config.transports && this.config.transports.length > 0) {
      return pino({
        ...pinoOptions,
        transport: {
          targets: this.config.transports,
        },
      })
    }

    return pino(pinoOptions)
  }

  // Custom serializers
  private requestSerializer = (req: any) => ({
    method: req.method,
    url: req.url,
    headers: this.config.logHeaders ? req.headers : undefined,
    remoteAddress: req.remoteAddress,
    remotePort: req.remotePort,
  })

  private responseSerializer = (res: any) => ({
    statusCode: res.statusCode,
    headers: this.config.logHeaders ? res.getHeaders() : undefined,
  })

  private errorSerializer = (err: Error) => ({
    type: err.constructor.name,
    stack: this.config.logStackTrace ? err.stack : undefined,
    ...err,
  })

  // Application logging methods
  trace(message: string, data?: Record<string, any>): void {
    if (this.config.enableComponentLogs) {
      this.log('trace', 'application', { message, ...data })
    }
  }

  debug(message: string, data?: Record<string, any>): void {
    if (this.config.enableComponentLogs) {
      this.log('debug', 'application', { message, ...data })
    }
  }

  info(message: string, data?: Record<string, any>): void {
    this.log('info', 'application', { message, ...data })
  }

  warn(message: string, data?: Record<string, any>): void {
    this.log('warn', 'application', { message, ...data })
  }

  error(message: string, error?: Error, data?: Record<string, any>): void {
    const payload: any = { message, ...data }
    if (error) payload.err = error
    this.log('error', 'application', payload)
  }

  fatal(message: string, error?: Error, data?: Record<string, any>): void {
    const payload: any = { message, ...data }
    if (error) payload.err = error
    this.log('fatal', 'application', payload)
  }

  // Specialized logging methods
  audit(payload: AuditLogPayload): void {
    this.log('info', 'audit', {
      logType: 'audit',
      ...payload,
      timestamp: new Date().toISOString(),
    })

    // Track audit metrics
    try {
      const metricsService = LoggingMetricsService.getInstance()
      metricsService.trackAudit(payload.action, payload.resource)
    } catch (error) {
      // Ignore if metrics service is not available
    }
  }

  event(payload: EventLogPayload): void {
    this.log('info', 'event', {
      logType: 'event',
      ...payload,
      timestamp: new Date().toISOString(),
    })

    // Track event metrics
    try {
      const metricsService = LoggingMetricsService.getInstance()
      metricsService.trackEvent(payload.eventType, payload.eventName, payload.status)
    } catch (error) {
      // Ignore if metrics service is not available
    }
  }

  performance(payload: PerformanceLogPayload): void {
    if (this.config.enablePerformanceLogs) {
      this.log('info', 'performance', {
        logType: 'performance',
        ...payload,
        timestamp: new Date().toISOString(),
      })
    }
  }

  security(message: string, data?: Record<string, any>): void {
    this.log('warn', 'security', { message, ...data })
  }

  // Startup logging methods
  startup(message: string, data?: Record<string, any>): void {
    if (this.config.enableStartupLogs) {
      this.log('info', 'startup', { message, ...data })
    }
  }

  component(message: string, data?: Record<string, any>): void {
    if (this.config.enableComponentLogs) {
      this.log('debug', 'component', { message, ...data })
    }
  }

  private log(level: pino.Level, logType: string, payload: any): void {
    const logContext = LogContextService.getLogContext()
    // console.log('logContext', logContext)
    this.pinoInstance[level]({
      ...payload,
      logType,
      component: payload.component || logType,
      timestamp: new Date().toISOString(),
      ...logContext,
    })
  }

  // Child logger creation
  child(bindings: Record<string, any> = {}): LoggerService {
    const childPino = this.pinoInstance.child(bindings)
    const childLogger = Object.create(LoggerService.prototype) as LoggerService
    childLogger.pinoInstance = childPino
    childLogger.config = this.config
    return childLogger
  }

  // Get raw pino instance for middleware integration
  getPinoInstance(): pino.Logger {
    return this.pinoInstance
  }

  // Get configuration
  getConfig(): LoggingConfig {
    return this.config
  }
}
