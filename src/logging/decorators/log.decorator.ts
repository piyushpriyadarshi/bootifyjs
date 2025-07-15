import { LoggerService } from '../core/logger.service';

export interface LogOptions {
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  logArgs?: boolean;
  logResult?: boolean;
  logDuration?: boolean;
  message?: string;
  skipIf?: (args: any[]) => boolean;
  component?: string;
}

export function Log(options: LogOptions = {}): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;
    const methodName = String(propertyKey);

    descriptor.value = async function (...args: any[]) {
      const logger = LoggerService.getInstance();
      const startTime = Date.now();

      // Skip logging if condition is met
      if (options.skipIf && options.skipIf(args)) {
        return originalMethod.apply(this, args);
      }

      const logData: any = {
        component: options.component || className,
        class: className,
        method: methodName
      };

      if (options.logArgs && logger.getConfig().enableComponentLogs) {
        logData.arguments = args;
      }

      const message = options.message || `${className}.${methodName} called`;

      try {
        logger[options.level || 'debug'](`${message} - started`, logData);

        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;

        const successData = { ...logData };
        if (options.logResult && logger.getConfig().enableComponentLogs) {
          successData.result = result;
        }
        if (options.logDuration) {
          successData.duration = duration;
        }

        logger[options.level || 'debug'](`${message} - completed`, successData);

        // Log performance if enabled and method is slow
        if (logger.getConfig().enablePerformanceLogs && duration > (logger.getConfig().performance?.slowThreshold || 1000)) {
          logger.performance({
            operation: `${className}.${methodName}`,
            duration,
            metadata: { slow: true }
          });
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`${message} - failed`, error as Error, {
          ...logData,
          duration,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    };

    return descriptor;
  };
}

// Class-level logger injection
export function Logger(name?: string): ClassDecorator {
  return function (target: any) {
    const loggerName = name || target.name;
    
    // Add lazy logger property to the class
    Object.defineProperty(target.prototype, 'logger', {
      get: function() {
        // Lazy initialization - only create logger when first accessed
        if (!this._logger) {
          this._logger = LoggerService.getInstance().child({ component: loggerName });
        }
        return this._logger;
      },
      enumerable: false,
      configurable: false
    });
  };
}