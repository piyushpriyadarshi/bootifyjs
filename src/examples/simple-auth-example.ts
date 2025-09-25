import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';
import { authorize, requireAdmin, requireManager } from '../middleware/authorization.middleware';

// JWT Secret - in production, this should come from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

/**
 * Setup simple authentication and authorization using your approach
 * @param app Fastify instance
 */
export function setupSimpleAuth(app: FastifyInstance) {
  console.log('🔐 Setting up Simple Authentication & Authorization...');
  
  // Example protected route using your middleware approach
  app.register(async function (fastify) {
    // Apply authentication middleware
    fastify.addHook('preHandler', authenticate(JWT_SECRET));
    
    // Admin only route
    fastify.get('/admin/users', {
      preHandler: [authorize(['ADMIN'])],
      handler: async (request, reply) => {
        return {
          message: 'Admin users data',
          user: request.user,
          authenticated: request.authenticated
        };
      }
    });
    
    // Manager and Admin route
    fastify.get('/manager/reports', {
      preHandler: [requireManager],
      handler: async (request, reply) => {
        return {
          message: 'Manager reports data',
          user: request.user,
          userRoles: request.user?.roles
        };
      }
    });
    
    // Any authenticated user route
    fastify.get('/profile', {
      handler: async (request, reply) => {
        if (!request.authenticated) {
          return reply.status(401).send({ message: 'Unauthorized' });
        }
        return {
          message: 'User profile',
          user: request.user
        };
      }
    });
  });
  
  // Login endpoint for testing (generates JWT token)
  app.post('/login', async (request, reply) => {
    const { username, password } = request.body as any;
    
    // Simple demo authentication (replace with real authentication)
    if (username === 'admin' && password === 'admin123') {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        {
          id: '1',
          username: 'admin',
          email: 'admin@easyhyre.com',
          roles: ['ADMIN'],
          exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
        },
        JWT_SECRET
      );
      
      return { 
        message: 'Login successful',
        token,
        user: {
          id: '1',
          username: 'admin',
          email: 'admin@easyhyre.com',
          roles: ['ADMIN']
        }
      };
    }
    
    if (username === 'manager' && password === 'manager123') {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        {
          id: '2',
          username: 'manager',
          email: 'manager@easyhyre.com',
          roles: ['MANAGER'],
          exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
        },
        JWT_SECRET
      );
      
      return { 
        message: 'Login successful',
        token,
        user: {
          id: '2',
          username: 'manager',
          email: 'manager@easyhyre.com',
          roles: ['MANAGER']
        }
      };
    }
    
    return reply.status(401).send({ message: 'Invalid credentials' });
  });
  
  console.log('✅ Simple Authentication & Authorization setup complete!');
  console.log('📝 Test endpoints:');
  console.log('   POST /login - Login with admin/admin123 or manager/manager123');
  console.log('   GET /admin/users - Admin only (requires Authorization header)');
  console.log('   GET /manager/reports - Manager and Admin (requires Authorization header)');
  console.log('   GET /profile - Any authenticated user (requires Authorization header)');
}