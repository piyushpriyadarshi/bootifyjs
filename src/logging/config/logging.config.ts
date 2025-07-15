import pino from 'pino'
import path from 'path'
import { LoggingConfig } from '../types/logging.types'
import clickHouseTransport from '../transports/clickhouse.transport1'

export class LoggingConfigService {
  static async createConfig(): Promise<LoggingConfig> {
    const environment = process.env.NODE_ENV || 'development'
    const isDevelopment = environment === 'development'

    const config: LoggingConfig = {
      level: (process.env.LOG_LEVEL as any) || (isDevelopment ? 'trace' : 'info'),
      serviceName: process.env.SERVICE_NAME || 'bootifyjs-app',
      serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
      environment,
      logHeaders: process.env.LOG_HEADERS === 'true' || isDevelopment,
      logStackTrace: process.env.LOG_STACK_TRACE !== 'false',
      enableStartupLogs: process.env.ENABLE_STARTUP_LOGS !== 'false' || isDevelopment,
      enableComponentLogs: process.env.ENABLE_COMPONENT_LOGS !== 'false' || isDevelopment,
      enablePerformanceLogs: process.env.ENABLE_PERFORMANCE_LOGS === 'true' || isDevelopment,
      rotation: {
        enabled: process.env.LOG_ROTATION_ENABLED === 'true',
        maxFiles: parseInt(process.env.LOG_MAX_FILES || '10'),
        maxSize: process.env.LOG_MAX_SIZE || '100MB',
        datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
      },
      correlation: {
        enabled: process.env.LOG_CORRELATION_ENABLED !== 'false',
        headerName: process.env.LOG_CORRELATION_HEADER || 'x-correlation-id',
      },
      performance: {
        enabled: process.env.LOG_PERFORMANCE_ENABLED === 'true' || isDevelopment,
        slowThreshold: parseInt(process.env.LOG_SLOW_THRESHOLD || '1000'),
      },
      clickhouse: {
        enabled: true,
        url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
        username: process.env.CLICKHOUSE_USERNAME || 'default',
        password: process.env.CLICKHOUSE_PASSWORD || '',
        database: process.env.CLICKHOUSE_DATABASE || 'default',
        application: process.env.SERVICE_NAME || 'bootifyjs-app',
      },
    }

    // Configure transports based on environment
    config.transports = await LoggingConfigService.createTransports(config)

    return config
  }

  private static async createTransports(config: LoggingConfig): Promise<any[]> {
    const transports: any[] = []

    if (config.environment === 'development') {
      // Pretty console output for development with detailed formatting
      transports.push({
        level: 'trace',
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          messageKey: 'message',
          levelFirst: true,
          messageFormat: '{component} {message}',
        },
      })
    } else {
      // JSON output for production
      transports.push({
        level: config.level,
        target: 'pino/file',
        options: {
          destination: 1, // stdout
        },
      })
    }

    // File transport with rotation for production
    if (config.rotation?.enabled && config.environment !== 'development') {
      const logDir = process.env.LOG_DIR || './logs'

      transports.push({
        level: 'info',
        target: 'pino-roll',
        options: {
          file: path.join(logDir, 'app.log'),
          frequency: 'daily',
          size: config.rotation.maxSize,
          limit: {
            count: config.rotation.maxFiles,
          },
        },
      })

      // Separate error log file
      transports.push({
        level: 'error',
        target: 'pino-roll',
        options: {
          file: path.join(logDir, 'error.log'),
          frequency: 'daily',
          size: config.rotation.maxSize,
          limit: {
            count: config.rotation.maxFiles,
          },
        },
      })
    }

    // Add ClickHouse transport if enabled
    if (config.clickhouse?.enabled) {
      const clickHouseOptions = {
        url: config.clickhouse.url,
        username: config.clickhouse.username,
        password: config.clickhouse.password,
        database: config.clickhouse.database,
        application: config.clickhouse.application,
        maxBatchSize: 1000,
        flushInterval: 5000,
      }

      try {
        // const transport = await clickHouseTransport(clickHouseOptions)
        // transports.push({
        //   level: 'trace',
        //   target: 'pino/file',
        //   options: {
        //     destination: transport,
        //     mkdir: true,
        //   },
        // })
        // transports.push({
        //   level: 'info' as const,
        //   target: 'pino/file',
        //   options: {
        //     destination: await clickHouseTransport({
        //       url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
        //       username: process.env.CLICKHOUSE_USER || 'default',
        //       password: process.env.CLICKHOUSE_PASSWORD || '',
        //       database: process.env.CLICKHOUSE_DB || 'default',
        //       maxBatchSize: parseInt(process.env.CLICKHOUSE_MAX_BATCH_SIZE || '1000', 10),
        //       flushInterval: parseInt(process.env.CLICKHOUSE_FLUSH_INTERVAL || '3000', 10),
        //       application: process.env.APP_NAME || 'my-application',
        //     }),
        //   },
        //   worker: {
        //     // Disable worker thread
        //     enabled: false,
        //   },
        // })
        transports.push({
          level: 'info',
          // target: './clickhouse-transport.js',
          target: path.join(__dirname, 'clickhouse-transport.js'),
          options: {
            url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
            username: process.env.CLICKHOUSE_USER || 'default',
            password: process.env.CLICKHOUSE_PASSWORD || '',
            database: process.env.CLICKHOUSE_DB || 'default',
            application: process.env.APP_NAME || 'my-application',
          },
        })
      } catch (error) {
        console.error('[LoggingConfigService] Failed to initialize ClickHouse transport:', error)
      }
    }
    console.log(transports)

    return transports
  }
}
