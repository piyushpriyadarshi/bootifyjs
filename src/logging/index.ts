/**
 * BootifyJS Logging Module
 * 
 * A flexible, extensible logging system using Builder and Strategy patterns.
 * The core module has NO external logging library dependencies.
 * Users can provide their own ILogger implementation.
 * 
 * Quick Start (using built-in BaseLogger):
 * ```typescript
 * import { createLogger } from 'bootifyjs/logging'
 * 
 * const logger = createLogger()
 *   .setLevel('debug')
 *   .setServiceName('my-api')
 *   .build()
 * 
 * logger.info('Hello world')
 * ```
 * 
 * Using a custom logger (Pino, Winston, etc.):
 * ```typescript
 * import { createLogger, ILogger } from 'bootifyjs/logging'
 * 
 * // Create your own adapter that implements ILogger
 * class MyPinoAdapter implements ILogger {
 *   // ... implement ILogger interface
 * }
 * 
 * createLogger()
 *   .use(new MyPinoAdapter({ level: 'debug' }))
 *   .build()
 * ```
 * 
 * Custom Transport (for BaseLogger):
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
 */

// Core interfaces (Strategy pattern contracts)
export * from './core/interfaces'

// Builder pattern
export {
  createLogger,
  getLogger,
  isLoggerInitialized,
  LOGGER_TOKEN,
  LoggerBuilder
} from './core/logger-builder'

// Default implementations
export { BaseLogger } from './core/base-logger'

// Transports
export { ConsoleTransport, ConsoleTransportOptions } from './core/transports/console.transport'

// Context providers
export { RequestContextProvider } from './core/context-providers/request-context.provider'

// NOTE: No adapters are provided by the framework.
// Users must create their own adapters that implement ILogger interface.
// See documentation for examples of Pino, Winston, Bunyan adapters.

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
