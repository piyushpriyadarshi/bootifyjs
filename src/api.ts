import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUI from '@fastify/swagger-ui'
import fastify, { FastifyInstance } from 'fastify'
import z, { ZodError, ZodObject } from 'zod'
import { AppConfig } from './config/AppConfig'
import { DEFAULT_SERVER_HOST, DEFAULT_SERVER_PORT } from './constants'
import { FastifyMiddleware } from './core/decorators'
import { Constructor } from './core/di-container'
import { registerControllers } from './core/router'
import { intitializeLogging } from './logging'
import { ContextExtractor, createContextMiddleware } from './middleware/context.middleware'
import {
  createRequestLoggerOnResponse,
  requestLoggerOnRequest
} from './middleware/request-logger.middleware'

export interface BootifyAppOptions {
  controllers: Constructor[]
  port?: number
  hostname?: string
  enableSwagger?: boolean
  configSchema?: ZodObject<any>
  contextExtractor?: ContextExtractor
  globalMiddlewares?: FastifyMiddleware[]
}

export async function createBootifyApp(options: BootifyAppOptions) {
  AppConfig.initialize(options.configSchema ?? z.object({}))

  const { logger, startupLogger } = await intitializeLogging()

  startupLogger.logStartupBanner()
  const app: FastifyInstance = fastify({
    logger: false,
  })

  // Register context middleware FIRST to establish AsyncLocalStorage context
  startupLogger.logComponentStart('Request Context Middleware')
  app.addHook('onRequest', createContextMiddleware(options.contextExtractor))
  startupLogger.logComponentComplete('Request Context Middleware')

  // Register global middlewares after context is established
  if (options.globalMiddlewares && options.globalMiddlewares.length > 0) {
    startupLogger.logComponentStart('Global Middlewares')
    options.globalMiddlewares.forEach((middleware, index) => {
      app.addHook('onRequest', middleware)
      console.log(`  ✓ Registered global middleware ${index + 1}`)
    })
    startupLogger.logComponentComplete('Global Middlewares')
  }

  // 2. Request Logger Hooks
  // These log the start and end of the request.
  startupLogger.logComponentStart('Attaching Request Logger')
  app.addHook('onRequest', requestLoggerOnRequest)
  app.addHook('onResponse', createRequestLoggerOnResponse(logger))
  startupLogger.logComponentComplete('Attaching Request Logger')

  startupLogger.logComponentStart('Attaching Global ErrorHandler')

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        details: error.issues,
      })
    } else if ((error as any).statusCode) {
      reply.send(error)
    } else {
      // app.log.error(error)
      logger.error('Internal Server Error', error)
      reply.status(500).send({ message: 'Internal Server Error' })
    }
  })
  startupLogger.logComponentComplete('Attaching Global ErrorHandler')

  if (options.enableSwagger) {
    startupLogger.logComponentStart('Initializing Swagger')
    const swaggerHost = options.hostname ?? 'localhost'
    const swaggerPort = options.port ?? DEFAULT_SERVER_PORT
    await app.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'Bootify (Fastify) API',
          description: 'API documentation',
          version: '1.0.0',
        },
        servers: [{ url: `http://${swaggerHost}:${swaggerPort}` }],
      },
    })

    await app.register(fastifySwaggerUI, {
      routePrefix: '/api-docs',
    })
    startupLogger.logComponentComplete(' Swagger COnfiguiration Done')
  }

  startupLogger.logComponentStart('Registering Controllers')
  registerControllers(app, options.controllers)
  startupLogger.logComponentComplete('Registering Controllers')

  startupLogger.logStartupComplete()
  const start = async () => {
    try {
      const actualPort = options.port ?? DEFAULT_SERVER_PORT
      const actualHost = options.hostname ?? DEFAULT_SERVER_HOST
      await app.listen({ port: actualPort, host: actualHost })
      startupLogger.logStartupSummary(actualPort, actualHost)
    } catch (err) {
      app.log.error(err)
      process.exit(1)
    }
  }
  return { app, start }
}
