import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'crypto';
import { LogContext } from '../types/logging.types';
import { LoggerService } from './logger.service';

export interface AppContext {
  logContext: LogContext;
  logger: LoggerService;
}

export class LogContextService {
  private static readonly asyncLocalStorage = new AsyncLocalStorage<AppContext>();

  static generateRequestId(): string {
    return randomBytes(16).toString('hex');
  }

  static generateTraceId(): string {
    return randomBytes(16).toString('hex');
  }

  static generateSpanId(): string {
    return randomBytes(8).toString('hex');
  }

  static run<T>(context: AppContext, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback);
  }

  static getContext(): AppContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  static getLogContext(): LogContext | undefined {
    return this.getContext()?.logContext;
  }

  static getLogger(): LoggerService | undefined {
    return this.getContext()?.logger;
  }

  static updateContext(updates: Partial<LogContext>): void {
    const current = this.getContext();
    if (current) {
      Object.assign(current.logContext, updates);
    }
  }

  static addToAdditionalContext(key: string, value: any): void {
    const current = this.getLogContext();
    if (current) {
      if (!current.additionalContext) {
        current.additionalContext = {};
      }
      current.additionalContext[key] = value;
    }
  }
}