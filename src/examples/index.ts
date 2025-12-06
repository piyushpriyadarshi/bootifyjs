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
import { HealthController } from "./controllers/health.controller";
import { TodoController } from "./controllers/todo.controller";
dotenv.config();
// Import the RedisCacheStore to trigger @Service decorator registration
import "../cache/stores/redis-cache.store";
import { createContextMiddleware } from "../middleware";
// Import scheduled tasks service to register it with DI
import "./services/scheduled-tasks.service";

// --- Application Startup ---

const envSchema = z.object({
  NODE_ENV: z.string().min(1),
  JWT_SECRET: z.string().min(1),
});

// Global middleware implementations
const corsMiddleware: FastifyMiddleware = async (request, reply) => {
  console.log("🌐 CORS middleware executed");
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const requestTimingMiddleware: FastifyMiddleware = async (request, reply) => {
  const startTime = Date.now();
  console.log(`⏱️  Request started: ${request.method} ${request.url}`);

  // Add timing info to request context
  (request as any).startTime = startTime;
  (request as any).logTiming = () => {
    const duration = Date.now() - startTime;
    console.log(
      `⏱️  Request completed in ${duration}ms: ${request.method} ${request.url}`
    );
  };
};

const securityHeadersMiddleware: FastifyMiddleware = async (request, reply) => {
  console.log("🔒 Security headers middleware executed");
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("X-XSS-Protection", "1; mode=block");
  reply.header(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
};

const requestLoggingMiddleware: FastifyMiddleware = async (request, reply) => {
  const clientIP = request.ip;
  const userAgent = request.headers["user-agent"] || "Unknown";
  console.log(
    `📝 Request: ${request.method} ${request.url} from ${clientIP} - ${userAgent}`
  );
};

async function main() {
  // Setup JWT authentication
  const { middleware: jwtAuthMiddleware, authManager } = await setupJwtAuth();

  // Register authManager in DI container for controller injection
  container.register("AuthManager", { useFactory: () => authManager });

  const { app, start } = await createBootify()
    // Configuration
    .useConfig(envSchema)
    .setPort(8080)

    // Initialize services before start
    .beforeStart(async () => {
      console.log("🔧 Initializing services...");

      // Bootstrap cache
      await bootstrapCache();

      console.log("✅ Services initialized");
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
      await app.addHook("onRequest", createContextMiddleware());
      const fastifySwagger = await import("@fastify/swagger");
      const fastifySwaggerUI = await import("@fastify/swagger-ui");

      await app.register(fastifySwagger.default, {
        openapi: {
          info: {
            title: "Bootify (Fastify) API",
            description: "API documentation",
            version: "1.0.0",
          },
          servers: [{ url: `http://localhost:8080` }],
        },
      });

      await app.register(fastifySwaggerUI.default, {
        routePrefix: "/api-docs",
      });
    })

    // Register global middlewares in order
    .useMiddlewares([
      corsMiddleware,              // 1st: Handle CORS headers
      securityHeadersMiddleware,   // 2nd: Add security headers
      requestTimingMiddleware,     // 3rd: Start request timing
      requestLoggingMiddleware,    // 4th: Log request details
    ])

    // Register controllers
    .useControllers([HealthController, TodoController])

    // Register JWT auth routes after app is built
    .beforeStart(async (app: FastifyInstance) => {
      await registerJWTAuthRoutes(app, authManager, jwtAuthMiddleware);
    })

    // After start hook
    .afterStart(async (app: FastifyInstance) => {
      console.log("🚀 BootifyJS Example Server started!");
      console.log("📋 Scheduled jobs are running in the background");
    })

    .build();

  // Add scheduler status endpoint
  app.get('/scheduler/status', async () => {
    const { SchedulerService } = await import('../scheduling')
    const scheduler = container.resolve<typeof SchedulerService>(SchedulerService)
    return (scheduler as any).getStats()
  })

  // Add manual trigger endpoint
  app.post('/scheduler/trigger/:jobName', async (request, reply) => {
    const { jobName } = request.params as { jobName: string }
    try {
      const { SchedulerService } = await import('../scheduling')
      const scheduler = container.resolve<typeof SchedulerService>(SchedulerService)
      await (scheduler as any).trigger(jobName)
      return { success: true, message: `Job '${jobName}' triggered` }
    } catch (error: any) {
      reply.status(404)
      return { success: false, error: error.message }
    }
  })

  await start();
}

main();
