import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthManager } from '../../auth/AuthManager';
import { JwtStrategy } from '../../auth/strategies/JwtStrategy';
import { RedisTokenStorage } from '../../auth/storage/RedisTokenStorage';
import { AuthContext, User } from '../../auth/types';

// Mock Redis client for demo
const mockRedisClient = {
  set: async (key: string, value: string, options?: any) => 'OK',
  get: async (key: string) => null,
  del: async (key: string) => 1,
  exists: async (key: string) => 0
};

// Initialize auth system
const tokenStorage = new RedisTokenStorage(mockRedisClient as any);
const jwtStrategy = new JwtStrategy();

const authManager = new AuthManager({
  defaultStrategy: 'jwt',
  tokenStorage
});

// Initialize auth system
let authInitialized = false;
async function initializeAuth() {
  if (!authInitialized) {
    await authManager.registerStrategy(jwtStrategy, {
      strategy: 'jwt',
      options: {
        secret: process.env.JWT_SECRET || 'your-secret-key',
        accessTokenExpiry: '15m',
        refreshTokenExpiry: '7d',
        issuer: 'bootifyjs-auth',
        audience: 'bootifyjs-app',
        isDefault: true
      }
    });
    authInitialized = true;
  }
}

/**
 * Global JWT Authentication Middleware
 * Validates JWT tokens from Authorization header
 * Adds user information to request context
 */
export const jwtAuthMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  await initializeAuth();
  
  // Extract token from Authorization header
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header. Expected format: Bearer <token>'
    });
    return;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    // Create auth context
    const context: AuthContext = {
      type: 'validate',
      strategy: 'jwt',
      request,
      headers: request.headers as Record<string, string>,
      body: request.body,
      query: request.query as Record<string, string>
    };
    
    // Validate token using auth manager
    const validationResult = await authManager.validate(token, context, 'jwt');
    
    if (!validationResult.success || !validationResult.user) {
      reply.code(401).send({
        error: 'INVALID_TOKEN',
        message: validationResult.error || 'Token validation failed'
      });
      return;
    }
    
    // Add user information to request
    (request as any).user = validationResult.user;
    (request as any).authStrategy = 'jwt';
    (request as any).isAuthenticated = true;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
    reply.code(401).send({
      error: 'AUTH_ERROR',
      message: errorMessage
    });
    return;
  }
};

/**
 * Optional Authentication Middleware
 * Similar to jwtAuthMiddleware but doesn't reject requests without tokens
 * Useful for endpoints that work with or without authentication
 */
export const optionalJwtAuthMiddleware = async (request: FastifyRequest, reply: FastifyReply) => {
  await initializeAuth();
  
  // Extract token from Authorization header
  const authHeader = request.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without authentication
    (request as any).isAuthenticated = false;
    return;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    // Create auth context
    const context: AuthContext = {
      type: 'validate',
      strategy: 'jwt',
      request,
      headers: request.headers as Record<string, string>,
      body: request.body,
      query: request.query as Record<string, string>
    };
    
    // Validate token using auth manager
    const validationResult = await authManager.validate(token, context, 'jwt');
    
    if (validationResult.success && validationResult.user) {
      // Add user information to request
      (request as any).user = validationResult.user;
      (request as any).authStrategy = 'jwt';
      (request as any).isAuthenticated = true;
    } else {
      // Invalid token, but continue without authentication
      (request as any).isAuthenticated = false;
    }
    
  } catch (error) {
    // Error occurred, but continue without authentication
    (request as any).isAuthenticated = false;
  }
};

/**
 * Role-based Authorization Middleware Factory
 * Creates middleware that checks if authenticated user has required roles
 */
export const requireRoles = (requiredRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User | undefined;
    const isAuthenticated = (request as any).isAuthenticated;
    
    if (!isAuthenticated || !user) {
      reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
      return;
    }
    
    const hasRequiredRole = requiredRoles.some(role => user.roles.includes(role));
    
    if (!hasRequiredRole) {
      reply.code(403).send({
        error: 'FORBIDDEN',
        message: `Access denied. Required roles: ${requiredRoles.join(', ')}`
      });
      return;
    }
  };
};

/**
 * Permission-based Authorization Middleware Factory
 * Creates middleware that checks if authenticated user has required permissions
 */
export const requirePermissions = (requiredPermissions: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as User | undefined;
    const isAuthenticated = (request as any).isAuthenticated;
    
    if (!isAuthenticated || !user) {
      reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
      return;
    }
    
    const hasRequiredPermission = requiredPermissions.some(permission => 
      user.permissions.includes(permission)
    );
    
    if (!hasRequiredPermission) {
      reply.code(403).send({
        error: 'FORBIDDEN',
        message: `Access denied. Required permissions: ${requiredPermissions.join(', ')}`
      });
      return;
    }
  };
};

// Export auth manager for use in other parts of the application
export { authManager };