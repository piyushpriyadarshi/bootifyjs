/**
 * BootifyJS Authentication Examples
 * Demonstrates how to use the authentication system with different strategies
 */

import { FastifyInstance } from 'fastify';
import { container } from '../../core';
import { Logger } from '../../logging';
import {
  ApiKeyStrategy,
  AuthContext,
  AuthManager,
  JwtStrategy,
  RedisTokenStorage
} from '../index';
import { AuthMiddleware } from '../middleware/AuthMiddleware';


// Mock Redis client for example purposes
export class MockRedisClient {
  private store = new Map<string, { value: string; expiry?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<string | null> {
    const expiry = options?.EX ? Date.now() + (options.EX * 1000) : undefined;
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return 0;
    item.expiry = Date.now() + (seconds * 1000);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) return -2;
    if (!item.expiry) return -1;
    const remaining = Math.floor((item.expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }
}

// Example 1: Basic JWT Authentication Setup
export async function setupJwtAuth() {
  // Create token storage
  const tokenStorage = new RedisTokenStorage({
    client: new MockRedisClient(),
    keyPrefix: 'auth:',
    defaultTTL: 3600
  });

  // Create auth manager
  const authManager = new AuthManager({
    defaultStrategy: 'jwt',
    tokenStorage
  });

  // User provider function
  const userProvider = async (userId: string) => {
    return {
      id: userId,
      email: 'user@example.com',
      roles: ['user'],
      permissions: ['read', 'write']
    };
  };

  // Credential validator
  const credentialValidator = async (credentials: { email: string; password: string }) => {
    if (credentials.email === 'user@example.com' && credentials.password === 'password') {
      return {
        id: 'user-123',
        email: credentials.email,
        roles: ['user'],
        permissions: ['read', 'write']
      };
    }
    throw new Error('Invalid credentials');
  };

  // Configure JWT strategy
  const jwtStrategy = new JwtStrategy();
  await authManager.registerStrategy(jwtStrategy, {
    strategy: 'jwt',
    options: {
      accessTokenSecret: 'your-access-secret',
      refreshTokenSecret: 'your-refresh-secret',
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      tokenStorage,
      userProvider,
      credentialValidator
    }
  });

  // Create middleware
  const middleware = new AuthMiddleware(authManager);

  // Register routes
  // registerJWTAuthRoutes(app, authManager, middleware);

  return { authManager, middleware, tokenStorage };
}

// Example 2: JWT + API Key Authentication Setup
export async function setupMultiAuth(app: FastifyInstance) {
  // Create token storage
  const tokenStorage = new RedisTokenStorage({
    client: new MockRedisClient(),
    keyPrefix: 'auth:',
    defaultTTL: 7200
  });

  // Create auth manager
  const authManager = new AuthManager({
    defaultStrategy: 'jwt',
    tokenStorage
  });

  const userProvider = async (userId: string) => {
    return {
      id: userId,
      email: 'user@example.com',
      roles: ['user'],
      permissions: ['read', 'write']
    };
  };

  // Configure JWT strategy
  const jwtStrategy = new JwtStrategy();
  await authManager.registerStrategy(jwtStrategy, {
    strategy: 'jwt',
    options: {
      accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'jwt-secret',
      refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      accessTokenExpiry: '30m',
      refreshTokenExpiry: '30d',
      tokenStorage,
      userProvider,
      credentialValidator: async (credentials: any) => {
        console.log('JwtStrategy.credentialValidator', credentials)
        return await validateCredentials(credentials);
      }
    }
  });

  // Configure API Key strategy
  const apiKeyStrategy = new ApiKeyStrategy();
  await authManager.registerStrategy(apiKeyStrategy, {
    strategy: 'api-key',
    options: {
      tokenStorage,
      keyPrefix: 'ak_',
      defaultScopes: ['api:read'],
      maxKeysPerUser: 10,
      userProvider
    }
  });

  // Create middleware
  const middleware = new AuthMiddleware(authManager);

  // Register routes
  registerJWTAuthRoutes(app, authManager, middleware);
  registerApiKeyRoutes(app, authManager, middleware);
  registerProtectedRoutes(app, middleware);

  return { authManager, middleware, tokenStorage };
}

// Basic authentication routes
export function registerJWTAuthRoutes(
  app: FastifyInstance,
  authManager: AuthManager,
  middleware: AuthMiddleware
) {
  // Login endpoint
  app.post('/auth/login', async (request, reply) => {
    try {
      const { email, password } = request.body as any;

      const context: AuthContext = {
        strategy: 'jwt',
        request: request,
        headers: request.headers as Record<string, string>,
        type: 'login',
        body: request.body
      };

      const result = await authManager.authenticate(context, 'jwt');

      console.log('JWT Login result:', result);


      // const logger: Logger = container.resolve(LOGGER_TOKEN);
      const logger: Logger = container.resolve(Logger);
      logger.info('JWT Login result:', result);

      if (result.success && result.tokens) {
        reply.send({
          success: true,
          user: result.user,
          tokens: result.tokens
        });
      } else {
        reply.code(401).send({
          success: false,
          message: 'Authentication failed'
        });
      }
    } catch (error) {
      reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Token refresh endpoint
  app.post('/auth/refresh', async (request, reply) => {
    try {
      const { refreshToken } = request.body as any;

      const context: AuthContext = {
        type: 'refresh',
        strategy: 'jwt',
        request: request,
        headers: request.headers as Record<string, string>,
        body: request.body
      };

      const result = await authManager.refresh(refreshToken, context, 'jwt');

      if (result.success && result.tokens) {
        reply.send({
          success: true,
          tokens: result.tokens
        });
      } else {
        reply.code(401).send({
          success: false,
          message: 'Token refresh failed'
        });
      }
    } catch (error) {
      reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Logout endpoint
  app.post('/auth/logout', {
    preHandler: middleware.authenticate({ strategies: ['jwt', 'api-key'] })
  }, async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const context: AuthContext = {
          type: 'revoke',
          strategy: 'jwt',
          request: request,
          headers: request.headers as Record<string, string>
        };
        await authManager.revoke(token, context);
      }

      reply.send({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      reply.code(500).send({
        success: false,
        message: 'Logout failed'
      });
    }
  });
}

// API Key management routes
function registerApiKeyRoutes(
  app: FastifyInstance,
  authManager: AuthManager,
  middleware: AuthMiddleware
) {
  // Generate API key endpoint
  app.post('/auth/api-keys', {
    preHandler: middleware.authenticate({ strategies: ['jwt'] })
  }, async (request, reply) => {
    try {
      const { name, scopes } = request.body as any;
      const userId = request.user?.id;

      if (!userId) {
        return reply.code(401).send({ success: false, message: 'Unauthorized' });
      }

      const context: AuthContext = {
        type: 'generate',
        strategy: 'api-key',
        request: request,
        headers: request.headers as Record<string, string>,
        body: { name, scopes }
      };

      const result = await authManager.authenticate(context, 'api-key');

      if (result.success && result.tokens) {
        reply.send({
          success: true,
          apiKey: result.tokens.accessToken,
          name,
          scopes
        });
      } else {
        reply.code(400).send({
          success: false,
          message: 'Failed to generate API key'
        });
      }
    } catch (error) {
      reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });
}

// Protected routes examples
function registerProtectedRoutes(app: FastifyInstance, middleware: AuthMiddleware) {
  // Public route
  app.get('/public', async (request, reply) => {
    reply.send({ message: 'This is a public endpoint' });
  });

  // Protected route - any authenticated user
  app.get('/protected', {
    preHandler: middleware.authenticate({ strategies: ['jwt', 'api-key'] })
  }, async (request, reply) => {
    reply.send({
      message: 'This is a protected endpoint',
      user: request.user
    });
  });

  // JWT only route
  app.get('/jwt-only', {
    preHandler: middleware.authenticate({ strategies: ['jwt'] })
  }, async (request, reply) => {
    reply.send({
      message: 'JWT authenticated user',
      user: request.user
    });
  });

  // API key only route
  app.get('/api/data', {
    preHandler: middleware.authenticate({ strategies: ['api-key'] })
  }, async (request, reply) => {
    reply.send({
      message: 'API key authenticated request',
      user: request.user
    });
  });
}

// Helper function for credential validation
async function validateCredentials(credentials: { email: string; password: string }) {

  console.log('validateCredentials', credentials)
  // Example implementation - replace with your actual authentication logic
  if (credentials.email === 'admin@example.com' && credentials.password === 'admin123') {
    return {
      id: 'admin-1',
      email: credentials.email,
      roles: ['admin'],
      permissions: ['read', 'write', 'delete', 'admin']
    };
  }

  if (credentials.email === 'user@example.com' && credentials.password === 'user123') {
    return {
      id: 'user-1',
      email: credentials.email,
      roles: ['user'],
      permissions: ['read', 'write']
    };
  }

  throw new Error('Invalid credentials');
}

// Usage in your main application file:
/*
import Fastify from 'fastify';
import { setupJwtAuth, setupMultiAuth } from './auth/examples/basic-usage';

const app = Fastify({ logger: true });

// Option 1: JWT only
setupJwtAuth(app);

// Option 2: JWT + API Key
// setupMultiAuth(app);

app.listen({ port: 3000 }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}`);
});
*/