import dotenv from 'dotenv'
import 'reflect-metadata'
import { createBootifyApp } from '../api'
import { FastifyMiddleware } from '../core/decorators'
import { container } from '../core/di-container'
import { bootstrapEventSystem } from '../events/bootstrap'
import { HealthController } from './controllers/health.controller'
import { TodoController } from './controllers/todo.controller'
dotenv.config()
// import { bootstrapCache } from '../cache/bootstrap'
import z from 'zod'
import { registerJWTAuthRoutes, setupJwtAuth } from '../auth/examples/basic-usage'
import { bootstrapCache } from '../cache'
// Import the RedisCacheStore to trigger @Service decorator registration
import '../cache/stores/redis-cache.store'

// --- Application Startup ---


const envSchema = z.object({
  NODE_ENV: z.string().min(1),
  JWT_SECRET: z.string().min(1),
})

// Global middleware implementations
const corsMiddleware: FastifyMiddleware = async (request, reply) => {
  console.log('🌐 CORS middleware executed')
  reply.header('Access-Control-Allow-Origin', '*')
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

const requestTimingMiddleware: FastifyMiddleware = async (request, reply) => {
  const startTime = Date.now()
  console.log(`⏱️  Request started: ${request.method} ${request.url}`)

    // Add timing info to request context
    ; (request as any).startTime = startTime
    ; (request as any).logTiming = () => {
      const duration = Date.now() - startTime
      console.log(`⏱️  Request completed in ${duration}ms: ${request.method} ${request.url}`)
    }
}

const securityHeadersMiddleware: FastifyMiddleware = async (request, reply) => {
  console.log('🔒 Security headers middleware executed')
  reply.header('X-Content-Type-Options', 'nosniff')
  reply.header('X-Frame-Options', 'DENY')
  reply.header('X-XSS-Protection', '1; mode=block')
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

const requestLoggingMiddleware: FastifyMiddleware = async (request, reply) => {
  const clientIP = request.ip
  const userAgent = request.headers['user-agent'] || 'Unknown'
  console.log(`📝 Request: ${request.method} ${request.url} from ${clientIP} - ${userAgent}`)
}

async function main() {
  //   await intitializeLogging()


  const { middleware: jwtAuthMiddleware, authManager } = await setupJwtAuth()

  // Register authManager in DI container for controller injection
  container.register('AuthManager', { useFactory: () => authManager })

  const allComponents = Array.from(container.getRegisteredComponents())
  await bootstrapEventSystem(allComponents, { useBufferedProcessing: true })
  await bootstrapCache()

  const { app, start } = await createBootifyApp({
    controllers: [HealthController, TodoController],
    enableSwagger: true,
    port: 8080,
    configSchema: envSchema,
    globalMiddlewares: [
      // jwtAuthMiddleware.authenticate({
      //   strategies: ['jwt', 'api-key'],
      //   skipPaths: ['/auth/login', '/auth/refresh', '/health']
      // }),
      corsMiddleware,              // 1st: Handle CORS headers
      securityHeadersMiddleware,   // 2nd: Add security headers
      requestTimingMiddleware,     // 3rd: Start request timing
      requestLoggingMiddleware     // 4th: Log request details
    ],
    enableCookie: true
  })

  await registerJWTAuthRoutes(app, authManager, jwtAuthMiddleware)

  // Setup context middleware with authentication
  // app.addHook('onRequest', createContextMiddleware(authContextExtractor));

  // console.log('All components:', container.getRegisteredComponents())
  // const animal = container.resolve<Animal>('Animal')

  // //   console.log(animal)
  // const animalservice: AnimalService = container.resolve<AnimalService>(AnimalService)
  // console.log(animalservice.animal === animalservice.animal1)
  // console.log(animalservice.animal.name)

  // console.log('🚀 BootifyJS Example Server starting...');
  // console.log('🔧 Global middlewares enabled: CORS, Security Headers, Request Timing, Request Logging');
  // console.log('📊 Available endpoints:');
  // console.log('  GET /todos - List all todos (requires authentication)');
  // console.log('  POST /todos - Create a new todo (requires authentication)');
  // console.log('  GET /todos/:id - Get a specific todo (requires authentication)');
  // console.log('  PUT /todos/:id - Update a todo (requires authentication)');
  // console.log('  DELETE /todos/:id - Delete a todo (requires authentication)');
  // console.log('  GET /animals - List all animals');
  // console.log('  POST /animals - Create a new animal');
  // console.log('🔐 Authentication endpoints:');
  // console.log('  POST /auth/login - Login to get JWT token');
  // console.log('  GET /auth/info - Check authentication status');
  // console.log('💡 Use @UseMiddleware(authenticate()) decorator for protected routes!');
  // console.log('🔑 Test credentials: admin/admin123, manager/manager123, user/user123');
  // console.log('🌐 CORS enabled for all origins');
  // console.log('🔒 Security headers automatically added to all responses');

  await start()
}

main()
