/**
 * Logging Interfaces - Strategy Pattern
 * 
 * These interfaces define the contracts for the logging system.
 * Users can implement these to create custom logging backends.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogContext {
    [key: string]: any
}

export interface LogEntry {
    level: LogLevel
    message: string
    timestamp: Date
    context?: LogContext
    error?: Error
}

/**
 * Core logging interface - implement this to create custom loggers
 */
export interface ILogger {
    trace(message: string, context?: LogContext): void
    debug(message: string, context?: LogContext): void
    info(message: string, context?: LogContext): void
    warn(message: string, context?: LogContext): void
    error(message: string, error?: Error, context?: LogContext): void
    fatal(message: string, error?: Error, context?: LogContext): void
    child(bindings: LogContext): ILogger
}

/**
 * Transport interface - implement this to send logs to different destinations
 */
export interface ILogTransport {
    readonly name: string
    write(entry: LogEntry): void | Promise<void>
    flush?(): Promise<void>
    close?(): Promise<void>
}

/**
 * Log formatter interface - implement this to customize log output format
 */
export interface ILogFormatter {
    format(entry: LogEntry): string | object
}

/**
 * Context provider interface - implement this to add dynamic context to logs
 */
export interface IContextProvider {
    getContext(): LogContext
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
    level: LogLevel
    serviceName: string
    transports?: ILogTransport[]
    formatter?: ILogFormatter
    contextProviders?: IContextProvider[]
    /** Base context added to all logs */
    baseContext?: LogContext
}

/**
 * Startup logger interface
 */
export interface IStartupLogger {
    logStartupBanner(): void
    logPhaseStart(phase: string): void
    logComponentStart(component: string, details?: string): void
    logComponentComplete(details?: string): void
    logComponentFailed(error: Error): void
    logStartupComplete(): void
    logStartupSummary(port: number, host: string): void
}
