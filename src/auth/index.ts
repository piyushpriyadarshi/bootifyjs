/**
 * BootifyJS Authentication Module
 * Comprehensive authentication framework with multi-strategy support
 */

// Core types and interfaces
export * from './types';

// Authentication manager
export { AuthManager } from './AuthManager';

// Authentication strategies
export { JwtStrategy } from './strategies/JwtStrategy';
export { ApiKeyStrategy } from './strategies/ApiKeyStrategy';

// Token storage implementations
export { RedisTokenStorage } from './storage/RedisTokenStorage';

// Middleware
export { AuthMiddleware } from './middleware/AuthMiddleware';

// Re-export strategy configs for convenience
export type { JwtStrategyConfig } from './strategies/JwtStrategy';
export type { ApiKeyStrategyConfig } from './strategies/ApiKeyStrategy';
export type { RedisTokenStorageConfig } from './storage/RedisTokenStorage';

// Import classes for internal use
import { AuthManager } from './AuthManager';
import { JwtStrategy } from './strategies/JwtStrategy';
import { ApiKeyStrategy } from './strategies/ApiKeyStrategy';
import { AuthMiddleware } from './middleware/AuthMiddleware';

/**
 * Quick setup helper for common authentication scenarios
 */
export class AuthSetup {
  /**
   * Create a basic JWT + API Key authentication setup
   */
  static async createBasicAuth(config: {
    jwtConfig: {
      accessTokenSecret: string;
      refreshTokenSecret: string;
      accessTokenExpiry?: string | number;
      refreshTokenExpiry?: string | number;
      userProvider: (userId: string) => Promise<any>;
      credentialValidator?: (credentials: any) => Promise<any>;
    };
    apiKeyConfig?: {
      tokenStorage: any;
      userProvider: (userId: string) => Promise<any>;
      keyPrefix?: string;
      defaultScopes?: string[];
    };
    tokenStorage?: any;
  }) {
    const authManager = new AuthManager({
      defaultStrategy: 'jwt',
      tokenStorage: config.tokenStorage
    });

    // Register JWT strategy
    const jwtStrategy = new JwtStrategy();
    await authManager.registerStrategy(jwtStrategy, {
      strategy: 'jwt',
      options: {
        ...config.jwtConfig,
        tokenStorage: config.tokenStorage
      }
    });

    // Register API Key strategy if config provided
    if (config.apiKeyConfig) {
      const apiKeyStrategy = new ApiKeyStrategy();
      await authManager.registerStrategy(apiKeyStrategy, {
        strategy: 'api-key',
        options: config.apiKeyConfig
      });
    }

    return {
      authManager,
      middleware: new AuthMiddleware(authManager)
    };
  }

  /**
   * Create JWT-only authentication setup
   */
  static async createJwtAuth(config: {
    accessTokenSecret: string;
    refreshTokenSecret: string;
    accessTokenExpiry?: string | number;
    refreshTokenExpiry?: string | number;
    userProvider: (userId: string) => Promise<any>;
    credentialValidator?: (credentials: any) => Promise<any>;
    tokenStorage?: any;
  }) {
    const authManager = new AuthManager({
      defaultStrategy: 'jwt',
      tokenStorage: config.tokenStorage
    });

    const jwtStrategy = new JwtStrategy();
    await authManager.registerStrategy(jwtStrategy, {
      strategy: 'jwt',
      options: {
        ...config,
        tokenStorage: config.tokenStorage
      }
    });

    return {
      authManager,
      middleware: new AuthMiddleware(authManager)
    };
  }

  /**
   * Create API Key-only authentication setup
   */
  static async createApiKeyAuth(config: {
    tokenStorage: any;
    userProvider: (userId: string) => Promise<any>;
    keyPrefix?: string;
    defaultScopes?: string[];
    maxKeysPerUser?: number;
  }) {
    const authManager = new AuthManager({
      defaultStrategy: 'api-key',
      tokenStorage: config.tokenStorage
    });

    const apiKeyStrategy = new ApiKeyStrategy();
    await authManager.registerStrategy(apiKeyStrategy, {
      strategy: 'api-key',
      options: config
    });

    return {
      authManager,
      middleware: new AuthMiddleware(authManager)
    };
  }
}