/**
 * LoggerBuilder - Builder pattern for configuring loggers
 * 
 * Provides a fluent API for constructing loggers with custom configuration.
 */
import { container } from '../../core/di-container'
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
     * Add a custom transport
     */
    addTransport(transport: ILogTransport): this {
        this.transports.push(transport)
        return this
    }

    /**
     * Add a context provider for dynamic context
     */
    addContextProvider(provider: IContextProvider): this {
        this.contextProviders.push(provider)
        return this
    }

    /**
     * Configure the default console transport
     */
    configureConsole(options: ConsoleTransportOptions): this {
        this.consoleOptions = options
        return this
    }

    /**
     * Disable the default console transport
     */
    disableConsole(): this {
        this.useDefaultConsole = false
        return this
    }

    /**
     * Use a completely custom logger implementation
     */
    useCustomLogger<T extends ILogger>(loggerClass: new (...args: any[]) => T): T {
        const logger = new loggerClass()
        this.registerLogger(logger)
        return logger
    }

    /**
     * Build and register the logger with DI container
     */
    build(): ILogger {
        const allTransports = [...this.transports]

        if (this.useDefaultConsole) {
            allTransports.unshift(new ConsoleTransport(this.consoleOptions))
        }

        const logger = new BaseLogger({
            level: this.level,
            serviceName: this.serviceName,
            transports: allTransports,
            contextProviders: this.contextProviders,
            baseContext: {
                service: this.serviceName,
                ...this.baseContext,
            },
        })

        this.registerLogger(logger)
        return logger
    }

    private registerLogger(logger: ILogger): void {
        container.register(LOGGER_TOKEN, { useFactory: () => logger })
        container.register(BaseLogger, { useFactory: () => logger })
    }
}

/**
 * Create a new logger builder
 */
export function createLogger(): LoggerBuilder {
    return new LoggerBuilder()
}

/**
 * Get the registered logger from DI container
 */
export function getLogger(): ILogger {
    return container.resolve<ILogger>(LOGGER_TOKEN)
}
