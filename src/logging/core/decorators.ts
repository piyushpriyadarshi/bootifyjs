/**
 * Logging Decorators
 * 
 * These decorators use the ILogger interface, so they work with
 * any logger implementation the user provides.
 */
import { requestContextStore } from '../../core'
import { ILogger } from './interfaces'
import { getLogger, isLoggerInitialized } from './logger-builder'

// --- @Audit Decorator ---

export interface AuditOptions {
  action: string
  resource: string
  resourceIdPath?: string // e.g., 'args.0.id' or 'result.id'
}

/**
 * A method decorator that creates a structured audit log after a method
 * successfully executes.
 */
export function Audit(options: AuditOptions): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args)

      // Get logger if initialized
      if (!isLoggerInitialized()) {
        console.warn('[Audit] Logger not initialized, skipping audit log')
        return result
      }

      const logger = getLogger()
      const store = requestContextStore.getStore() || new Map()

      const resourceId = options.resourceIdPath
        ? extractValueFromPath(options.resourceIdPath, { args, result })
        : undefined

      const auditPayload = {
        logType: 'audit',
        action: options.action,
        resource: options.resource,
        resourceId,
        actor: Object.fromEntries(store.entries()),
      }

      logger.info('Audit Log', auditPayload)

      return result
    }
  }
}

// --- @Loggable Class Decorator ---

/**
 * A class decorator that injects a 'logger' property into the class prototype.
 * The logger is automatically namespaced with the class name.
 * 
 * @example
 * @Loggable()
 * class MyService {
 *   private logger!: ILogger
 *   
 *   doSomething() {
 *     this.logger.info('Doing something')
 *   }
 * }
 */
export function Loggable(): ClassDecorator {
  return function (target: any) {
    Object.defineProperty(target.prototype, 'logger', {
      get: function () {
        if (!this._logger) {
          if (!isLoggerInitialized()) {
            // Return a no-op logger if not initialized
            this._logger = createNoOpLogger()
          } else {
            const logger = getLogger()
            // Create a child logger with component name if supported
            this._logger = logger.child({ component: target.name })
          }
        }
        return this._logger
      },
      enumerable: false,
      configurable: true,
    })
  }
}

// --- Helper Functions ---

function extractValueFromPath(path: string, context: { args: any[]; result: any }): any {
  const parts = path.split('.')
  let current: any = context

  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current) && !isNaN(parseInt(part, 10))) {
      current = current[parseInt(part, 10)]
    } else {
      current = current[part]
    }
  }
  return current
}

function createNoOpLogger(): ILogger {
  const noop = () => { }
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => createNoOpLogger(),
  }
}
