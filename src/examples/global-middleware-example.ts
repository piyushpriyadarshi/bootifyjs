import { createBootifyApp } from '../BootifyApp'
import { FastifyMiddleware } from '../core/decorators'
import { Controller, Get } from '../core/decorators'

// Example middlewares for demonstration
const corsMiddleware: FastifyMiddleware = async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*')
}

const authMiddleware: FastifyMiddleware = async (request, reply) => {
  // Example: attach a mock user (replace with real auth)
  ;(request as any).user = { id: 1, name: 'John Doe' }
  ;(request as any).authenticated = true
}

const rateLimitMiddleware: FastifyMiddleware = async (request, reply) => {
  // Example: rate limiting stub
}

const loggingMiddleware: FastifyMiddleware = async (request, reply) => {
  // Example: request logging stub
}

@Controller('/users')
export class UserController {
  @Get('/')
  getUsers() {
    return [{ id: 1, name: 'John Doe' }]
  }

  @Get('/:id')
  getUserById() {
    return {
      message: 'User retrieved successfully',
      user: { id: 1, name: 'John Doe' }
    }
  }
}

// Example usage of global middlewares
export async function startAppWithGlobalMiddlewares() {
  const app = await createBootifyApp()
    .setPort(3000)
    .useControllers([UserController])
    .useMiddlewares([
      corsMiddleware,       // Executes first - handles CORS
      authMiddleware,       // Executes second - handles authentication
      rateLimitMiddleware,  // Executes third - handles rate limiting
      loggingMiddleware     // Executes fourth - handles custom logging
    ])
    .build()

  await app.start()
}

// Run if this file is executed directly
if (require.main === module) {
  startAppWithGlobalMiddlewares().catch(console.error)
}
