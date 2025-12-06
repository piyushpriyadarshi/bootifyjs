/**
 * BootifyJS Logging Module
 * 
 * A flexible, extensible logging system using Builder and Strategy patterns.
 * 
 * Quick Start:
 * ```typescript
 * import { createLogger, RequestContextProvider } from 'bootifyjs/logging'
 * 
 * // Simple usage
 * const logger = createLogger()
 *   .setLevel('debug')
 *   .setServiceName('my-api')
 *   .build()
 * 
 * logger.info('Hello world')
 * ```
 * 
 * Custom Transport:
 * ```typescript
 * import { ILogTransport, LogEntry } from 'bootifyjs/logging'
 * 
 * class MyTransport implements ILogTransport {
 *   name = 'my-transport'
 *   write(entry: LogEntry) {
 *     // Send to your logging service
 *   }
 * }
 * 
 * createLogger()
 *   .addTransport(new MyTransport())
 *   .build()
 * ```
 * 
 * Using Pino:
 * ```typescript
 * import { createLogger, PinoAdapter } from 'bootifyjs/logging'
 * 
 * createLogger()
 *   .useCustomLogger(PinoAdapter)
 * ```
 */

// Core interfaces (Strategy pattern contracts)
export * from './core/interfaces'

// Builder pattern
export { createLogger, getLogger, LOGGER_TOKEN, LoggerBuilder } from './core/logger-builder'

// Default implementations
export { BaseLogger } from './core/base-logger'

// Transports
export { ConsoleTransport, ConsoleTransportOptions } from './core/transports/console.transport'

// Context providers
export { RequestContextProvider } from './core/context-providers/request-context.provider'

// Adapters (for using external logging libraries)
export { PinoAdapter, PinoAdapterOptions } from './core/adapters/pino.adapter'

// Startup loggers
export { EnhancedStartupLogger } from './core/enhanced-startup-logger'
export { StartupLoggerService } from './core/startup.logger'
export { StreamingStartupLogger } from './core/streaming-startup-logger'

// Legacy exports (for backward compatibility)
export { Logger } from './core/logger'
export { loggerFactory, LOGGER_TOKEN as PINO_LOGGER_TOKEN } from './core/logger.provider'

// Decorators
export * from './core/decorators'

// ============================================================================
// Initialization Functions
// ============================================================================

import { container } from '../core/di-container'
import { EnhancedStartupLogger } from './core/enhanced-startup-logger'
import { Logger } from './core/logger'
import { LOGGER_TOKEN, loggerFactory } from './core/logger.provider'
import { StartupLoggerService } from './core/startup.logger'
import { StreamingStartupLogger } from './core/streaming-startup-logger'

/**
 * @deprecated Use createLogger() builder instead
 */
export async function intitializeLogging(): Promise<{
  logger: Logger
  startupLogger: StartupLoggerService
}> {
  container.register(LOGGER_TOKEN, { useFactory: loggerFactory })
  return {
    logger: container.resolve<Logger>(Logger),
    startupLogger: container.resolve<StartupLoggerService>(StartupLoggerService),
  }
}

/**
 * @deprecated Use createLogger() builder instead
 */
export async function initializeEnhancedLogging(): Promise<{
  logger: Logger
  startupLogger: EnhancedStartupLogger
}> {
  container.register(LOGGER_TOKEN, { useFactory: loggerFactory })
  return {
    logger: container.resolve<Logger>(Logger),
    startupLogger: container.resolve<EnhancedStartupLogger>(EnhancedStartupLogger),
  }
}

/**
 * Initialize streaming startup logger (Spring Boot style)
 */
export async function initializeStreamingLogging(): Promise<{
  logger: Logger
  startupLogger: StreamingStartupLogger
}> {
  container.register(LOGGER_TOKEN, { useFactory: loggerFactory })
  return {
    logger: container.resolve<Logger>(Logger),
    startupLogger: container.resolve<StreamingStartupLogger>(StreamingStartupLogger),
  }
}
