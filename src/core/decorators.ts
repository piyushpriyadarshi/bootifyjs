import { FastifyReply, FastifyRequest } from 'fastify'
import 'reflect-metadata'
import { ZodSchema } from 'zod'
import { container, Scope, METADATA_KEYS } from './di-container'
import type { ComponentOptions } from './di-container'

// Re-exported for backward compatibility — the canonical definition lives in
// di-container.ts to keep the di-container ↔ decorators import graph acyclic.
export { METADATA_KEYS }

export type FastifyMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void> | void

export const Component = (options: ComponentOptions = {}): ClassDecorator => {
  return (target: any) => {
    const scope = options.scope || Scope.SINGLETON

    // 1. Register the class by its own type. override:true keeps decoration
    //    idempotent across module re-evaluation (tests/HMR).
    container.register(target, {
      useClass: target,
      scope: scope as any,
      eager: options.eager,
      override: true,
    })

    // 3. Automatically handle the interface/token bindings
    if (options.bindTo && Array.isArray(options.bindTo)) {
      for (const token of options.bindTo) {
        // Map the abstract token to this concrete class
        container.register(token, {
          useClass: target,
          scope: scope as any,
          eager: options.eager,
          override: true,
        })
      }
    }
  }
}
export const Service = (options: ComponentOptions = {}): ClassDecorator => Component(options)

// Repository can also be updated
export const Repository = (options: ComponentOptions = {}): ClassDecorator => Component(options)

export const Controller =
  (prefix: string = '', options: ComponentOptions = {}): ClassDecorator =>
    (target: any) => {
      Reflect.defineMetadata(METADATA_KEYS.controllerPrefix, prefix, target)
      container.register(target, {
        useClass: target,
        scope: options.scope || Scope.SINGLETON,
        eager: options.eager,
        override: true,
      })
      if (options.bindTo && Array.isArray(options.bindTo)) {
        for (const token of options.bindTo) {
          container.register(token, {
            useClass: target,
            scope: options.scope || Scope.SINGLETON,
            override: true,
          })
        }
      }
    }

// --- Method Decorators ---
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'HEAD' | 'OPTIONS'

const createRouteDecorator =
  (method: HttpMethod) =>
    (path: string = '/'): MethodDecorator => {
      return (target: any, propertyKey: string | symbol) => {
        const routes = Reflect.getMetadata(METADATA_KEYS.routes, target.constructor) || []
        routes.push({
          method,
          path,
          handlerName: propertyKey,
        })
        Reflect.defineMetadata(METADATA_KEYS.routes, routes, target.constructor)
      }
    }

export const Get = createRouteDecorator('GET')
export const Post = createRouteDecorator('POST')
export const Put = createRouteDecorator('PUT')
export const Delete = createRouteDecorator('DELETE')
export const Patch = createRouteDecorator('PATCH')
export const Head = createRouteDecorator('HEAD')
export const Options = createRouteDecorator('OPTIONS')

// --- Parameter Decorators ---
const createParamDecorator =
  (type: string, name?: string) =>
    (target: any, propertyKey: string | symbol, parameterIndex: number) => {
      // Metadata lives on target.constructor (the class) — same owner as route
      // metadata — and always records its index so sparse layouts resolve.
      const owner = target.constructor
      const params =
        Reflect.getMetadata(METADATA_KEYS.paramTypes, owner, propertyKey) || []
      params[parameterIndex] = { type, name, index: parameterIndex }
      Reflect.defineMetadata(METADATA_KEYS.paramTypes, params, owner, propertyKey)
    }

export const Body = () => createParamDecorator('body')
export const Query = (name?: string) => createParamDecorator('query', name)
export const Param = (name: string) => createParamDecorator('param', name)
export const Req = () => createParamDecorator('request')
export const Res = () => createParamDecorator('reply')
export const Reply = Res

/**
 * Requires a verified token for the decorated route(s).
 * Works on a method (single route) or a class (all routes).
 * Framework wiring: `createBootifyApp().enableAuth()` registers the middleware
 * this decorator consumes — without it, build() fails fast.
 */
export const UseAuth = (): MethodDecorator & ClassDecorator => {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      // method-level metadata lives on the class — same owner as routes
      Reflect.defineMetadata(METADATA_KEYS.authRequired, true, target.constructor, propertyKey)
    } else {
      Reflect.defineMetadata(METADATA_KEYS.authRequired, true, target)
    }
  }
}

/**
 * Opts a single route out of a class-level @UseAuth(). Stores an explicit
 * `false` — the router treats it as an override of the class-level metadata.
 */
export const Public = (): MethodDecorator & ClassDecorator => {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      // method-level: explicit `false` overrides a class-level @UseAuth
      Reflect.defineMetadata(METADATA_KEYS.authRequired, false, target.constructor, propertyKey)
    } else {
      // class-level: every route in the controller is public
      Reflect.defineMetadata(METADATA_KEYS.authRequired, false, target)
    }
  }
}

/**
 * Restricts the decorated route(s) to the given roles.
 * Implies @UseAuth(). Works on a method or a class.
 */
export const Roles = (...roles: string[]): MethodDecorator & ClassDecorator => {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      Reflect.defineMetadata(METADATA_KEYS.authRequired, true, target.constructor, propertyKey)
      Reflect.defineMetadata(METADATA_KEYS.authRoles, roles, target.constructor, propertyKey)
    } else {
      Reflect.defineMetadata(METADATA_KEYS.authRequired, true, target)
      Reflect.defineMetadata(METADATA_KEYS.authRoles, roles, target)
    }
  }
}

/** Injects the verified token payload (request.user) into the parameter. */
export const CurrentUser = () => createParamDecorator('currentUser')

export interface ValidationDecoratorOptions {
  body?: ZodSchema<any>
  query?: ZodSchema<any>
  params?: ZodSchema<any>
  /**
   * Define response schemas for different HTTP status codes.
   * The key is the status code (e.g., 200, 201) and the value is the Zod schema.
   */
  responses?: {
    [statusCode: number]: ZodSchema<any>
  }
}
// --- Validation Decorators ---

const Validate = (schema: ValidationDecoratorOptions): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    Reflect.defineMetadata(METADATA_KEYS.validationSchema, schema, target, propertyKey)
  }
}

export const Schema = Validate

// --- Swagger Documentation Decorators ---

export interface SwaggerOptions {
  summary?: string
  description?: string
  tags?: string[]
  deprecated?: boolean
  operationId?: string
  security?: Array<Record<string, string[]>>
}

/**
 * Decorator to add Swagger/OpenAPI documentation metadata to a controller class or route method.
 * 
 * When used on a controller class, the metadata applies to all routes in that controller.
 * When used on a method, it overrides/merges with controller-level metadata.
 * 
 * @example
 * // Controller-level (applies to all routes)
 * @Controller('/users')
 * @Swagger({
 *   tags: ['Users'],
 *   security: [{ bearerAuth: [] }]
 * })
 * export class UserController {
 *   @Get('/:id')  // Inherits tags and security
 *   getUserById() {}
 * }
 * 
 * // Method-level (overrides controller)
 * @Get('/users/:id')
 * @Swagger({
 *   summary: 'Get user by ID',
 *   description: 'Retrieves a single user by their unique identifier',
 *   tags: ['Users', 'Public'],  // Merges with controller tags
 *   deprecated: false
 * })
 * getUserById(@Param('id') id: string) {
 *   // ...
 * }
 */
export const Swagger = (options: SwaggerOptions): ClassDecorator & MethodDecorator => {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      // Method decorator
      Reflect.defineMetadata(METADATA_KEYS.swaggerMetadata, options, target, propertyKey)
    } else {
      // Class decorator
      Reflect.defineMetadata(METADATA_KEYS.swaggerMetadata, options, target)
    }
  }
}

export const UseMiddleware = (
  ...middlewares: FastifyMiddleware[]
): MethodDecorator & ClassDecorator => {
  return (target: any, propertyKey?: string | symbol) => {
    const key = METADATA_KEYS.middleware
    if (propertyKey) {
      // Method Decorator
      Reflect.defineMetadata(key, middlewares, target, propertyKey)
    } else {
      // Class Decorator
      Reflect.defineMetadata(key, middlewares, target)
    }
  }
}

export const Autowired = (token?: any): any => {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex?: number) => {
    // Constructor Parameter Injection
    if (typeof parameterIndex === 'number') {
      if (!token) {
        throw new Error(
          `[DI] @Autowired token is required for constructor parameter injection in '${target.name}'. This is needed for interfaces.`
        )
      }
      const constructorParams = Reflect.getMetadata(METADATA_KEYS.autowiredParams, target) || []
      constructorParams[parameterIndex] = token
      Reflect.defineMetadata(METADATA_KEYS.autowiredParams, constructorParams, target)
      return
    }

    // Property (Field) Injection
    const propertyType = propertyKey
      ? Reflect.getMetadata('design:type', target, propertyKey)
      : undefined
    const properties =
      Reflect.getMetadata(METADATA_KEYS.autowiredProperties, target.constructor) || []

    const tokenToInject = token || propertyType
    if (!tokenToInject) {
      throw new Error(
        `[DI] Could not resolve type for property '${String(propertyKey)}' on class '${target.constructor.name
        }'.`
      )
    }

    properties.push({
      propertyKey,
      token: tokenToInject,
    })
    Reflect.defineMetadata(METADATA_KEYS.autowiredProperties, properties, target.constructor)
  }
}
