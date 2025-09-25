/**
 * AuthManager - Central orchestrator for authentication strategies
 * Manages strategy registration, selection, and execution
 */

import {
  AuthConfig,
  AuthContext,
  AuthError,
  AuthResult,
  AuthStrategy,
  AuthStrategyType,
  TokenStorage
} from './types';

export class AuthManager {
  private strategies: Map<string, AuthStrategy> = new Map();
  private defaultStrategy?: string;
  private tokenStorage?: TokenStorage;

  constructor(private config: {
    defaultStrategy?: string;
    tokenStorage?: TokenStorage;
  } = {}) {
    this.defaultStrategy = config.defaultStrategy;
    this.tokenStorage = config.tokenStorage;
  }

  /**
   * Register an authentication strategy
   */
  async registerStrategy(strategy: AuthStrategy, config: AuthConfig): Promise<void> {
    try {
      await strategy.initialize(config);
      this.strategies.set(strategy.name, strategy);

      // Set as default if it's the first strategy or explicitly configured
      if (!this.defaultStrategy || config.options?.isDefault) {
        this.defaultStrategy = strategy.name;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new AuthError(
        `Failed to register strategy '${strategy.name}': ${errorMessage}`,
        'STRATEGY_REGISTRATION_FAILED',
        500
      );
    }
  }

  /**
   * Get a registered strategy by name
   */
  getStrategy(name: string): AuthStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Get all registered strategy names
   */
  getRegisteredStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Authenticate using a specific strategy or auto-detect
   */
  async authenticate(context: AuthContext, strategyName?: string): Promise<AuthResult> {
    const strategy = this.selectStrategy(context, strategyName);

    if (!strategy) {
      return {
        success: false,
        error: 'No suitable authentication strategy found'
      };
    }

    console.log('AuthManager.authenticate', strategy.name, context)
    try {
      const result = await strategy.authenticate(context);

      // Store session data if authentication successful and token storage available
      if (result.success && result.user && this.tokenStorage) {
        await this.storeSessionData(result, strategy.name);
      }

      return result;
    } catch (error) {

      console.error(`Authentication failed for strategy '${strategy.name}':`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof AuthError ? error.code : 'UNKNOWN_ERROR';
      return {
        success: false,
        error: errorMessage || 'Authentication failed',
        metadata: { strategy: strategy.name, error: errorCode }
      };
    }
  }

  /**
   * Validate a token using a specific strategy or auto-detect
   */
  async validate(token: string, context: AuthContext, strategyName?: string): Promise<AuthResult> {
    const strategy = this.selectStrategy(context, strategyName);

    if (!strategy) {
      return {
        success: false,
        error: 'No suitable validation strategy found'
      };
    }

    try {
      return await strategy.validate(token, context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof AuthError ? error.code : 'UNKNOWN_ERROR';
      return {
        success: false,
        error: errorMessage || 'Token validation failed',
        metadata: { strategy: strategy.name, error: errorCode }
      };
    }
  }

  /**
   * Refresh an access token
   */
  async refresh(refreshToken: string, context: AuthContext, strategyName?: string): Promise<AuthResult> {
    const strategy = this.selectStrategy(context, strategyName);

    if (!strategy || !strategy.refresh) {
      return {
        success: false,
        error: 'Token refresh not supported by strategy'
      };
    }

    try {
      const result = await strategy.refresh(refreshToken, context);

      // Update session data if refresh successful
      if (result.success && result.user && this.tokenStorage) {
        await this.storeSessionData(result, strategy.name);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = error instanceof AuthError ? error.code : 'UNKNOWN_ERROR';
      return {
        success: false,
        error: errorMessage || 'Token refresh failed',
        metadata: { strategy: strategy.name, error: errorCode }
      };
    }
  }

  /**
   * Revoke/logout a user's session
   */
  async revoke(token: string, context: AuthContext, strategyName?: string): Promise<boolean> {
    const strategy = this.selectStrategy(context, strategyName);

    if (!strategy) {
      return false;
    }

    try {
      const result = strategy.revoke ? await strategy.revoke(token, context) : true;

      // Clean up session data
      if (result && this.tokenStorage) {
        await this.cleanupSessionData(token);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Failed to revoke token: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Select appropriate strategy based on context and preference
   */
  private selectStrategy(context: AuthContext, preferredStrategy?: string): AuthStrategy | undefined {
    // Use explicitly specified strategy
    if (preferredStrategy && this.strategies.has(preferredStrategy)) {
      return this.strategies.get(preferredStrategy);
    }

    // Use strategy from context
    if (context.strategy && this.strategies.has(context.strategy)) {
      return this.strategies.get(context.strategy);
    }

    // Auto-detect based on request headers/content
    const detectedStrategy = this.detectStrategy(context);
    if (detectedStrategy && this.strategies.has(detectedStrategy)) {
      return this.strategies.get(detectedStrategy);
    }

    // Fall back to default strategy
    if (this.defaultStrategy && this.strategies.has(this.defaultStrategy)) {
      return this.strategies.get(this.defaultStrategy);
    }

    return undefined;
  }

  /**
   * Auto-detect strategy based on request context
   */
  private detectStrategy(context: AuthContext): string | undefined {
    const { headers } = context;

    // Check for API key in headers
    if (headers['x-api-key'] || headers['api-key']) {
      return AuthStrategyType.API_KEY;
    }

    // Check for JWT Bearer token
    const authHeader = headers['authorization'] || headers['Authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      return AuthStrategyType.JWT;
    }

    // Default detection logic can be extended here
    return undefined;
  }

  /**
   * Store session data in token storage
   */
  private async storeSessionData(result: AuthResult, strategyName: string): Promise<void> {
    if (!this.tokenStorage || !result.user || !result.tokens) {
      return;
    }

    const sessionKey = `session:${result.user.id}:${Date.now()}`;
    const sessionData = {
      userId: result.user.id,
      strategy: strategyName,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + (result.tokens.expiresIn * 1000)),
      metadata: result.metadata
    };

    await this.tokenStorage.store(sessionKey, sessionData, result.tokens.expiresIn);
  }

  /**
   * Clean up session data from token storage
   */
  private async cleanupSessionData(token: string): Promise<void> {
    if (!this.tokenStorage) {
      return;
    }

    // This is a simplified cleanup - in practice, you'd need to
    // decode the token to get user ID and find associated sessions
    try {
      // Implementation would depend on your token structure
      // For now, we'll just log the cleanup attempt
      console.log('Session cleanup requested for token');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to cleanup session data:', errorMessage);
    }
  }

  /**
   * Get authentication statistics
   */
  getStats(): {
    registeredStrategies: number;
    strategyNames: string[];
    defaultStrategy?: string;
  } {
    return {
      registeredStrategies: this.strategies.size,
      strategyNames: Array.from(this.strategies.keys()),
      defaultStrategy: this.defaultStrategy
    };
  }
}