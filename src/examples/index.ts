import dotenv from "dotenv";
import { FastifyInstance } from "fastify";
import "reflect-metadata";
import z from "zod";
import {
  registerJWTAuthRoutes,
  setupJwtAuth,
} from "../auth/examples/basic-usage";
import { createBootify } from "../BootifyApp";
import { bootstrapCache } from "../cache";
import { FastifyMiddleware } from "../core/decorators";
import { container } from "../core/di-container";
import { getLogger, ILogger } from "../logging";
import { HealthController } from "./controllers/health.controller";
import { TodoController } from "./controllers/todo.controller";
dotenv.config();
// Import the RedisCacheStore to trigger @Service decorator registration
import "../cache/stores/redis-cache.store";
// Import scheduled tasks service to register it with DI
import "./services/scheduled-tasks.service";
// Import event handlers to register them with DI (must be after events to avoid circular deps)
import { TestSwaggerController } from "./controllers/test-swagger.controller";
import "./events/TodoEventHandler";

// --- Application Startup ---

const envSchema = z.object({
  NODE_ENV: z.string().min(1),
  JWT_SECRET: z.string().min(1),
});

// Middleware factory that uses the logger
function createLoggingMiddlewares(logger: ILogger) {
  const corsMiddleware: FastifyMiddleware = async (_request, reply) => {
    logger.debug("CORS middleware executed")
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  };

  const requestTimingMiddleware: FastifyMiddleware = async (request, _reply) => {
    const startTime = Date.now();
    logger.debug("Request started", {
      method: request.method,
      url: request.url
    });

    // Add timing info to request context
    (request as any).startTime = startTime;
    (request as any).logTiming = () => {
      const duration = Date.now() - startTime;
      logger.info("Request completed", {
        method: request.method,
        url: request.url,
        duration,
      });
    };
  };

  const securityHeadersMiddleware: FastifyMiddleware = async (_request, reply) => {
    logger.debug("Security headers middleware executed");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-XSS-Protection", "1; mode=block");
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  };

  const requestLoggingMiddleware: FastifyMiddleware = async (request, _reply) => {
    const clientIP = request.ip;
    const userAgent = request.headers["user-agent"] || "Unknown";
    logger.info("Incoming request", {
      method: request.method,
      url: request.url,
      clientIP,
      userAgent,
    });
  };

  return {
    corsMiddleware,
    requestTimingMiddleware,
    securityHeadersMiddleware,
    requestLoggingMiddleware,
  };
}

async function main() {
  // Setup JWT authentication
  const { middleware: jwtAuthMiddleware, authManager } = await setupJwtAuth();

  // Register authManager in DI container for controller injection
  container.register("AuthManager", { useFactory: () => authManager });

  const { app, start, logger } = await createBootify()
    // Configuration
    .useConfig(envSchema)
    .setPort(8080)
    .setServiceName("bootify-example")

    // Configure logger - using built-in console logger (no external dependencies)
    .useLogger(builder => builder
      .setLevel((process.env.LOG_LEVEL as any) || 'info')
      .configureConsole({
        colorize: process.env.NODE_ENV !== 'production',
        prettyPrint: process.env.NODE_ENV !== 'production',
      })
    )

    // Initialize services before start
    .beforeStart(async () => {
      const log = getLogger();
      log.info("Initializing services...");
      bootstrapCache();
      log.info("Services initialized");
    })

    // Register Cookie plugin
    .usePlugin(async (app: FastifyInstance) => {
      const fastifyCookie = await import("@fastify/cookie");
      await app.register(fastifyCookie.default, {
        hook: "onRequest",
        parseOptions: {},
      });
    })

    // Register Swagger
    .usePlugin(async (app: FastifyInstance) => {
      // app.addHook("onRequest", createContextMiddleware());
      const fastifySwagger = await import("@fastify/swagger");
      const fastifySwaggerUI = await import("@fastify/swagger-ui");

      await app.register(fastifySwagger.default, {
        openapi: {
          info: {
            title: "BootifyJS Example API",
            description: "API documentation for BootifyJS example application",
            version: "1.0.0",
          },
          servers: [{ url: `http://localhost:8080` }],
        },
      });

      await app.register(fastifySwaggerUI.default, {
        routePrefix: "/api-docs",
      });
    })

    // Register controllers with API prefix
    // Health controller at root, Todo controller under /api/v1
    .useControllers([HealthController])  // /health
    .useControllers([TodoController, TestSwaggerController], { prefix: '/api/v1' })  // /api/v1/todos, /api/v1/test-swagger

    // Register JWT auth routes after app is built
    .beforeStart(async (app: FastifyInstance) => {
      registerJWTAuthRoutes(app, authManager, jwtAuthMiddleware);
    })

    // After start hook
    .afterStart(async () => {
      const log = getLogger();
      log.info("BootifyJS Example Server started!");
      log.info("Scheduled jobs are running in the background");
      log.info("API Documentation available", { url: "http://localhost:8080/api-docs" });
    })

    .build();

  // Create middlewares with logger
  const middlewares = createLoggingMiddlewares(logger);

  // Register middlewares manually after build (since we need the logger)
  app.addHook('onRequest', middlewares.corsMiddleware);
  app.addHook('onRequest', middlewares.securityHeadersMiddleware);
  app.addHook('onRequest', middlewares.requestTimingMiddleware);
  app.addHook('onRequest', middlewares.requestLoggingMiddleware);

  // Add scheduler status endpoint
  app.get('/scheduler/status', async () => {
    const { SchedulerService } = await import('../scheduling');
    const scheduler = container.resolve<typeof SchedulerService>(SchedulerService);
    return (scheduler as any).getStats();
  });

  // Add manual trigger endpoint
  app.post('/scheduler/trigger/:jobName', async (request, reply) => {
    const { jobName } = request.params as { jobName: string };
    try {
      const { SchedulerService } = await import('../scheduling');
      const scheduler = container.resolve<typeof SchedulerService>(SchedulerService);
      await (scheduler as any).trigger(jobName);
      logger.info("Job triggered manually", { jobName });
      return { success: true, message: `Job '${jobName}' triggered` };
    } catch (error: any) {
      logger.error("Failed to trigger job", error, { jobName });
      reply.status(404);
      return { success: false, error: error.message };
    }
  });

  await start();
}

main();
