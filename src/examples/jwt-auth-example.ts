import { FastifyInstance } from 'fastify';
import { AuthController } from './controllers/auth.controller';
import { jwtAuthMiddleware, optionalJwtAuthMiddleware, requireRoles, requirePermissions } from './auth/auth.middleware';
import { userService } from './services/user.service';

/**
 * JWT Authentication Example
 * Demonstrates how to set up JWT authentication with global middleware
 * and protected routes in a Fastify application
 */

/**
 * Protected User Controller
 * Example controller that requires authentication
 */
class ProtectedUserController {
  /**
   * Get current user profile (requires authentication)
   */
  async getProfile(request: any, reply: any) {
    const user = request.user;
    const profile = await userService.getUserProfile(user.id);
    
    reply.send({
      success: true,
      data: profile
    });
  }

  /**
   * Update user profile (requires authentication)
   */
  async updateProfile(request: any, reply: any) {
    const user = request.user;
    const { email, firstName, lastName } = request.body;
    
    const updatedUser = await userService.updateProfile(user.id, {
      email,
      firstName,
      lastName
    });
    
    if (!updatedUser) {
      reply.code(404).send({
        error: 'USER_NOT_FOUND',
        message: 'User not found'
      });
      return;
    }
    
    reply.send({
      success: true,
      data: updatedUser,
      message: 'Profile updated successfully'
    });
  }

  /**
   * Admin only endpoint (requires admin role)
   */
  async getAllUsers(request: any, reply: any) {
    const users = await userService.userRepository.findAll();
    
    reply.send({
      success: true,
      data: users,
      count: users.length
    });
  }

  /**
   * Delete user (requires admin permission)
   */
  async deleteUser(request: any, reply: any) {
    const { userId } = request.params;
    const success = await userService.userRepository.delete(userId);
    
    if (!success) {
      reply.code(404).send({
        error: 'USER_NOT_FOUND',
        message: 'User not found'
      });
      return;
    }
    
    reply.send({
      success: true,
      message: 'User deleted successfully'
    });
  }

  /**
   * Public endpoint (optional authentication)
   */
  async getPublicInfo(request: any, reply: any) {
    const isAuthenticated = request.isAuthenticated;
    const user = request.user;
    
    reply.send({
      success: true,
      data: {
        message: 'This is public information',
        timestamp: new Date().toISOString(),
        authenticated: isAuthenticated,
        user: isAuthenticated ? { id: user.id, username: user.username } : null
      }
    });
  }
}

/**
 * Setup JWT Authentication Routes and Middleware
 */
export async function setupJwtAuth(fastify: FastifyInstance) {
  // Initialize controllers
  const authController = new AuthController();
  const userController = new ProtectedUserController();

  // Register authentication routes (no middleware needed)
  fastify.register(async function authRoutes(fastify) {
    fastify.post('/auth/login', async (request, reply) => {
      return authController.login(request.body as any);
    });
    fastify.post('/auth/refresh', async (request, reply) => {
      return authController.refreshToken(request.body as any);
    });
    fastify.post('/auth/logout', async (request, reply) => {
      return authController.logout(request.body as any);
    });
    fastify.get('/auth/info', async (request, reply) => {
      return authController.getAuthInfo();
    });
  });

  // Register public routes with optional authentication
  fastify.register(async function publicRoutes(fastify) {
    // Add optional auth middleware
    fastify.addHook('preHandler', optionalJwtAuthMiddleware);
    
    fastify.get('/public/info', async (request, reply) => {
      return userController.getPublicInfo(request, reply);
    });
  });

  // Register protected user routes (requires authentication)
  fastify.register(async function protectedRoutes(fastify) {
    // Add JWT authentication middleware to all routes in this group
    fastify.addHook('preHandler', jwtAuthMiddleware);
    
    fastify.get('/user/profile', async (request, reply) => {
      return userController.getProfile(request, reply);
    });
    fastify.put('/user/profile', async (request, reply) => {
      return userController.updateProfile(request, reply);
    });
  });

  // Register admin routes (requires admin role)
  fastify.register(async function adminRoutes(fastify) {
    // Add JWT authentication middleware
    fastify.addHook('preHandler', jwtAuthMiddleware);
    // Add role-based authorization middleware
    fastify.addHook('preHandler', requireRoles(['admin']));
    
    fastify.get('/admin/users', async (request, reply) => {
      return userController.getAllUsers(request, reply);
    });
  });

  // Register admin routes with permission-based access
  fastify.register(async function adminPermissionRoutes(fastify) {
    // Add JWT authentication middleware
    fastify.addHook('preHandler', jwtAuthMiddleware);
    // Add permission-based authorization middleware
    fastify.addHook('preHandler', requirePermissions(['delete']));
    
    fastify.delete('/admin/users/:userId', async (request, reply) => {
      return userController.deleteUser(request, reply);
    });
  });
}

/**
 * Setup Global JWT Authentication Middleware
 * This applies JWT authentication to ALL routes except those explicitly excluded
 */
export async function setupGlobalJwtAuth(fastify: FastifyInstance) {
  // Define paths that should skip authentication
  const skipAuthPaths = [
    '/auth/login',
    '/auth/refresh',
    '/public/info',
    '/health',
    '/docs',
    '/docs/static/*'
  ];

  // Global authentication middleware
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip authentication for excluded paths
    const shouldSkip = skipAuthPaths.some(path => {
      if (path.endsWith('/*')) {
        const basePath = path.slice(0, -2);
        return request.url.startsWith(basePath);
      }
      return request.url === path || request.url.startsWith(path + '?');
    });

    if (shouldSkip) {
      return;
    }

    // Apply JWT authentication middleware
    await jwtAuthMiddleware(request, reply);
  });

  // Initialize controllers
  const authController = new AuthController();
  const userController = new ProtectedUserController();

  // Register all routes (authentication will be handled globally)
  fastify.post('/auth/login', async (request, reply) => {
    return authController.login(request.body as any);
  });
  fastify.post('/auth/refresh', async (request, reply) => {
    return authController.refreshToken(request.body as any);
  });
  fastify.post('/auth/logout', async (request, reply) => {
    return authController.logout(request.body as any);
  });
  fastify.get('/auth/info', async (request, reply) => {
    return authController.getAuthInfo();
  });
  
  // Public routes
  fastify.get('/public/info', async (request, reply) => {
    return userController.getPublicInfo(request, reply);
  });
  
  // Protected routes (will be automatically protected by global middleware)
  fastify.get('/user/profile', async (request, reply) => {
    return userController.getProfile(request, reply);
  });
  fastify.put('/user/profile', async (request, reply) => {
    return userController.updateProfile(request, reply);
  });
  
  // Admin routes with additional role checks
  fastify.register(async function adminRoutes(fastify) {
    fastify.addHook('preHandler', requireRoles(['admin']));
    fastify.get('/admin/users', async (request, reply) => {
      return userController.getAllUsers(request, reply);
    });
  });
  
  fastify.register(async function adminPermissionRoutes(fastify) {
    fastify.addHook('preHandler', requirePermissions(['delete']));
    fastify.delete('/admin/users/:userId', async (request, reply) => {
      return userController.deleteUser(request, reply);
    });
  });
}

/**
 * Start Fastify server with JWT authentication
 */
export async function startAppWithJwtAuth(useGlobalAuth: boolean = false) {
  const fastify = require('fastify')({ logger: true });

  try {
    // Setup CORS
    await fastify.register(require('@fastify/cors'), {
      origin: true,
      credentials: true
    });

    // Setup JSON schema validation
    fastify.setErrorHandler((error: any, request: any, reply: any) => {
      if (error.validation) {
        reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.validation
        });
        return;
      }

      if (error.statusCode) {
        reply.code(error.statusCode).send({
          error: error.name || 'ERROR',
          message: error.message
        });
        return;
      }

      reply.code(500).send({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred'
      });
    });

    // Setup authentication
    if (useGlobalAuth) {
      console.log('Setting up global JWT authentication...');
      await setupGlobalJwtAuth(fastify);
    } else {
      console.log('Setting up route-specific JWT authentication...');
      await setupJwtAuth(fastify);
    }

    // Health check endpoint
    fastify.get('/health', async (request: any, reply: any) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      };
    });

    // Start server
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port: Number(port), host });
    
    console.log(`\n🚀 Server running at http://${host}:${port}`);
    console.log('\n📚 Available endpoints:');
    console.log('  POST /auth/login - Login with username/password');
    console.log('  POST /auth/refresh - Refresh access token');
    console.log('  POST /auth/logout - Logout and revoke tokens');
    console.log('  GET  /auth/info - Get current user info (requires auth)');
    console.log('  GET  /public/info - Public endpoint (optional auth)');
    console.log('  GET  /user/profile - Get user profile (requires auth)');
    console.log('  PUT  /user/profile - Update user profile (requires auth)');
    console.log('  GET  /admin/users - Get all users (requires admin role)');
    console.log('  DELETE /admin/users/:userId - Delete user (requires delete permission)');
    console.log('  GET  /health - Health check');
    console.log('\n🔐 Test credentials:');
    console.log('  Admin: username=admin, password=admin123');
    console.log('  User:  username=user, password=user123');
    console.log('  Guest: username=guest, password=guest123');
    
  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

// Export for use in other files
export { ProtectedUserController };

// If this file is run directly, start the server
if (require.main === module) {
  const useGlobalAuth = process.argv.includes('--global');
  startAppWithJwtAuth(useGlobalAuth);
}