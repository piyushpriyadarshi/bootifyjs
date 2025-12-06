/**
 * BaseLogger - Default implementation using Strategy pattern
 * 
 * This logger dispatches log entries to configured transports.
 * Users can extend this or implement ILogger for custom behavior.
 */
import { Service } from '../../core/decorators'
import {
    IContextProvider,
    ILogger,
    ILogTransport,
    LogContext,
    LogEntry,
    LoggerConfig,
    LogLevel,
} from './interfaces'
import { ConsoleTransport } from './transports/console.transport'

const LOG_LEVELS: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
}

@Service()
export class BaseLogger implements ILogger {
    private transports: ILogTransport[]
    private contextProviders: IContextProvider[]
    private level: LogLevel
    private levelValue: number
    private baseContext: LogContext
    private childBindings: LogContext = {}

    constructor(config?: Partial<LoggerConfig>) {
        this.level = config?.level ?? 'info'
        this.levelValue = LOG_LEVELS[this.level]
        this.baseContext = config?.baseContext ?? {}
        this.transports = config?.transports ?? [new ConsoleTransport()]
        this.contextProviders = config?.contextProviders ?? []
    }

    trace(message: string, context?: LogContext): void {
        this.log('trace', message, context)
    }

    debug(message: string, context?: LogContext): void {
        this.log('debug', message, context)
    }

    info(message: string, context?: LogContext): void {
        this.log('info', message, context)
    }

    warn(message: string, context?: LogContext): void {
        this.log('warn', message, context)
    }

    error(message: string, error?: Error, context?: LogContext): void {
        this.log('error', message, context, error)
    }

    fatal(message: string, error?: Error, context?: LogContext): void {
        this.log('fatal', message, context, error)
    }

    child(bindings: LogContext): ILogger {
        const childLogger = new BaseLogger({
            level: this.level,
            baseContext: this.baseContext,
            transports: this.transports,
            contextProviders: this.contextProviders,
        })
        childLogger.childBindings = { ...this.childBindings, ...bindings }
        return childLogger
    }

    /**
     * Add a transport at runtime
     */
    addTransport(transport: ILogTransport): this {
        this.transports.push(transport)
        return this
    }

    /**
     * Remove a transport by name
     */
    removeTransport(name: string): this {
        this.transports = this.transports.filter(t => t.name !== name)
        return this
    }

    /**
     * Add a context provider
     */
    addContextProvider(provider: IContextProvider): this {
        this.contextProviders.push(provider)
        return this
    }

    /**
     * Set log level
     */
    setLevel(level: LogLevel): this {
        this.level = level
        this.levelValue = LOG_LEVELS[level]
        return this
    }

    private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
        if (LOG_LEVELS[level] < this.levelValue) return

        const entry: LogEntry = {
            level,
            message,
            timestamp: new Date(),
            context: this.buildContext(context),
            error,
        }

        for (const transport of this.transports) {
            try {
                transport.write(entry)
            } catch (err) {
                console.error(`[Logger] Transport '${transport.name}' failed:`, err)
            }
        }
    }

    private buildContext(context?: LogContext): LogContext {
        // Merge: base -> child bindings -> providers -> call-site context
        const dynamicContext = this.contextProviders.reduce(
            (acc, provider) => ({ ...acc, ...provider.getContext() }),
            {}
        )

        return {
            ...this.baseContext,
            ...this.childBindings,
            ...dynamicContext,
            ...context,
        }
    }

    /**
     * Flush all transports (for graceful shutdown)
     */
    async flush(): Promise<void> {
        await Promise.all(
            this.transports
                .filter(t => t.flush)
                .map(t => t.flush!())
        )
    }

    /**
     * Close all transports
     */
    async close(): Promise<void> {
        await Promise.all(
            this.transports
                .filter(t => t.close)
                .map(t => t.close!())
        )
    }
}
