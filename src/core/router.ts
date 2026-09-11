import { FastifyInstance, FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { METADATA_KEYS } from './decorators'
import type { SwaggerOptions, ValidationDecoratorOptions } from './decorators'
import { Constructor, container } from './di-container'
import type { Container } from './di-container'
import { AUTH_MIDDLEWARE_TOKEN } from '../constants'
import { BootifyStateError } from './errors'

/**
 * Normalize a URL prefix - ensures it starts with / and doesn't end with /
 */
export function normalizePrefix(prefix: string): string {
  if (!prefix) return ''
  let normalized = prefix.startsWith('/') ? prefix : `/${prefix}`
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

/**
 * Join multiple path segments into a single URL path
 */
export function joinPaths(...paths: string[]): string {
  const joined = paths
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/')
  return joined || '/'
}

/**
 * Merge controller-level and method-level Swagger metadata
 * Method-level takes precedence, except for tags which are merged (unique values)
 * 
 * @param controllerMeta - Swagger metadata from controller class
 * @param methodMeta - Swagger metadata from method
 * @returns Merged metadata with method overrides and tag merging
 */
export function mergeSwaggerMetadata(
  controllerMeta: SwaggerOptions | undefined,
  methodMeta: SwaggerOptions | undefined
): SwaggerOptions {
  if (!controllerMeta) return methodMeta || {}
  if (!methodMeta) return controllerMeta

  // Merge tags (unique values)
  const controllerTags = controllerMeta.tags || []
  const methodTags = methodMeta.tags || []
  const mergedTags = [...controllerTags, ...methodTags]
  const uniqueTags = [...new Set(mergedTags)]

  return {
    // Controller defaults
    ...controllerMeta,
    // Method overrides
    ...methodMeta,
    // Special: merge tags (only if there are any tags)
    tags: uniqueTags.length > 0 ? uniqueTags : undefined,
  }
}

export function buildFastifySchema(options: ValidationDecoratorOptions) {
  const schema: any = {}

  if (options.body) schema.body = zodToJsonSchema(options.body)
  if (options.query) schema.querystring = zodToJsonSchema(options.query)
  if (options.params) schema.params = zodToJsonSchema(options.params)

  if (options.responses) {
    schema.response = {}
    for (const statusCode in options.responses) {
      schema.response[statusCode] = zodToJsonSchema(options.responses[statusCode])
    }
  }
  return schema
}

export interface RegisterControllersOptions {
  /** Container used to resolve controller instances. Defaults to the global container. */
  container?: Container
  /** Suppress registration logs (useful for tests). */
  silent?: boolean
}

/**
 * Register controllers with Fastify
 * @param fastify - Fastify instance
 * @param controllers - Array of controller classes
 * @param groupPrefix - Optional prefix to prepend to all routes in this group
 * @param options - Container + logging controls
 */
export function registerControllers(
  fastify: FastifyInstance,
  controllers: Constructor[],
  groupPrefix: string = '',
  options: RegisterControllersOptions = {}
) {
  const ctr = options.container ?? container
  const log = (message: string) => {
    if (!options.silent) console.log(message)
  }

  const prefixDisplay = groupPrefix ? ` (prefix: ${groupPrefix})` : ''
  log(`📋 Registering controllers${prefixDisplay}...`)

  controllers.forEach((controllerClass) => {
    // 👇 Read controller-level middleware
    const classMiddlewares = Reflect.getMetadata(METADATA_KEYS.middleware, controllerClass) || []
    const controllerInstance = ctr.resolve(controllerClass) as any
    const prefix = Reflect.getMetadata(METADATA_KEYS.controllerPrefix, controllerClass) || ''
    const routes = Reflect.getMetadata(METADATA_KEYS.routes, controllerClass) || []

    // 🆕 Read controller-level Swagger metadata
    const controllerSwaggerMeta: SwaggerOptions | undefined =
      Reflect.getMetadata(METADATA_KEYS.swaggerMetadata, controllerClass)

    routes.forEach((route: any) => {
      // 👇 Read method-level middleware
      const methodMiddlewares =
        Reflect.getMetadata(METADATA_KEYS.middleware, controllerInstance, route.handlerName) || []

      // 👇 Auth: method-level metadata wins over class-level
      const methodAuthRequired = Reflect.getMetadata(
        METADATA_KEYS.authRequired, controllerClass, route.handlerName)
      const classAuthRequired = Reflect.getMetadata(METADATA_KEYS.authRequired, controllerClass)
      const authRequired = methodAuthRequired ?? classAuthRequired ?? false

      const methodRoles: string[] | undefined = Reflect.getMetadata(
        METADATA_KEYS.authRoles, controllerClass, route.handlerName)
      const classRoles: string[] | undefined = Reflect.getMetadata(METADATA_KEYS.authRoles, controllerClass)
      const requiredRoles = methodRoles ?? classRoles ?? []

      const allMiddlewares = [...classMiddlewares, ...methodMiddlewares]

      if (authRequired || requiredRoles.length > 0) {
        let authBundle: any
        try {
          authBundle = ctr.resolve(AUTH_MIDDLEWARE_TOKEN)
        } catch {
          throw new BootifyStateError(
            `'@UseAuth()'/'@Roles()' used on '${controllerClass.name}' but auth is not enabled. ` +
            `Add .enableAuth() to createBootifyApp().`
          )
        }
        allMiddlewares.push(authBundle.authenticate)
        // authorize([]) rejects unauthenticated requests (401) and allows any
        // role; with roles it adds the 403 check.
        allMiddlewares.push(authBundle.authorize(requiredRoles))
      }

      const handler = controllerInstance[route.handlerName].bind(controllerInstance)
      // Param metadata is stored on the class constructor (single storage owner).
      const paramDecorators =
        Reflect.getMetadata(METADATA_KEYS.paramTypes, controllerClass, route.handlerName) || []
      const validationSchemas = Reflect.getMetadata(
        METADATA_KEYS.validationSchema,
        controllerInstance,
        route.handlerName
      )

      // Calculate final URL: groupPrefix + controllerPrefix + methodPath
      const url = joinPaths(groupPrefix, prefix, route.path)

      // 🆕 Read method-level Swagger metadata
      const methodSwaggerMeta: SwaggerOptions | undefined = Reflect.getMetadata(
        METADATA_KEYS.swaggerMetadata,
        controllerInstance,
        route.handlerName
      )

      // 🆕 Merge controller and method Swagger metadata
      const swaggerMetadata = mergeSwaggerMetadata(controllerSwaggerMeta, methodSwaggerMeta)

      // Build the schema, merging validation schemas with swagger metadata
      let schema: any = validationSchemas ? buildFastifySchema(validationSchemas) : {}

      if (swaggerMetadata && Object.keys(swaggerMetadata).length > 0) {
        schema = {
          ...schema,
          summary: swaggerMetadata.summary,
          description: swaggerMetadata.description,
          tags: swaggerMetadata.tags,
          deprecated: swaggerMetadata.deprecated,
          operationId: swaggerMetadata.operationId,
          security: swaggerMetadata.security,
        }
      }

      // @Public() stores an explicit `false` on the route — stamp it into the
      // Fastify route config so metadata-aware global hooks can skip it.
      const methodPublic = Reflect.getMetadata(METADATA_KEYS.authRequired, controllerClass, route.handlerName)
      const classPublic = Reflect.getMetadata(METADATA_KEYS.authRequired, controllerClass)
      const routeIsPublic = methodPublic === false || classPublic === false

      const routeOptions: RouteOptions = {
        method: route.method,
        url,
        schema,
        ...(routeIsPublic ? { config: { authPublic: true } as Record<string, unknown> } : {}),
        // 👇 Attach all middleware functions to the preHandler hook
        preHandler: allMiddlewares,
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
          try {
            const args = paramDecorators.map((param: any) => {
              if (!param) return undefined
              switch (param.type) {
                case 'body':
                  return request.body
                case 'query':
                  return param.name ? (request.query as any)[param.name] : request.query
                case 'param':
                  return (request.params as any)[param.name]
                case 'request':
                  return request
                case 'reply':
                  return reply
                case 'currentUser':
                  return (request as any).user
                default:
                  return undefined
              }
            })

            const result = await handler(...args)

            if (!reply.sent) {
              return result
            }
          } catch (error) {
            throw error
          }
        },
      }

      fastify.route(routeOptions)
      log(
        `  ✓  Registered: ${route.method.padEnd(7)} ${url} (middlewares: ${allMiddlewares.length
        })`
      )
    })
  })
  log('✅ All controllers registered successfully!\n')
}
