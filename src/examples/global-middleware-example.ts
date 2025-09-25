import { createBootifyApp, FastifyMiddleware } from '../index'
import { Controller, Get } from '../core/decorators'

// Example middleware implementations
const authMiddleware: FastifyMiddleware = async (request, reply) => {
  console.log('🔐 Auth middleware executed')
  // Add authentication logic here
  // For example: check JWT token, validate API key, etc.
  
  // Example: Add user info to request context
  ;(request as any).user = { id: 1, username: 'testuser' }
}

const rateLimitMiddleware: FastifyMiddleware = async (request, reply) => {
  console.log('⏱️  Rate limit middleware executed')
  // Add rate limiting logic here
  // For example: check request count per IP, implement sliding window, etc.
  
  // Example: Simple rate limiting check
  const clientIP = request.ip
  console.log(`Rate limiting check for IP: ${clientIP}`)
}

const loggingMiddleware: FastifyMiddleware = async (request, reply) => {
  console.log('📝 Custom logging middleware executed')
  // Add custom logging logic here
  // For example: log request details, performance metrics, etc.
  
  console.log(`${request.method} ${request.url} - User-Agent: ${request.headers['user-agent']}`)
}

const corsMiddleware: FastifyMiddleware = async (request, reply) => {
  console.log('🌐 CORS middleware executed')
  // Add CORS headers
  reply.header('Access-Control-Allow-Origin', '*')
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

@Controller('/api/users')
class UserController {
  @Get('/')
  getUsers() {
    return {
      message: 'Users retrieved successfully',
      users: [
        { id: 1, name: 'John Doe' },
        { id: 2, name: 'Jane Smith' }
      ]
    }
  }

  @Get('/:id')
  getUserById() {
    return {
      message: 'User retrieved successfully',
      user: { id: 1, name: 'John Doe' }
    }
  }
}

// Example usage of globalMiddlewares
export async function startAppWithGlobalMiddlewares() {
  const app = await createBootifyApp({
    controllers: [UserController],
    port: 3000,
    enableSwagger: true,
    // Global middlewares execute in the order they are defined
    globalMiddlewares: [
      corsMiddleware,       // Executes first - handles CORS
      authMiddleware,       // Executes second - handles authentication
      rateLimitMiddleware,  // Executes third - handles rate limiting
      loggingMiddleware     // Executes fourth - handles custom logging
    ]
  })

  await app.start()
  console.log('🚀 Server started with global middlewares!')
  console.log('📖 API Documentation: http://localhost:3000/api-docs')
  console.log('🔗 Test endpoint: http://localhost:3000/api/users')
}

// Uncomment to run this example
// startAppWithGlobalMiddlewares().catch(console.error)