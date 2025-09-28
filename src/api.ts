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
  ignoreTrailingSlash?: boolean
  enableCookie?: boolean
}

export async function createBootifyApp(options: BootifyAppOptions) {
  AppConfig.initialize(options.configSchema ?? z.object({}))

  const { logger, startupLogger } = await intitializeLogging()

  startupLogger.logStartupBanner()
  const app: FastifyInstance = fastify({
    logger: false,
    ignoreTrailingSlash: options.ignoreTrailingSlash ?? true,
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

  // Register cookie parsing if enabled
  if (options.enableCookie) {
    startupLogger.logComponentStart('Registering Cookie Parser')
    try {
      const fastifyCookie = await import('@fastify/cookie' as string)
      await app.register(fastifyCookie.default, {
        hook: "onRequest", // set to false to disable cookie autoparsing or set
        parseOptions: {}, // options for parsing cookies
      })
      startupLogger.logComponentComplete('Cookie Parser')
    } catch (error) {
      throw new Error('Cookie parsing is enabled but @fastify/cookie is not installed. Please install it with: npm install @fastify/cookie')
    }
  }

  if (options.enableSwagger) {
    startupLogger.logComponentStart('Initializing Swagger')
    const swaggerHost = options.hostname ?? 'localhost'
    const swaggerPort = options.port ?? DEFAULT_SERVER_PORT
    const fastifySwagger = await import('@fastify/swagger')
    const fastifySwaggerUI = await import('@fastify/swagger-ui')
    await app.register(fastifySwagger.default, {
      openapi: {
        info: {
          title: 'Bootify (Fastify) API',
          description: 'API documentation',
          version: '1.0.0',
        },
        servers: [{ url: `http://${swaggerHost}:${swaggerPort}` }],
      },
    })

    await app.register(fastifySwaggerUI.default, {
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
