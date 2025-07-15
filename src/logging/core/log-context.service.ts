import { AsyncLocalStorage } from 'async_hooks';
import { randomBytes } from 'crypto';
import { LogContext } from '../types/logging.types';

export class LogContextService {
  private static readonly asyncLocalStorage = new AsyncLocalStorage<LogContext>();

  static generateRequestId(): string {
    return randomBytes(16).toString('hex');
  }

  static generateTraceId(): string {
    return randomBytes(16).toString('hex');
  }

  static generateSpanId(): string {
    return randomBytes(8).toString('hex');
  }

  static run<T>(context: LogContext, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback);
  }

  static getContext(): LogContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  static updateContext(updates: Partial<LogContext>): void {
    const current = this.getContext();
    if (current) {
      Object.assign(current, updates);
    }
  }

  static addToAdditionalContext(key: string, value: any): void {
    const current = this.getContext();
    if (current) {
      if (!current.additionalContext) {
        current.additionalContext = {};
      }
      current.additionalContext[key] = value;
    }
  }
}