import pino from 'pino'
import { LoggingConfigService } from '../config/logging.config'
import { container, requestContextStore } from '../../core'
import { AppConfig } from '../../config/AppConfig'

// 1. Define a unique DI token for our logger instance
export const LOGGER_TOKEN = Symbol.for('Logger')

// 2. The factory function

export const loggerFactory = (): pino.Logger => {
  const appConfig = AppConfig.getInstance()

  console.log(appConfig.get('LOG_LEVEL'))

  const pinoOptions: pino.LoggerOptions = {
    level: appConfig.get('LOG_LEVEL'),
    messageKey: 'message',
    base: {
      service: appConfig.get('SERVICE_NAME'),
      pid: process.pid,
    },
    mixin() {
      const store = requestContextStore.getStore()
      if (!store) {
        return {}
      }
      return Object.fromEntries(store.entries())
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  }

  const transportTargets: pino.TransportTargetOptions[] = []

  // Add console transport for development
  if (appConfig.get('LOG_LEVEL') === 'debug') {
    transportTargets.push({
      target: 'pino-pretty',
      level: 'debug',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname,service' },
    })
  } else {
    // Structured JSON logs for production
    transportTargets.push({
      target: 'pino/file', // pino/file writes to stdout by default
      level: 'info',
      options: {},
    })
  }

  // Add ClickHouse transport if enabled
  if (appConfig.get('CLICKHOUSE_ENABLED')) {
    transportTargets.push({
      target: './clickhouse.transport.js', // Path relative to the running script
      level: 'info',
      options: {
        url: appConfig.get('CLICKHOUSE_URL'),
        username: appConfig.get('CLICKHOUSE_USER'),
        password: appConfig.get('CLICKHOUSE_PASSWORD'),
        database: appConfig.get('CLICKHOUSE_DB'),
        application: appConfig.get('SERVICE_NAME'),
      },
    })
  }
  console.log('targets', transportTargets)

  return pino({ ...pinoOptions, transport: { targets: transportTargets } })
}

// 3. Register the factory with the DI container
container.register(LOGGER_TOKEN, { useFactory: loggerFactory })
