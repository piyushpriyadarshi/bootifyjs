// import { IncomingMessage, ServerResponse } from 'http'
// import { ApplicationAdapter } from './application'
// import { container } from './container'
// import { Middleware } from './middleware'
// import { errorHandler } from './errors'
// import { parseQuery, parseBody, matchRoute } from './utils'
// import { ValidationService, ValidationMetadata } from './validation'
// import { LoggerService } from '../logging/core/logger.service'
// import { LogContextService } from '../logging/core/log-context.service'

// interface RouteDefinition {
//   method: string
//   path: string
//   handler: Function
//   controller: any
//   middlewares: Middleware[]
//   originalMethod: string
// }

// export class Router {
//   private routes: RouteDefinition[] = []
//   private logger?: LoggerService

//   constructor() {
//     try {
//       this.logger = LoggerService.getInstance()
//     } catch (error) {
//       // Logger not initialized yet
//     }
//   }

//   registerControllers(controllers: any[]): void {
//     if (this.logger) {
//       this.logger.component('Registering controllers', { count: controllers.length })
//     }

//     controllers.forEach((Controller) => {
//       this.registerController(Controller)
//     })

//     if (this.logger) {
//       this.logger.component('Controllers registered successfully', {
//         totalRoutes: this.routes.length,
//         controllers: controllers.map((c) => c.name),
//       })
//     }

//     // Log all registered routes
//     this.logRegisteredRoutes()
//   }

//   private registerController(Controller: any): void {
//     const prefix = Reflect.getMetadata('controller:prefix', Controller) || ''
//     const classMiddlewares = Reflect.getMetadata('middlewares', Controller) || []
//     const instance = container.resolve(Controller)

//     if (this.logger) {
//       this.logger.trace(`Registering controller: ${Controller.name}`, { prefix })
//     }

//     const methodNames = Object.getOwnPropertyNames(Controller.prototype)

//     methodNames.forEach((methodName) => {
//       if (methodName === 'constructor') return

//       const method = Reflect.getMetadata('route:method', Controller.prototype, methodName)
//       const path = Reflect.getMetadata('route:path', Controller.prototype, methodName)
//       const methodMiddlewares =
//         Reflect.getMetadata('middlewares', Controller.prototype, methodName) || []

//       if (method && path !== undefined) {
//         const fullPath = `${prefix}${path}`.replace(/\/+/g, '/')
//         const allMiddlewares = [...classMiddlewares, ...methodMiddlewares]

//         this.routes.push({
//           method: method.toUpperCase(),
//           path: fullPath,
//           handler: Controller.prototype[methodName],
//           controller: instance,
//           middlewares: allMiddlewares,
//           originalMethod: methodName,
//         })

//         if (this.logger) {
//           this.logger.trace(`Route registered: ${method.toUpperCase()} ${fullPath}`, {
//             controller: Controller.name,
//             method: methodName,
//             middlewares: allMiddlewares.length,
//           })
//         }
//       }
//     })
//   }

//   private logRegisteredRoutes(): void {
//     if (!this.logger) return

//     // Group routes by controller for better organization
//     const routesByController = this.routes.reduce((acc, route) => {
//       const controllerName = route.controller.constructor.name
//       if (!acc[controllerName]) {
//         acc[controllerName] = []
//       }
//       acc[controllerName].push({
//         method: route.method,
//         path: route.path,
//         handler: route.originalMethod,
//         middlewares: route.middlewares.length,
//       })
//       return acc
//     }, {} as Record<string, any[]>)

//     // Log summary
//     this.logger.info('📋 Registered Routes Summary', {
//       totalRoutes: this.routes.length,
//       controllers: Object.keys(routesByController).length,
//     })

//     // Log routes by controller
//     Object.entries(routesByController).forEach(([controllerName, routes]) => {
//       this.logger!.info(`🎯 ${controllerName} Routes:`, {
//         controller: controllerName,
//         routes: routes.map((r) => `${r.method} ${r.path} -> ${r.handler}()`),
//         count: routes.length,
//       })
//     })

//     // Create a formatted table for console output
//     this.logRoutesTable()
//   }

//   private logRoutesTable(): void {
//     console.log('\n📋 Available Routes:')
//     console.log('─'.repeat(80))
//     console.log(
//       'Method'.padEnd(8) +
//         'Path'.padEnd(30) +
//         'Controller'.padEnd(20) +
//         'Handler'.padEnd(15) +
//         'Middlewares'
//     )
//     console.log('─'.repeat(80))

//     // Sort routes by path for better readability
//     const sortedRoutes = [...this.routes].sort((a, b) => a.path.localeCompare(b.path))

//     sortedRoutes.forEach((route) => {
//       const method = route.method.padEnd(8)
//       const path = route.path.padEnd(30)
//       const controller = route.controller.constructor.name.padEnd(20)
//       const handler = route.originalMethod.padEnd(15)
//       const middlewares = route.middlewares.length.toString()

//       console.log(`${method}${path}${controller}${handler}${middlewares}`)
//     })

//     console.log('─'.repeat(80))
//     console.log(`Total: ${this.routes.length} routes registered\n`)
//   }

//   getRoutes(): RouteDefinition[] {
//     return [...this.routes]
//   }

//   getRoutesSummary(): {
//     totalRoutes: number
//     routesByMethod: Record<string, number>
//     routesByController: Record<string, number>
//   } {
//     const routesByMethod = this.routes.reduce((acc, route) => {
//       acc[route.method] = (acc[route.method] || 0) + 1
//       return acc
//     }, {} as Record<string, number>)

//     const routesByController = this.routes.reduce((acc, route) => {
//       const controllerName = route.controller.constructor.name
//       acc[controllerName] = (acc[controllerName] || 0) + 1
//       return acc
//     }, {} as Record<string, number>)

//     return {
//       totalRoutes: this.routes.length,
//       routesByMethod,
//       routesByController,
//     }
//   }
//   getRouteCount(): number {
//     return this.routes.length
//   }

//   registerWithAdapter(adapter: ApplicationAdapter): void {
//     this.routes.forEach((route) => {
//       adapter.registerRoute(route.method, route.path, async (req: any, res: any) => {
//         const context = LogContextService.getContext()
//         if (context) {
//           return LogContextService.run(context, async () => {
//             try {
//               const params = this.extractParamsFromRequest(req, route.path)
//               ;(req as any).params = params
//               const routeWithParams = { ...route, params }
//               await this.executeRoute(routeWithParams, req, res)
//             } catch (error) {
//               errorHandler(error, res)
//             }
//           })
//         }

//         // Fallback for cases where context is not set (e.g., tests)
//         try {
//           const params = this.extractParamsFromRequest(req, route.path)
//           ;(req as any).params = params
//           const routeWithParams = { ...route, params }
//           await this.executeRoute(routeWithParams, req, res)
//         } catch (error) {
//           errorHandler(error, res)
//         }
//       })
//     })
//   }

//   private extractParamsFromRequest(req: any, routePath: string): Record<string, string> {
//     if (req.params) {
//       return req.params
//     }
//     // Fallback for Node.js HTTP server
//     const match = matchRoute(routePath, req.url.split('?')[0])
//     return match ? match.params : {}
//   }

//   async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
//     const method = req.method?.toUpperCase() || 'GET'
//     const url = req.url || '/'
//     const pathname = url.split('?')[0]

//     const route = this.findRoute(method, pathname)

//     if (!route) {
//       if (res.headersSent) {
//         return
//       }
//       res.writeHead(404, { 'Content-Type': 'application/json' })
//       res.end(JSON.stringify({ error: 'Not Found', status: 404 }))
//       return
//     }
//     // requestContext

//     // const context = requestContext.getContext()/

//     const context = LogContextService.getContext()
//     console.log('context in router ', context)

//     if (context) {
//       LogContextService.run(context, async () => {
//         try {
//           await this.executeRoute(route, req, res)
//         } catch (error) {
//           errorHandler(error, res)
//         }
//       })
//     } else {
//       try {
//         await this.executeRoute(route, req, res)
//       } catch (error) {
//         errorHandler(error, res)
//       }
//     }
//   }

//   private findRoute(
//     method: string,
//     pathname: string
//   ): (RouteDefinition & { params: Record<string, string> }) | null {
//     // First try exact match for better performance
//     const exactMatches = this.routes.filter(
//       (route) => route.method === method && route.path === pathname
//     )
//     if (exactMatches.length > 0) {
//       return { ...exactMatches[0], params: {} }
//     }

//     // Then try pattern matching
//     for (const route of this.routes) {
//       if (route.method === method) {
//         const { isMatch, params } = matchRoute(route.path, pathname)
//         if (isMatch) {
//           return { ...route, params }
//         }
//       }
//     }
//     return null
//   }

//   private async executeRoute(
//     route: RouteDefinition & { params: Record<string, string> },
//     req: IncomingMessage,
//     res: ServerResponse
//   ): Promise<void> {
//     // Execute middlewares
//     await this.executeMiddlewares(route.middlewares, req, res)

//     // Prepare handler arguments
//     const args = await this.prepareHandlerArgs(route, req, res)

//     // Execute handler
//     const result = await route.handler.call(route.controller, ...args)

//     // Validate response if schema exists
//     const validationMeta: ValidationMetadata =
//       Reflect.getMetadata('validation', route.controller, route.originalMethod) || {}
//     let finalResult = result

//     if (validationMeta.response && result !== undefined) {
//       finalResult = ValidationService.validateResponse(result, validationMeta.response)
//     }

//     // Send response if not already sent
//     if (!res.headersSent) {
//       res.writeHead(200, { 'Content-Type': 'application/json' })
//       res.end(JSON.stringify(finalResult))
//     }
//   }

//   private async executeMiddlewares(
//     middlewares: Middleware[],
//     req: IncomingMessage,
//     res: ServerResponse
//   ): Promise<void> {
//     let index = 0

//     const next = async (): Promise<void> => {
//       if (index < middlewares.length) {
//         const middleware = middlewares[index++]
//         await middleware(req, res, next)
//       }
//     }

//     await next()
//   }

//   private async prepareHandlerArgs(
//     route: RouteDefinition & { params: Record<string, string> },
//     req: IncomingMessage,
//     res: ServerResponse
//   ): Promise<any[]> {
//     const paramTypes =
//       Reflect.getMetadata('design:paramtypes', route.controller, route.originalMethod) || []
//     const validationMeta: ValidationMetadata =
//       Reflect.getMetadata('validation', route.controller, route.originalMethod) || {}
//     const args: any[] = []

//     // Parse and validate request data
//     let body: any = null
//     let query: any = null
//     let params: any = route.params

//     // Validate params if schema exists
//     if (validationMeta.params) {
//       params = ValidationService.validateParams(route.params, validationMeta.params)
//     }

//     // Parse and validate query if needed
//     if (validationMeta.query) {
//       const rawQuery = parseQuery(req)
//       query = ValidationService.validateQuery(rawQuery, validationMeta.query)
//     } else {
//       query = parseQuery(req)
//     }

//     // Parse and validate body if needed
//     if (validationMeta.body) {
//       const rawBody = await parseBody(req)
//       body = ValidationService.validateBody(rawBody, validationMeta.body)
//     }

//     for (let i = 0; i < paramTypes.length; i++) {
//       const paramMeta = Reflect.getMetadata(
//         `param:${i}`,
//         route.controller.constructor.prototype,
//         route.originalMethod
//       )

//       if (paramMeta) {
//         switch (paramMeta.type) {
//           case 'request':
//             args[i] = req
//             break
//           case 'response':
//             args[i] = res
//             break
//           case 'body':
//             args[i] = body || (await parseBody(req))
//             break
//           case 'param':
//             // Ensure param values are preserved in the response
//             if (paramMeta.name) {
//               // For backward compatibility, ensure the param is included in the result
//               if (body && typeof body === 'object') {
//                 body[paramMeta.name] = params[paramMeta.name]
//               }
//               args[i] = params[paramMeta.name]
//             }
//             break
//           case 'query':
//             // Ensure query values are preserved in the response
//             if (paramMeta.name) {
//               const queryValue = query[paramMeta.name]
//               // For backward compatibility, ensure the query param is included in the result
//               if (body && typeof body === 'object') {
//                 body[paramMeta.name] = queryValue
//               }
//               args[i] = queryValue
//             } else {
//               args[i] = query
//             }
//             break
//           default:
//             args[i] = undefined
//         }
//       } else {
//         args[i] = undefined
//       }
//     }

//     return args
//   }
// }
import { IncomingMessage, ServerResponse } from 'http'
import { ApplicationAdapter } from './application'
import { container } from './container'
import { Middleware } from './middleware'
import { errorHandler } from './errors'
import { parseQuery, parseBody, matchRoute } from './utils'
import { ValidationService, ValidationMetadata } from './validation'
import { LoggerService } from '../logging/core/logger.service'
import { LogContextService } from '../logging/core/log-context.service'
import { sendResponse } from './response.handler'
interface RouteDefinition {
  method: string
  path: string
  handler: Function
  controller: any
  middlewares: Middleware[]
  originalMethod: string
}

export class Router {
  private routes: RouteDefinition[] = []
  private logger?: LoggerService

  constructor() {
    try {
      this.logger = LoggerService.getInstance()
    } catch (error) {
      // Logger not initialized yet
    }
  }

  registerControllers(controllers: any[]): void {
    if (this.logger) {
      this.logger.component('Registering controllers', { count: controllers.length })
    }

    controllers.forEach((Controller) => {
      this.registerController(Controller)
    })

    if (this.logger) {
      this.logger.component('Controllers registered successfully', {
        totalRoutes: this.routes.length,
        controllers: controllers.map((c) => c.name),
      })
    }

    this.logRegisteredRoutes()
  }

  private registerController(Controller: any): void {
    const prefix = Reflect.getMetadata('controller:prefix', Controller) || ''
    const classMiddlewares = Reflect.getMetadata('middlewares', Controller) || []
    const instance = container.resolve(Controller)

    if (this.logger) {
      this.logger.trace(`Registering controller: ${Controller.name}`, { prefix })
    }

    const methodNames = Object.getOwnPropertyNames(Controller.prototype)

    methodNames.forEach((methodName) => {
      if (methodName === 'constructor') return

      const method = Reflect.getMetadata('route:method', Controller.prototype, methodName)
      const path = Reflect.getMetadata('route:path', Controller.prototype, methodName)
      const methodMiddlewares =
        Reflect.getMetadata('middlewares', Controller.prototype, methodName) || []

      if (method && path !== undefined) {
        const fullPath = `${prefix}${path}`.replace(/\/+/g, '/')
        const allMiddlewares = [...classMiddlewares, ...methodMiddlewares]

        this.routes.push({
          method: method.toUpperCase(),
          path: fullPath,
          handler: Controller.prototype[methodName],
          controller: instance,
          middlewares: allMiddlewares,
          originalMethod: methodName,
        })

        if (this.logger) {
          this.logger.trace(`Route registered: ${method.toUpperCase()} ${fullPath}`, {
            controller: Controller.name,
            method: methodName,
            middlewares: allMiddlewares.length,
          })
        }
      }
    })
  }

  private logRegisteredRoutes(): void {
    if (!this.logger) return
    const routesByController = this.routes.reduce((acc, route) => {
      const controllerName = route.controller.constructor.name
      if (!acc[controllerName]) {
        acc[controllerName] = []
      }
      acc[controllerName].push({
        method: route.method,
        path: route.path,
        handler: route.originalMethod,
        middlewares: route.middlewares.length,
      })
      return acc
    }, {} as Record<string, any[]>)

    this.logger.info('📋 Registered Routes Summary', {
      totalRoutes: this.routes.length,
      controllers: Object.keys(routesByController).length,
    })

    Object.entries(routesByController).forEach(([controllerName, routes]) => {
      this.logger!.info(`🎯 ${controllerName} Routes:`, {
        controller: controllerName,
        routes: routes.map((r) => `${r.method} ${r.path} -> ${r.handler}()`),
        count: routes.length,
      })
    })
    this.logRoutesTable()
  }

  private logRoutesTable(): void {
    console.log('\n📋 Available Routes:')
    console.log('─'.repeat(80))
    console.log(
      'Method'.padEnd(8) +
        'Path'.padEnd(30) +
        'Controller'.padEnd(20) +
        'Handler'.padEnd(15) +
        'Middlewares'
    )
    console.log('─'.repeat(80))
    const sortedRoutes = [...this.routes].sort((a, b) => a.path.localeCompare(b.path))
    sortedRoutes.forEach((route) => {
      const method = route.method.padEnd(8)
      const path = route.path.padEnd(30)
      const controller = route.controller.constructor.name.padEnd(20)
      const handler = route.originalMethod.padEnd(15)
      const middlewares = route.middlewares.length.toString()
      console.log(`${method}${path}${controller}${handler}${middlewares}`)
    })
    console.log('─'.repeat(80))
    console.log(`Total: ${this.routes.length} routes registered\n`)
  }

  getRoutes(): RouteDefinition[] {
    return [...this.routes]
  }

  getRouteCount(): number {
    return this.routes.length
  }

  registerWithAdapter(adapter: ApplicationAdapter): void {
    this.routes.forEach((route) => {
      adapter.registerRoute(route.method, route.path, async (req: any, res: any) => {
        const context = LogContextService.getContext()
        const handler = async () => {
          try {
            // Frameworks like Express/Fastify parse params automatically.
            let params = req.params || {}

            // Fallback for native Node adapter where we need to parse params manually.
            if (Object.keys(params).length === 0) {
              const match = matchRoute(route.path, (req.url || '').split('?')[0])
              if (match) {
                params = match.params
              }
            }
            // Attach params to the request for consistent access in handlers.
            req.params = params

            const routeWithParams = { ...route, params }
            await this.executeRoute(routeWithParams, req, res)
          } catch (error) {
            errorHandler(error, res)
          }
        }

        if (context) {
          LogContextService.run(context, handler)
        } else {
          handler()
        }
      })
    })
  }

  /**
   * This method is now only called directly by the NodeHttpAdapter.
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method?.toUpperCase() || 'GET'
    const url = req.url || '/'
    const pathname = url.split('?')[0]

    const route = this.findRoute(method, pathname)

    if (!route) {
      // Use the abstracted response handler for 404 errors.
      sendResponse(res, 404, { error: 'Not Found', status: 404 })
      return
    }

    try {
      await this.executeRoute(route, req, res)
    } catch (error) {
      errorHandler(error, res)
    }
  }

  private findRoute(
    method: string,
    pathname: string
  ): (RouteDefinition & { params: Record<string, string> }) | null {
    for (const route of this.routes) {
      if (route.method === method) {
        const { isMatch, params } = matchRoute(route.path, pathname)
        if (isMatch) {
          return { ...route, params }
        }
      }
    }
    return null
  }

  private async executeRoute(
    route: RouteDefinition & { params: Record<string, string> },
    req: any, // Use `any` to be compatible with Node, Express, and Fastify
    res: any // Use `any` to be compatible with Node, Express, and Fastify
  ): Promise<void> {
    await this.executeMiddlewares(route.middlewares, req, res)

    // Stop if a middleware has already sent the response.
    if (res.headersSent || (res.raw && res.raw.headersSent) || res.sent) {
      return
    }

    const args = await this.prepareHandlerArgs(route, req, res)
    const result = await route.handler.call(route.controller, ...args)

    const validationMeta: ValidationMetadata =
      Reflect.getMetadata('validation', route.controller, route.originalMethod) || {}
    let finalResult = result

    if (validationMeta.response && result !== undefined) {
      finalResult = ValidationService.validateResponse(result, validationMeta.response)
    }

    // Use the abstracted response handler to send the successful response.
    sendResponse(res, 200, finalResult)
  }

  private async executeMiddlewares(middlewares: Middleware[], req: any, res: any): Promise<void> {
    let index = 0
    const next = async (): Promise<void> => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++]
        await middleware(req, res, next)
      }
    }
    await next()
  }

  private async prepareHandlerArgs(
    route: RouteDefinition & { params: Record<string, string> },
    req: any,
    res: any
  ): Promise<any[]> {
    const paramTypes =
      Reflect.getMetadata('design:paramtypes', route.controller, route.originalMethod) || []
    const validationMeta: ValidationMetadata =
      Reflect.getMetadata('validation', route.controller, route.originalMethod) || {}
    const args: any[] = []

    let body: any = null
    let query: any = null
    let params: any = req.params // Use the params attached to the request object

    if (validationMeta.params) {
      params = ValidationService.validateParams(params, validationMeta.params)
    }

    const rawQuery = parseQuery(req)
    if (validationMeta.query) {
      query = ValidationService.validateQuery(rawQuery, validationMeta.query)
    } else {
      query = rawQuery
    }

    if (validationMeta.body) {
      const rawBody = await parseBody(req)
      body = ValidationService.validateBody(rawBody, validationMeta.body)
    }

    for (let i = 0; i < paramTypes.length; i++) {
      const paramMeta = Reflect.getMetadata(
        `param:${i}`,
        route.controller.constructor.prototype,
        route.originalMethod
      )

      if (paramMeta) {
        switch (paramMeta.type) {
          case 'request':
            args[i] = req
            break
          case 'response':
            args[i] = res
            break
          case 'body':
            // Lazily parse body only if needed and not already parsed.
            args[i] = body !== null ? body : await parseBody(req)
            break
          case 'param':
            args[i] = params[paramMeta.name]
            break
          case 'query':
            args[i] = paramMeta.name ? query[paramMeta.name] : query
            break
          default:
            args[i] = undefined
            break
        }
      } else {
        args[i] = undefined
      }
    }

    return args
  }
}
