/**
 * Example: Pino Logger Adapter with Request Context
 * 
 * This shows how users can create their own logger adapter
 * that implements the ILogger interface from BootifyJS.
 * 
 * This adapter automatically includes request context (requestId, userId, etc.)
 * in all log entries using Pino's mixin feature.
 * 
 * Users must install pino themselves: npm install pino pino-pretty
 */
import pino from 'pino'
import { requestContextStore } from '../../core/request-context.service'
import { ILogger, LogContext } from '../../logging'

export interface PinoLoggerOptions {
    level?: string
    serviceName?: string
    prettyPrint?: boolean
}

export class PinoLoggerAdapter implements ILogger {
    private logger: pino.Logger

    constructor(options: PinoLoggerOptions = {}) {
        const pinoOptions: pino.LoggerOptions = {
            level: options.level ?? 'info',
            messageKey: 'message',
            base: {
                service: options.serviceName ?? 'app',
                pid: process.pid,
            },
            timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
            // Mixin automatically adds request context to every log entry
            mixin() {
                const store = requestContextStore.getStore()
                if (!store) {
                    return {}
                }
                return Object.fromEntries(store.entries())
            },
        }

        if (options.prettyPrint) {
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
        const childLogger = new PinoLoggerAdapter()
            ; (childLogger as any).logger = this.logger.child(bindings)
        return childLogger
    }
}
