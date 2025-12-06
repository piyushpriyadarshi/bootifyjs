import { FastifyReply, FastifyRequest } from 'fastify'
import 'reflect-metadata'
import { ZodSchema } from 'zod'
import { FRAMEWORK_METADATA_KEYS } from '../constants'
import { registeredComponents } from './component-registry'
import { ComponentOptions, container, Scope } from './di-container'

// --- Metadata Keys ---
export const METADATA_KEYS = {
  controllerPrefix: FRAMEWORK_METADATA_KEYS.CONTROLLER_PREFIX,
  routes: FRAMEWORK_METADATA_KEYS.ROUTES,
  validationSchema: FRAMEWORK_METADATA_KEYS.VALIDATION_SCHEMA,
  paramTypes: FRAMEWORK_METADATA_KEYS.PARAM_TYPES,
  middleware: FRAMEWORK_METADATA_KEYS.MIDDLEWARE,
  autowiredProperties: FRAMEWORK_METADATA_KEYS.AUTOWIRED_PROPERTIES,
  autowiredParams: FRAMEWORK_METADATA_KEYS.AUTOWIRED_PARAMS,
  swaggerMetadata: 'swagger:metadata',
}

export type FastifyMiddleware = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<void> | void

// export interface ComponentOptions {
//   scope?: Scope
//   /**
//    * An array of tokens that this class should be bound to in the DI container.
//    * Allows this class to be injected using an interface or symbol.
//    */
//   bindTo?: any[]
// }
export const Component = (options: ComponentOptions = {}): ClassDecorator => {
  return (target: any) => {
    const scope = options.scope || Scope.SINGLETON

    // 1. Register the class by its own type (as before)
    container.register(target, { useClass: target, scope: scope as any })

    // 2. Add to the global component registry (as before)
    registeredComponents.add(target)

    // 3. NEW: Automatically handle the interface/token bindings
    if (options.bindTo && Array.isArray(options.bindTo)) {
      console.log(
        `[DI] Binding '${target.name}' to tokens: [${options.bindTo
          .map((t) => String(t))
          .join(', ')}]`
      )
      for (const token of options.bindTo) {
        // Map the abstract token to this concrete class
        container.register(token, { useClass: target, scope: scope as any })
      }
    }
  }
}
export const Service = (options: ComponentOptions = {}): ClassDecorator => Component(options)

// Repository can also be updated
export const Repository = (options: ComponentOptions = {}): ClassDecorator => Component(options)

export const Controller =
  (prefix: string = ''): ClassDecorator =>
    (target: any) => {
      Reflect.defineMetadata(METADATA_KEYS.controllerPrefix, prefix, target)
      container.register(target, { useClass: target, scope: Scope.SINGLETON as any })
    }

// --- Method Decorators ---
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

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

// --- Parameter Decorators ---
const createParamDecorator =
  (type: string, name?: string) =>
    (target: any, propertyKey: string | symbol, parameterIndex: number) => {
      const params = Reflect.getMetadata(METADATA_KEYS.paramTypes, target, propertyKey) || []
      params[parameterIndex] = { type, name }
      Reflect.defineMetadata(METADATA_KEYS.paramTypes, params, target, propertyKey)
    }

export const Body = () => createParamDecorator('body')
export const Query = (name?: string) => createParamDecorator('query', name)
export const Param = (name: string) => createParamDecorator('param', name)
export const Req = () => createParamDecorator('request')
export const Res = () => createParamDecorator('reply')

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
 * Decorator to add Swagger/OpenAPI documentation metadata to a route.
 * This metadata will be merged with the schema generated from @Schema decorator.
 * 
 * @example
 * @Get('/users/:id')
 * @Swagger({
 *   summary: 'Get user by ID',
 *   description: 'Retrieves a single user by their unique identifier',
 *   tags: ['Users'],
 *   deprecated: false
 * })
 * getUserById(@Param('id') id: string) {
 *   // ...
 * }
 */
export const Swagger = (options: SwaggerOptions): MethodDecorator => {
  return (target: any, propertyKey: string | symbol) => {
    Reflect.defineMetadata(METADATA_KEYS.swaggerMetadata, options, target, propertyKey)
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

// export const Autowired = (): PropertyDecorator => {
//   return (target: any, propertyKey: string | symbol) => {
//     // Get the type of the property being decorated (e.g., TodoService class)
//     const propertyType = Reflect.getMetadata('design:type', target, propertyKey)

//     if (!propertyType) {
//       throw new Error(
//         `Could not resolve type for property '${String(propertyKey)}' on class '${
//           target.constructor.name
//         }'. Make sure 'emitDecoratorMetadata' is true in your tsconfig.json and the type is not a primitive or interface.`
//       )
//     }

//     // Get existing autowired properties for the target class or initialize a new array
//     const properties =
//       Reflect.getMetadata(METADATA_KEYS.autowiredProperties, target.constructor) || []

//     properties.push({
//       propertyKey,
//       type: propertyType,
//     })

//     // Save the updated list of properties back to the class metadata
//     Reflect.defineMetadata(METADATA_KEYS.autowiredProperties, properties, target.constructor)
//   }
// }

// export const Autowired = (token?: any): any => {
//   return (target: any, propertyKey: string | symbol | undefined, parameterIndex?: number) => {
//     // Check if it's being used as a Parameter Decorator
//     if (typeof parameterIndex === 'number') {
//       const constructorParams = Reflect.getMetadata('autowired:params', target) || []
//       constructorParams[parameterIndex] = token
//       Reflect.defineMetadata('autowired:params', constructorParams, target)
//       return
//     }

//     // Existing Property Decorator logic
//     const propertyType = propertyKey
//       ? Reflect.getMetadata('design:type', target, propertyKey)
//       : undefined
//     if (!propertyType) {
//       /* ... error handling ... */
//     }

//     const properties =
//       Reflect.getMetadata(METADATA_KEYS.autowiredProperties, target.constructor) || []
//     properties.push({
//       propertyKey,
//       // Use the explicit token if provided, otherwise fall back to the type
//       token: token || propertyType,
//     })
//     Reflect.defineMetadata(METADATA_KEYS.autowiredProperties, properties, target.constructor)
//   }
// }

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
