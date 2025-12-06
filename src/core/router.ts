import { FastifyInstance, FastifyReply, FastifyRequest, RouteOptions } from 'fastify'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { METADATA_KEYS, ValidationDecoratorOptions } from './decorators'
import { Constructor, container } from './di-container'

// const buildJsonSchema = (schemas: any) => {
//   const schema: any = {}
//   if (schemas.body) schema.body = zodToJsonSchema(schemas.body)
//   if (schemas.query) schema.querystring = zodToJsonSchema(schemas.query)
//   if (schemas.params) schema.params = zodToJsonSchema(schemas.params)

//   return schema
// }

function buildFastifySchema(options: ValidationDecoratorOptions) {
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

export function registerControllers(fastify: FastifyInstance, controllers: Constructor[]) {
  console.log('📋 Registering controllers...')

  controllers.forEach((controllerClass) => {
    // 👇 Read controller-level middleware
    const classMiddlewares = Reflect.getMetadata(METADATA_KEYS.middleware, controllerClass) || []
    const controllerInstance = container.resolve(controllerClass) as any
    const prefix = Reflect.getMetadata(METADATA_KEYS.controllerPrefix, controllerClass) || ''
    const routes = Reflect.getMetadata(METADATA_KEYS.routes, controllerClass) || []

    routes.forEach((route: any) => {
      // 👇 Read method-level middleware
      const methodMiddlewares =
        Reflect.getMetadata(METADATA_KEYS.middleware, controllerInstance, route.handlerName) || []
      const allMiddlewares = [...classMiddlewares, ...methodMiddlewares] // Combine them

      const handler = controllerInstance[route.handlerName].bind(controllerInstance)
      const paramDecorators =
        Reflect.getMetadata(METADATA_KEYS.paramTypes, controllerInstance, route.handlerName) || []
      const validationSchemas = Reflect.getMetadata(
        METADATA_KEYS.validationSchema,
        controllerInstance,
        route.handlerName
      )

      // console.log(validationSchemas)
      const url = `${prefix}${route.path}`.replace(/\/+/g, '/')

      // Get Swagger metadata if it exists
      const swaggerMetadata = Reflect.getMetadata(
        METADATA_KEYS.swaggerMetadata,
        controllerInstance,
        route.handlerName
      )

      // Build the schema, merging validation schemas with swagger metadata
      let schema: any = validationSchemas ? buildFastifySchema(validationSchemas) : {}

      if (swaggerMetadata) {
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

      const routeOptions: RouteOptions = {
        method: route.method,
        url,
        schema,
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
      console.log(
        `  ✓  Registered: ${route.method.padEnd(7)} ${url} (middlewares: ${allMiddlewares.length
        })`
      )
    })
  })
  console.log('✅ All controllers registered successfully!\n')
}
