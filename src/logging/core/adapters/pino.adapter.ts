/**
 * Pino Adapter - Use Pino as the logging backend
 * 
 * This adapter wraps Pino to implement the ILogger interface,
 * allowing users to leverage Pino's performance while using
 * the BootifyJS logging API.
 */
import pino from 'pino'
import { ILogger, LogContext, LogLevel } from '../interfaces'

export interface PinoAdapterOptions {
    level?: LogLevel
    serviceName?: string
    prettyPrint?: boolean
    transports?: pino.TransportTargetOptions[]
    pinoOptions?: pino.LoggerOptions
}

export class PinoAdapter implements ILogger {
    private logger: pino.Logger

    constructor(options: PinoAdapterOptions = {}) {
        const pinoOptions: pino.LoggerOptions = {
            level: options.level ?? 'info',
            messageKey: 'message',
            base: {
                service: options.serviceName ?? 'bootify-app',
                pid: process.pid,
            },
            timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
            ...options.pinoOptions,
        }

        if (options.transports && options.transports.length > 0) {
            this.logger = pino({
                ...pinoOptions,
                transport: { targets: options.transports },
            })
        } else if (options.prettyPrint) {
            this.logger = pino({
                ...pinoOptions,
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'SYS:standard',
                        ignore: 'pid,hostname',
                    },
                },
            })
        } else {
            this.logger = pino(pinoOptions)
        }
    }

    trace(message: string, context?: LogContext): void {
        this.logger.trace(context ?? {}, message)
    }

    debug(message: string, context?: LogContext): void {
        this.logger.debug(context ?? {}, message)
    }

    info(message: string, context?: LogContext): void {
        this.logger.info(context ?? {}, message)
    }

    warn(message: string, context?: LogContext): void {
        this.logger.warn(context ?? {}, message)
    }

    error(message: string, error?: Error, context?: LogContext): void {
        this.logger.error({ ...context, err: error }, message)
    }

    fatal(message: string, error?: Error, context?: LogContext): void {
        this.logger.fatal({ ...context, err: error }, message)
    }

    child(bindings: LogContext): ILogger {
        const childPino = this.logger.child(bindings)
        const adapter = new PinoAdapter()
            ; (adapter as any).logger = childPino
        return adapter
    }

    /**
     * Get the underlying Pino logger for advanced usage
     */
    getPinoInstance(): pino.Logger {
        return this.logger
    }
}
