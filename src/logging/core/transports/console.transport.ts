/**
 * Console Transport - Default transport that writes to stdout/stderr
 */
import { ILogTransport, LogEntry, LogLevel } from '../interfaces'

export interface ConsoleTransportOptions {
    colorize?: boolean
    prettyPrint?: boolean
    timestampFormat?: 'iso' | 'unix' | 'locale'
}

const COLORS = {
    reset: '\x1b[0m',
    trace: '\x1b[90m',   // gray
    debug: '\x1b[36m',   // cyan
    info: '\x1b[32m',    // green
    warn: '\x1b[33m',    // yellow
    error: '\x1b[31m',   // red
    fatal: '\x1b[35m',   // magenta
}

const LEVEL_LABELS: Record<LogLevel, string> = {
    trace: 'TRACE',
    debug: 'DEBUG',
    info: 'INFO ',
    warn: 'WARN ',
    error: 'ERROR',
    fatal: 'FATAL',
}

export class ConsoleTransport implements ILogTransport {
    readonly name = 'console'
    private options: Required<ConsoleTransportOptions>

    constructor(options: ConsoleTransportOptions = {}) {
        this.options = {
            colorize: options.colorize ?? process.stdout.isTTY ?? false,
            prettyPrint: options.prettyPrint ?? process.env.NODE_ENV !== 'production',
            timestampFormat: options.timestampFormat ?? 'iso',
        }
    }

    write(entry: LogEntry): void {
        const output = this.options.prettyPrint
            ? this.formatPretty(entry)
            : this.formatJson(entry)

        const stream = entry.level === 'error' || entry.level === 'fatal'
            ? process.stderr
            : process.stdout

        stream.write(output + '\n')
    }

    private formatPretty(entry: LogEntry): string {
        const { colorize } = this.options
        const color = colorize ? COLORS[entry.level] : ''
        const reset = colorize ? COLORS.reset : ''

        const timestamp = this.formatTimestamp(entry.timestamp)
        const level = LEVEL_LABELS[entry.level]
        const context = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
        const error = entry.error ? `\n${entry.error.stack}` : ''

        return `${color}[${timestamp}] ${level}${reset} ${entry.message}${context}${error}`
    }

    private formatJson(entry: LogEntry): string {
        return JSON.stringify({
            timestamp: entry.timestamp.toISOString(),
            level: entry.level,
            message: entry.message,
            ...entry.context,
            ...(entry.error && { error: { message: entry.error.message, stack: entry.error.stack } }),
        })
    }

    private formatTimestamp(date: Date): string {
        switch (this.options.timestampFormat) {
            case 'unix': return String(date.getTime())
            case 'locale': return date.toLocaleString()
            default: return date.toISOString()
        }
    }
}
