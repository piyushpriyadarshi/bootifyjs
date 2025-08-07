import { container, requestContextStore } from '../../core'
import { Logger } from './logger'

// // --- @Log Decorator ---

// export interface LogOptions {
//   level?: 'debug' | 'info' | 'warn' | 'error'
//   logArgs?: boolean
//   logResult?: boolean
//   logDuration?: boolean
//   message?: string
// }

// /**
//  * A method decorator that provides detailed logging for a method's execution,
//  * including start, completion, duration, and errors.
//  */
// export function Log(options: LogOptions = {}): MethodDecorator {
//   return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
//     const originalMethod = descriptor.value
//     const className = target.constructor.name
//     const methodName = String(propertyKey)

//     descriptor.value = async function (...args: any[]) {
//       // Resolve services from the DI container at runtime
//       const logger = container.resolve(LoggerService)
//       const startTime = Date.now()

//       const logContext = { component: className, method: methodName }
//       const message = options.message || `Executing ${methodName}`

//       try {
//         if (options.logArgs) {
//           logger.debug(`${message} - started`, { ...logContext, args })
//         } else {
//           logger.debug(`${message} - started`, logContext)
//         }

//         const result = await originalMethod.apply(this, args)
//         const duration = Date.now() - startTime

//         const successContext = { ...logContext, durationMs: duration }
//         if (options.logResult) {
//           ;(successContext as any).result = result
//         }

//         logger.debug(`${message} - completed`, successContext)

//         return result
//       } catch (error) {
//         const duration = Date.now() - startTime
//         logger.error(`${message} - failed`, error as Error, { ...logContext, durationMs: duration })
//         throw error
//       }
//     }
//   }
// }

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

      // Resolve services from the DI container
      const logger = container.resolve<Logger>(Logger)
      //   const contextService = container.resolve(RequestContextService)
      //   const requestContext = contextService.getStoreObject() // Get context as a plain object
      const store = requestContextStore.getStore() || new Map()

      const resourceId = options.resourceIdPath
        ? extractValueFromPath(options.resourceIdPath, { args, result })
        : undefined

      const auditPayload = {
        action: options.action,
        resource: options.resource,
        resourceId,
        actor: {
          ...Object.fromEntries(store.entries()),
        },
      }
      logger.audit(auditPayload)

      return result
    }
  }
}

// --- @Logger Class Decorator ---

/**
 * A class decorator that injects a child 'logger' instance into the class prototype,
 * automatically namespaced with the class name.
 */
export function Loggable(): ClassDecorator {
  return function (target: any) {
    Object.defineProperty(target.prototype, 'logger', {
      get: function () {
        if (!this._logger) {
          const loggerService = container.resolve<Logger>(Logger)
          this._logger = loggerService.child({ component: target.name })
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
    // Special handling for array indices like 'args.0'
    if (Array.isArray(current) && !isNaN(parseInt(part, 10))) {
      current = current[parseInt(part, 10)]
    } else {
      current = current[part]
    }
  }
  return current
}
