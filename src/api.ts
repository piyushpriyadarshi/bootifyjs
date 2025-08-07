import fastify, { FastifyInstance } from 'fastify'
import z, { ZodError, ZodObject, ZodSchema } from 'zod'
import { registerControllers } from './core/router'
import { Constructor } from './core/di-container'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUI from '@fastify/swagger-ui'
import {
  createRequestLoggerOnResponse,
  requestLoggerOnRequest,
  requestLoggerOnResponse,
} from './middleware/request-logger.middleware'
import { contextMiddleware } from './middleware/context.middleware'
import { intitializeLogging } from './logging'
import { AppConfig } from './config/AppConfig'

export interface BootifyAppOptions {
  controllers: Constructor[]
  port?: number
  hostname?: string
  enableSwagger?: boolean
  configSchema?: ZodObject<any>
}

export async function createBootifyApp(options: BootifyAppOptions) {
  AppConfig.initialize(options.configSchema ?? z.object({}))

  const { logger, startupLogger } = await intitializeLogging()

  startupLogger.logStartupBanner()
  const app: FastifyInstance = fastify({
    logger: false,
  })

  startupLogger.logComponentStart('Request Context Middleware')

  app.addHook('onRequest', contextMiddleware)
  startupLogger.logComponentComplete('Request Context Middleware')

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
    await app.register(fastifySwagger, {
      openapi: {
        info: {
          title: 'Bootify (Fastify) API',
          description: 'API documentation',
          version: '1.0.0',
        },
        servers: [{ url: `http://${options.hostname ?? 'localhost'}:${options.port ?? 3000}` }],
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
      await app.listen({ port: options.port ?? 3000, host: options.hostname ?? '0.0.0.0' })
      startupLogger.logStartupSummary()
    } catch (err) {
      app.log.error(err)
      process.exit(1)
    }
  }
  return { app, start }
}
