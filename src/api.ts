import 'source-map-support/register';
import { Application, ApplicationAdapter, ApplicationConfig } from './core/application'
import { OpenAPIGenerator } from './core/openapi'
import { configureLogging, contextMiddleware, createRequestLoggingMiddleware } from './logging'
import { configureEventSystem } from './events'
import { CorsPlugin } from './plugins/cors.plugin'
import { swaggerMiddleware } from './middlewares/swagger.middleware'

export * from './core/decorators'
export * from './core/errors'
export * from './core/middleware'
export * from './core/container'
export * from './core/config'
export * from './core/validation'
export * from './events'
export * from './logging'

export interface BootifyAppOptions extends Partial<ApplicationConfig> {
  enableSwagger?: boolean
  swaggerOptions?: {
    path?: string
    title?: string
  }
  enableCors?: boolean
  enableRequestLogging?: boolean
  requestLoggingOptions?: {
    logHeaders?: boolean
    logQuery?: boolean
    skipPaths?: string[]
    slowThreshold?: number
  }
  adapter?: ApplicationAdapter
}

export async function createBootifyApp(options: BootifyAppOptions) {
  // Initialize logging
  const { logger, startupLogger } = await configureLogging()

  // Log startup banner
  startupLogger.logStartupBanner()

  // Initialize event system
  startupLogger.logComponentStart('Event System')
  const eventBus = configureEventSystem()
  startupLogger.logComponentComplete('Event System', {
    metrics: eventBus.getMetrics(),
    registryStats: eventBus.getRegistry().getStatistics(),
  })

  // Default options
  const appOptions: BootifyAppOptions = {
    port: 3000,
    hostname: 'localhost',
    controllers: [],
    middlewares: [],
    enableSwagger: true,
    enableCors: true,
    enableRequestLogging: true,
    ...options,
  }

  // Setup middlewares
  const middlewares = [...(appOptions.middlewares || [])]

  // Add context middleware first (required for request tracking)
  middlewares.unshift(contextMiddleware)

  // Add request logging if enabled
  if (appOptions.enableRequestLogging) {
    middlewares.push(
      createRequestLoggingMiddleware({
        logHeaders: process.env.NODE_ENV === 'development',
        slowThreshold: 1000,
        skipPaths: ['/health/ping', '/favicon.ico'],
        ...(appOptions.requestLoggingOptions || {}),
      })
    )
  }

  // Generate OpenAPI documentation if enabled
  let openApiSpec
  if (appOptions.enableSwagger) {
    startupLogger.logComponentStart('OpenAPI Generator')

    const openApiGenerator = new OpenAPIGenerator(
      {
        title: 'BootifyJS API',
        version: '1.0.0',
        description: 'API built with BootifyJS Framework',
        contact: {
          name: 'BootifyJS Team',
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      [{ url: `http://${appOptions.hostname}:${appOptions.port}`, description: 'API Server' }]
    )

    openApiGenerator.addControllers(appOptions.controllers || [])
    openApiSpec = openApiGenerator.getSpec()

    startupLogger.logComponentComplete('OpenAPI Generator', {
      paths: Object.keys(openApiSpec.paths).length,
      schemas: Object.keys(openApiSpec.components.schemas).length,
    })

    // Add Swagger middleware
    middlewares.push(
      swaggerMiddleware(openApiSpec, {
        path: appOptions.swaggerOptions?.path || '/api-docs',
        title: appOptions.swaggerOptions?.title || 'API Documentation',
      })
    )
  }

  // Create application
  startupLogger.logComponentStart('Application')

  const app = new Application(
    {
      controllers: appOptions.controllers || [],
      middlewares,
      port: appOptions.port,
      hostname: appOptions.hostname,
    },
    appOptions.adapter
  )

  // Add CORS if enabled
  if (appOptions.enableCors) {
    await app.use(new CorsPlugin())
  }

  return {
    app,
    eventBus,
    logger,
    openApiSpec,

    // Start the application
    start: async () => {
      await app.start()
      return app
    },

    // Stop the application
    stop: async () => {
      await app.stop()
    },
  }
}
