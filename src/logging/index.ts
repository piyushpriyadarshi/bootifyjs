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

// System info (startup banners)
export * from './core/system-info'

// Startup loggers
export { EnhancedStartupLogger } from './core/enhanced-startup-logger'
export { StartupLoggerService } from './core/startup.logger'
export { StreamingStartupLogger } from './core/streaming-startup-logger'

// Decorators
export * from './core/decorators'
