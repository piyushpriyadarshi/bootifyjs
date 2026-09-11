/**
 * LoggerBuilder - Builder pattern for configuring loggers
 * 
 * Provides a fluent API for constructing loggers with custom configuration.
 * The core module has NO external logging library dependencies.
 * Users can provide their own ILogger implementation (Pino, Winston, etc.)
 */
import { container as globalContainer } from '../../core/di-container'
import type { Container } from '../../core/di-container'
import { BaseLogger } from './base-logger'
import {
    IContextProvider,
    ILogger,
    ILogTransport,
    LogContext,
    LogLevel,
} from './interfaces'
import { ConsoleTransport, ConsoleTransportOptions } from './transports/console.transport'

export const LOGGER_TOKEN = Symbol.for('BootifyLogger')

export class LoggerBuilder {
    private level: LogLevel = 'info'
    private serviceName: string = 'bootify-app'
    private transports: ILogTransport[] = []
    private contextProviders: IContextProvider[] = []
    private baseContext: LogContext = {}
    private useDefaultConsole: boolean = true
    private consoleOptions: ConsoleTransportOptions = {}
    private customLogger?: ILogger

    /**
     * Set the minimum log level
     */
    setLevel(level: LogLevel): this {
        this.level = level
        return this
    }

    /**
     * Set the service name (added to all logs)
     */
    setServiceName(name: string): this {
        this.serviceName = name
        return this
    }

    /**
     * Add base context that will be included in all logs
     */
    setBaseContext(context: LogContext): this {
        this.baseContext = { ...this.baseContext, ...context }
        return this
    }

    /**
     * Add a custom transport (for BaseLogger)
     */
    addTransport(transport: ILogTransport): this {
        this.transports.push(transport)
        return this
    }

    /**
     * Add a context provider for dynamic context (for BaseLogger)
     */
    addContextProvider(provider: IContextProvider): this {
        this.contextProviders.push(provider)
        return this
    }

    /**
     * Configure the default console transport (for BaseLogger)
     */
    configureConsole(options: ConsoleTransportOptions): this {
        this.consoleOptions = options
        return this
    }

    /**
     * Disable the default console transport (for BaseLogger)
     */
    disableConsole(): this {
        this.useDefaultConsole = false
        return this
    }

    /**
     * Use a custom logger instance that implements ILogger.
     * This allows using any logging library (Pino, Winston, Bunyan, etc.)
     * 
     * @example
     * // Using Pino (user provides the adapter)
     * import { PinoAdapter } from './my-pino-adapter'
     * 
     * createLogger()
     *   .use(new PinoAdapter({ level: 'debug', prettyPrint: true }))
     *   .build()
     * 
     * @example
     * // Using Winston
     * import { WinstonAdapter } from './my-winston-adapter'
     * 
     * createLogger()
     *   .use(new WinstonAdapter({ level: 'info' }))
     *   .build()
     */
    use(logger: ILogger): this {
        this.customLogger = logger
        return this
    }

    /**
     * Use a factory function to create the logger.
     * Useful when the logger needs async initialization or complex setup.
     * 
     * @example
     * createLogger()
     *   .useFactory(() => {
     *     const pino = require('pino')
     *     return new MyPinoWrapper(pino({ level: 'debug' }))
     *   })
     *   .build()
     */
    useFactory(factory: () => ILogger): this {
        this.customLogger = factory()
        return this
    }

    /**
     * Build and register the logger with a DI container
     * (defaults to the global container).
     */
    build(targetContainer: Container = globalContainer): ILogger {
        let logger: ILogger

        if (this.customLogger) {
            // Use the custom logger provided by user
            logger = this.customLogger
        } else {
            // Use the built-in BaseLogger with transports
            const allTransports = [...this.transports]

            if (this.useDefaultConsole) {
                allTransports.unshift(new ConsoleTransport(this.consoleOptions))
            }

            logger = new BaseLogger({
                level: this.level,
                serviceName: this.serviceName,
                transports: allTransports,
                contextProviders: this.contextProviders,
                baseContext: {
                    service: this.serviceName,
                    ...this.baseContext,
                },
            })
        }

        this.registerLogger(logger, targetContainer)
        return logger
    }

    private registerLogger(logger: ILogger, targetContainer: Container): void {
        targetContainer.register(LOGGER_TOKEN, { useFactory: () => logger, override: true })
        targetContainer.register(BaseLogger, { useFactory: () => logger, override: true })
        loggerInitialized = true
    }
}

// Track if logger has been initialized
let loggerInitialized = false

/**
 * Create a new logger builder
 */
export function createLogger(): LoggerBuilder {
    return new LoggerBuilder()
}

/**
 * Get the registered logger from DI container.
 * 
 * @throws Error if logger has not been initialized yet.
 * Call createLogger().build() or use createBootifyApp().useLogger() first.
 */
export function getLogger(): ILogger {
    if (!loggerInitialized) {
        try {
            const logger = globalContainer.resolve<ILogger>(LOGGER_TOKEN)
            loggerInitialized = true
            return logger
        } catch {
            throw new Error(
                '[BootifyJS] Logger not initialized. ' +
                'Make sure to call createBootifyApp().build() or createLogger().build() before using getLogger(). ' +
                'If using BootifyApp, getLogger() can only be called in beforeStart/afterStart hooks or after build() completes.'
            )
        }
    }
    return globalContainer.resolve<ILogger>(LOGGER_TOKEN)
}

/**
 * Check if logger has been initialized
 */
export function isLoggerInitialized(): boolean {
    if (loggerInitialized) return true
    try {
        globalContainer.resolve<ILogger>(LOGGER_TOKEN)
        loggerInitialized = true
        return true
    } catch {
        return false
    }
}

/**
 * Reset logger state (useful for testing)
 * @internal
 */
export function resetLogger(): void {
    // Also drop the container bindings made by build(), so tests and HMR
    // re-initialization start from a clean state.
    globalContainer.unregister(LOGGER_TOKEN)
    globalContainer.unregister(BaseLogger)
    loggerInitialized = false
}
