/**
 * Unified Authentication Middleware Factory
 * Provides Fastify middleware for multi-strategy authentication
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { RequestContextService } from '../../core';
import { AuthManager } from '../AuthManager';
import {
  AuthContext,
  AuthError,
  AuthMiddlewareOptions,
  ForbiddenError,
  UnauthorizedError,
  User
} from '../types';

// Extend Fastify Request interface to include auth data
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      username?: string;
      email?: string;
      roles: string[];
      permissions: string[];
    } | null;
    authStrategy?: string;
    authMetadata?: Record<string, any>;
    isAuthenticated?: boolean;
    auth?: {
      strategy: string;
      token: string;
    };
  }
}

export class AuthMiddleware {
  constructor(private authManager: AuthManager) { }

  /**
   * Create authentication middleware with flexible options
   */
  authenticate(options: AuthMiddlewareOptions = { strategies: [] }) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        // Skip authentication for specified paths
        if (options.skipPaths && this.shouldSkipPath(req.url || '', options.skipPaths)) {
          return;
        }

        // Extract authentication context from request
        const context = this.extractAuthContext(req, options.strategies);

        // Try to authenticate using available strategies
        const authResult = await this.tryAuthentication(context, options.strategies);

        if (authResult.success && authResult.user) {
          // Set user data on request
          req.user = {
            id: authResult.user.id,
            username: authResult.user.username,
            email: authResult.user.email,
            roles: authResult.user.roles || [],
            permissions: authResult.user.permissions || []
          };
          req.authStrategy = context.strategy;
          req.authMetadata = authResult.metadata;
          req.isAuthenticated = true;

          // Add context to request - use existing context from context middleware
          const contextService = new RequestContextService();
          contextService.set('user', { id: authResult.user.id, username: authResult.user.username })

          // Check role-based authorization if specified
          if (options.roles && !this.hasRequiredRoles(authResult.user, options.roles)) {
            throw new ForbiddenError(`Required roles: ${options.roles.join(', ')}`);
          }

          // Check permission-based authorization if specified
          if (options.permissions && !this.hasRequiredPermissions(authResult.user, options.permissions)) {
            throw new ForbiddenError(`Required permissions: ${options.permissions.join(', ')}`);
          }

          return;
        }

        // Handle authentication failure
        if (options.required !== false) {
          throw new UnauthorizedError(authResult.error || 'Authentication required');
        }

        // Authentication not required, continue without user
        req.isAuthenticated = false;

        //add context also to the request



      } catch (error) {
        this.handleAuthError(error, req, reply, options.errorHandler);
      }
    };
  }

  /**
   * Create middleware that requires authentication
   */
  requireAuth(strategies: string[] = [], roles?: string[], permissions?: string[]) {
    return this.authenticate({
      strategies,
      required: true,
      roles,
      permissions
    });
  }

  /**
   * Create middleware for optional authentication
   */
  optionalAuth(strategies: string[] = []) {
    return this.authenticate({
      strategies,
      required: false
    });
  }

  /**
   * Create role-based authorization middleware
   */
  requireRoles(roles: string[], strategies: string[] = []) {
    return this.authenticate({
      strategies,
      required: true,
      roles
    });
  }

  /**
   * Create permission-based authorization middleware
   */
  requirePermissions(permissions: string[], strategies: string[] = []) {
    return this.authenticate({
      strategies,
      required: true,
      permissions
    });
  }

  /**
   * Create middleware for specific strategy
   */
  requireStrategy(strategy: string, roles?: string[], permissions?: string[]) {
    return this.authenticate({
      strategies: [strategy],
      required: true,
      roles,
      permissions
    });
  }

  /**
   * Token refresh middleware
   */
  refreshToken(strategy?: string) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const refreshToken = this.extractRefreshToken(req);

        if (!refreshToken) {
          throw new UnauthorizedError('Refresh token required');
        }

        const context = this.extractAuthContext(req, strategy ? [strategy] : []);
        const refreshResult = await this.authManager.refresh(refreshToken, context, strategy);

        if (refreshResult.success && refreshResult.tokens) {
          // Return new tokens
          return reply.send({
            success: true,
            tokens: refreshResult.tokens,
            user: refreshResult.user,
            metadata: refreshResult.metadata
          });
        } else {
          throw new UnauthorizedError(refreshResult.error || 'Token refresh failed');
        }
      } catch (error) {
        this.handleAuthError(error, req, reply);
      }
    };
  }

  /**
   * Logout middleware
   */
  logout(strategy?: string) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const token = this.extractToken(req);

        if (token) {
          const context = this.extractAuthContext(req, strategy ? [strategy] : []);
          await this.authManager.revoke(token, context, strategy);
        }

        // Clear request auth data
        req.user = undefined;
        req.authStrategy = undefined;
        req.authMetadata = undefined;
        req.isAuthenticated = false;

        return reply.send({ success: true, message: 'Logged out successfully' });
      } catch (error) {
        this.handleAuthError(error, req, reply);
      }
    };
  }

  /**
   * Extract authentication context from request
   */
  private extractAuthContext(req: FastifyRequest, strategies: string[]): AuthContext {
    return {
      type: 'validate',
      strategy: this.detectStrategy(req, strategies),
      request: req,
      headers: req.headers as Record<string, string>,
      body: req.body,
      query: req.query as Record<string, string>
    };
  }

  /**
   * Try authentication with multiple strategies
   */
  private async tryAuthentication(context: AuthContext, strategies: string[]) {
    // If specific strategies are provided, try them in order
    if (strategies.length > 0) {
      for (const strategy of strategies) {
        const token = this.extractTokenForStrategy(context.request, strategy);
        if (token) {
          const result = await this.authManager.validate(token, {
            ...context,
            strategy
          }, strategy);

          if (result.success) {
            return result;
          }
        }
      }
    }

    // Try auto-detection
    const token = this.extractToken(context.request);
    if (token) {
      return await this.authManager.validate(token, context);
    }

    return { success: false, error: 'No valid authentication found' };
  }

  /**
   * Extract token from request based on strategy
   */
  private extractTokenForStrategy(req: FastifyRequest, strategy: string): string | null {
    switch (strategy) {
      case 'jwt':
        return this.extractBearerToken(req);
      case 'api-key':
        return this.extractApiKey(req);
      default:
        return this.extractToken(req);
    }
  }

  /**
   * Extract general token from request
   */
  private extractToken(req: FastifyRequest): string | null {
    // Try Bearer token first
    const bearerToken = this.extractBearerToken(req);
    if (bearerToken) return bearerToken;

    // Try API key
    const apiKey = this.extractApiKey(req);
    if (apiKey) return apiKey;

    return null;
  }

  /**
   * Extract Bearer token from Authorization header
   */
  private extractBearerToken(req: FastifyRequest): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  /**
   * Extract API key from headers
   */
  private extractApiKey(req: FastifyRequest): string | null {
    // Check various API key header formats
    return req.headers['x-api-key'] as string ||
      req.headers['api-key'] as string ||
      req.headers['apikey'] as string ||
      null;
  }

  /**
   * Extract refresh token from request
   */
  private extractRefreshToken(req: FastifyRequest): string | null {
    // Check body first
    const body = req.body as { refreshToken?: string };
    if (body && body.refreshToken) {
      return body.refreshToken;
    }

    // Check headers
    return req.headers['x-refresh-token'] as string || null;
  }

  /**
   * Detect strategy based on request
   */
  private detectStrategy(req: FastifyRequest, preferredStrategies: string[]): string {
    // Use first preferred strategy if available
    if (preferredStrategies.length > 0) {
      return preferredStrategies[0];
    }

    // Auto-detect based on headers
    if (req.headers['x-api-key'] || req.headers['api-key']) {
      return 'api-key';
    }

    if (req.headers.authorization?.startsWith('Bearer ')) {
      return 'jwt';
    }

    return 'jwt'; // Default fallback
  }

  /**
   * Check if user has required roles
   */
  private hasRequiredRoles(user: User, requiredRoles: string[]): boolean {
    return requiredRoles.every(role => user.roles.includes(role));
  }

  /**
   * Check if user has required permissions
   */
  private hasRequiredPermissions(user: User, requiredPermissions: string[]): boolean {
    return requiredPermissions.every(permission =>
      user.permissions.some(userPerm =>
        userPerm === permission || userPerm.startsWith(permission + ':')
      )
    );
  }

  /**
   * Check if path should be skipped
   */
  private shouldSkipPath(path: string, skipPaths: string[]): boolean {
    return skipPaths.some(skipPath => {
      if (skipPath.includes('*')) {
        const regex = new RegExp(skipPath.replace(/\*/g, '.*'));
        return regex.test(path);
      }
      return path === skipPath || path.startsWith(skipPath);
    });
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(
    error: any,
    req: FastifyRequest,
    reply: FastifyReply,
    customErrorHandler?: (error: Error, req: any, reply: any) => void
  ) {
    // Use custom error handler if provided
    if (customErrorHandler) {
      return customErrorHandler(error, req, reply);
    }

    // Default error handling
    if (error instanceof AuthError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        metadata: error.metadata
      });
    }

    // Generic error
    const errorMessage = error instanceof Error ? error.message : String(error);
    return reply.status(500).send({
      success: false,
      error: 'Internal authentication error',
      details: errorMessage
    });
  }
}