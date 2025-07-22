import pino from 'pino'
import { LogContext, requestContext } from '../middlewares/requestcontext.middleware'
import path from 'path'

interface AppLogPayload {
  // For general application messages
  message: string
  [key: string]: any // Allow other custom fields
}

interface AuditLogPayload {
  // Based on your AuditLog type
  action: string
  resources: string[]
  details: any // Renamed from 'data' to avoid conflict if 'data' is a generic field
  [key: string]: any
}

interface EventLogPayload {
  // Based on your EventLog type
  eventName: string
  status: 'success' | 'failure' | 'pending'
  metadata: any
  [key: string]: any
}
class Logger {
  private pinoInstance: pino.Logger
  private static instance: Logger

  private constructor() {
    const basePinoOptions: pino.LoggerOptions = {
      level: process.env.LOG_LEVEL || 'info',
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
      messageKey: 'message', // Consistent message key
      base: {
        // Remove default pino fields if not needed
        pid: undefined,
        hostname: undefined,
      },
      formatters: {
        level: (label: string) => ({ level: label.toLowerCase() }), // Ensure lowercase level
      },
      mixin: () => {
        const store = requestContext.getStore()
        return {
          // Common context fields from AsyncLocalStorage
          requestId: store?.requestId,
          userId: store?.userId, // This might be overridden by specific log methods like audit
          traceId: store?.traceId,
          username: store?.username,
          // 'additionalContext' from ALS will be merged into the 'context' field for ClickHouse by the transport
          //   context: store?.additionalContext || {},
        }
      },
    }

    const transports = []
    const clickHouseTransportPath = path.resolve(__dirname, 'pino-clickhouse-transport.js')

    transports.push({
      level: 'info', // Minimum level for ClickHouse transport
      //   target: clickHouseTransportPath,
      options: {
        url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
        username: process.env.CLICKHOUSE_USER || 'default',
        password: process.env.CLICKHOUSE_PASSWORD || '',
        database: process.env.CLICKHOUSE_DB || 'default',
        maxBatchSize: parseInt(process.env.CLICKHOUSE_MAX_BATCH_SIZE || '1000', 10),
        flushInterval: parseInt(process.env.CLICKHOUSE_FLUSH_INTERVAL || '3000', 10),
        application: process.env.APP_NAME || 'my-application',
      },
    })

    if (process.env.NODE_ENV !== 'production') {
      transports.push({
        level: 'debug',
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname,context,username,requestId,userId,traceId,application',
          messageKey: 'message', // Ensure pino-pretty uses the same messageKey
        },
      })
    }

    this.pinoInstance = pino({
      ...basePinoOptions,
      //   transport: transports.length > 0 ? { targets: transports } : undefined,
    })
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      try {
        Logger.instance = new Logger()
      } catch (error: any) {
        console.error('CRITICAL: Error creating logger instance:', error.message)
        // Fallback to a very basic console logger if main setup fails
        const fallbackPino = pino({ level: 'info', messageKey: 'message' })
        fallbackPino.error(
          { err: error },
          'Fallback console logger activated due to error in primary logger setup.'
        )
        const fallbackInstance = Object.create(Logger.prototype) as Logger
        fallbackInstance.pinoInstance = fallbackPino
        Logger.instance = fallbackInstance
      }
    }
    return Logger.instance
  }

  /**
   * Provides access to the raw pino instance, primarily for use with pino-http.
   */
  public getPinoInstance(): pino.Logger {
    return this.pinoInstance
  }

  // --- Application Logging Methods ---
  private appLog(level: pino.Level, payload: AppLogPayload): void {
    this.pinoInstance[level]({ ...payload, logType: 'application' })
  }
  public info(message: string, data?: Record<string, any>): void {
    this.appLog('info', { message, ...data })
  }
  public error(message: string, error?: Error, data?: Record<string, any>): void {
    const payload: AppLogPayload = { message, ...data }
    if (error) {
      payload.err = error // pino stdSerializers.err will handle this
    }
    this.appLog('error', payload)
  }
  public warn(message: string, data?: Record<string, any>): void {
    this.appLog('warn', { message, ...data })
  }
  public debug(message: string, data?: Record<string, any>): void {
    this.appLog('debug', { message, ...data })
  }
  public fatal(message: string, error?: Error, data?: Record<string, any>): void {
    const payload: AppLogPayload = { message, ...data }
    if (error) {
      payload.err = error
    }
    this.appLog('fatal', payload)
  }
  public trace(message: string, data?: Record<string, any>): void {
    this.appLog('trace', { message, ...data })
  }

  // --- Audit Logging Method ---
  public audit(payload: AuditLogPayload): void {
    // userId from payload will override userId from mixin if both exist
    this.pinoInstance.info({ ...payload, logType: 'audit' })
  }

  // --- Event Logging Method ---
  public event(payload: EventLogPayload): void {
    this.pinoInstance.info({ ...payload, logType: 'event' })
  }

  // --- Child Logger ---
  public child(bindings: Partial<LogContext> & Record<string, any> = {}): Logger {
    // Create a new pino child logger instance with additional static bindings
    const pinoChild = this.pinoInstance.child(bindings)
    // Create a new Logger wrapper for this pino child
    const childLoggerInstance = Object.create(Logger.prototype) as Logger
    childLoggerInstance.pinoInstance = pinoChild
    return childLoggerInstance
  }
}

const logger = Logger.getInstance()

export default logger
