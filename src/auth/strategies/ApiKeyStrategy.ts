/**
 * API Key Authentication Strategy with Scoped Permissions
 * Implements secure API key-based authentication with refresh capabilities
 */

import crypto from 'crypto';
import {
  AuthStrategy,
  AuthResult,
  AuthContext,
  AuthConfig,
  User,
  TokenPair,
  TokenStorage,
  ApiKeyData,
  AuthStrategyType,
  AuthError,
  InvalidTokenError,
  UnauthorizedError
} from '../types';

export interface ApiKeyStrategyConfig {
  keyPrefix?: string; // e.g., 'ak_' for API keys
  keyLength?: number; // Length of the generated key
  hashAlgorithm?: string; // Algorithm for hashing keys
  tokenStorage: TokenStorage; // Required for API key storage
  userProvider: (userId: string) => Promise<User | null>;
  keyValidator?: (keyId: string, hashedKey: string) => Promise<ApiKeyData | null>;
  defaultScopes?: string[];
  maxKeysPerUser?: number;
  keyExpiry?: number; // Optional expiry in seconds
}

export class ApiKeyStrategy implements AuthStrategy {
  readonly name = 'api-key';
  readonly type = AuthStrategyType.API_KEY;
  
  private config!: ApiKeyStrategyConfig;
  private tokenStorage!: TokenStorage;

  async initialize(config: AuthConfig): Promise<void> {
    this.config = config.options as ApiKeyStrategyConfig;
    this.tokenStorage = this.config.tokenStorage;
    
    // Validate required configuration
    if (!this.tokenStorage) {
      throw new AuthError(
        'API Key strategy requires tokenStorage',
        'INVALID_CONFIG',
        500
      );
    }
    
    if (!this.config.userProvider) {
      throw new AuthError(
        'API Key strategy requires a userProvider function',
        'INVALID_CONFIG',
        500
      );
    }

    // Set defaults
    this.config.keyPrefix = this.config.keyPrefix || 'ak_';
    this.config.keyLength = this.config.keyLength || 32;
    this.config.hashAlgorithm = this.config.hashAlgorithm || 'sha256';
    this.config.defaultScopes = this.config.defaultScopes || ['read'];
    this.config.maxKeysPerUser = this.config.maxKeysPerUser || 10;
  }

  async authenticate(context: AuthContext): Promise<AuthResult> {
    try {
      // For API key authentication, we expect the key creation request
      const { userId, name, scopes, expiresIn } = context.body || {};
      
      if (!userId || !name) {
        return {
          success: false,
          error: 'userId and name are required for API key creation'
        };
      }

      // Verify user exists
      const user = await this.config.userProvider(userId);
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // Check if user has reached max keys limit
      const userKeys = await this.getUserApiKeys(userId);
      if (userKeys.length >= this.config.maxKeysPerUser!) {
        return {
          success: false,
          error: `Maximum API keys limit (${this.config.maxKeysPerUser}) reached`
        };
      }

      // Generate new API key
      const apiKey = await this.generateApiKey(userId, name, scopes, expiresIn);
      
      return {
        success: true,
        user,
        tokens: {
          accessToken: apiKey.key,
          refreshToken: apiKey.refreshKey,
          expiresIn: apiKey.expiresIn || 0,
          tokenType: 'API-Key'
        },
        metadata: {
          keyId: apiKey.keyId,
          scopes: apiKey.scopes,
          createdAt: apiKey.createdAt
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `API key creation failed: ${errorMessage}`
      };
    }
  }

  async validate(apiKey: string, context: AuthContext): Promise<AuthResult> {
    try {
      // Parse API key to extract key ID and secret
      const { keyId, secret } = this.parseApiKey(apiKey);
      
      if (!keyId || !secret) {
        throw new InvalidTokenError('Invalid API key format');
      }

      // Retrieve API key data from storage
      const keyData = await this.tokenStorage.get(`apikey:${keyId}`);
      if (!keyData) {
        throw new InvalidTokenError('API key not found');
      }

      // Verify the key is active
      if (!keyData.isActive) {
        throw new UnauthorizedError('API key is disabled');
      }

      // Check expiry
      if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
        throw new InvalidTokenError('API key has expired');
      }

      // Verify the secret
      const hashedSecret = this.hashSecret(secret);
      if (hashedSecret !== keyData.hashedSecret) {
        throw new InvalidTokenError('Invalid API key');
      }

      // Update last used timestamp
      keyData.lastUsedAt = new Date();
      await this.tokenStorage.store(`apikey:${keyId}`, keyData);

      // Fetch user data
      const user = await this.config.userProvider(keyData.userId);
      if (!user) {
        throw new InvalidTokenError('User not found');
      }

      // Filter user permissions based on API key scopes
      const scopedUser = this.applyScopeFiltering(user, keyData.scopes);

      return {
        success: true,
        user: scopedUser,
        metadata: {
          keyId: keyData.keyId,
          scopes: keyData.scopes,
          lastUsedAt: keyData.lastUsedAt,
          createdAt: keyData.createdAt
        }
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          success: false,
          error: error.message,
          metadata: { code: error.code }
        };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `API key validation failed: ${errorMessage}`
      };
    }
  }

  async refresh(refreshKey: string, context: AuthContext): Promise<AuthResult> {
    try {
      // Parse refresh key to extract key ID
      const { keyId } = this.parseApiKey(refreshKey);
      
      if (!keyId) {
        throw new InvalidTokenError('Invalid refresh key format');
      }

      // Retrieve API key data
      const keyData = await this.tokenStorage.get(`apikey:${keyId}`);
      if (!keyData) {
        throw new InvalidTokenError('API key not found');
      }

      // Verify refresh key
      const hashedRefreshKey = this.hashSecret(refreshKey.split('.')[1]);
      if (hashedRefreshKey !== keyData.hashedRefreshKey) {
        throw new InvalidTokenError('Invalid refresh key');
      }

      // Generate new API key pair
      const newApiKey = await this.rotateApiKey(keyData);
      
      // Fetch user data
      const user = await this.config.userProvider(keyData.userId);
      if (!user) {
        throw new InvalidTokenError('User not found');
      }

      return {
        success: true,
        user,
        tokens: {
          accessToken: newApiKey.key,
          refreshToken: newApiKey.refreshKey,
          expiresIn: newApiKey.expiresIn || 0,
          tokenType: 'API-Key'
        },
        metadata: {
          keyId: newApiKey.keyId,
          rotated: true,
          oldKeyId: keyData.keyId
        }
      };
    } catch (error) {
      if (error instanceof AuthError) {
        return {
          success: false,
          error: error.message,
          metadata: { code: error.code }
        };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `API key refresh failed: ${errorMessage}`
      };
    }
  }

  async revoke(apiKey: string, context: AuthContext): Promise<boolean> {
    try {
      const { keyId } = this.parseApiKey(apiKey);
      
      if (!keyId) {
        return false;
      }

      // Mark API key as inactive
      const keyData = await this.tokenStorage.get(`apikey:${keyId}`);
      if (keyData) {
        keyData.isActive = false;
        keyData.revokedAt = new Date();
        await this.tokenStorage.store(`apikey:${keyId}`, keyData);
      }

      return true;
    } catch (error) {
      console.error('Failed to revoke API key:', error);
      return false;
    }
  }

  /**
   * Generate a new API key with refresh capability
   */
  private async generateApiKey(
    userId: string,
    name: string,
    scopes?: string[],
    expiresIn?: number
  ): Promise<{
    keyId: string;
    key: string;
    refreshKey: string;
    scopes: string[];
    expiresIn?: number;
    createdAt: Date;
  }> {
    const keyId = crypto.randomUUID();
    const secret = crypto.randomBytes(this.config.keyLength!).toString('hex');
    const refreshSecret = crypto.randomBytes(this.config.keyLength!).toString('hex');
    
    const key = `${this.config.keyPrefix}${keyId}.${secret}`;
    const refreshKey = `${this.config.keyPrefix}refresh_${keyId}.${refreshSecret}`;
    
    const hashedSecret = this.hashSecret(secret);
    const hashedRefreshKey = this.hashSecret(refreshSecret);
    
    const finalScopes = scopes || this.config.defaultScopes!;
    const createdAt = new Date();
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;

    const apiKeyData: ApiKeyData = {
      keyId,
      userId,
      name,
      scopes: finalScopes,
      isActive: true,
      createdAt,
      expiresAt,
      hashedSecret,
      hashedRefreshKey
    } as ApiKeyData & { hashedSecret: string; hashedRefreshKey: string };

    // Store API key data
    const ttl = expiresIn || undefined;
    await this.tokenStorage.store(`apikey:${keyId}`, apiKeyData, ttl);
    
    // Add to user's key list
    await this.addToUserKeyList(userId, keyId);

    return {
      keyId,
      key,
      refreshKey,
      scopes: finalScopes,
      expiresIn,
      createdAt
    };
  }

  /**
   * Rotate an existing API key
   */
  private async rotateApiKey(oldKeyData: ApiKeyData): Promise<{
    keyId: string;
    key: string;
    refreshKey: string;
    expiresIn?: number;
  }> {
    // Generate new secrets
    const newSecret = crypto.randomBytes(this.config.keyLength!).toString('hex');
    const newRefreshSecret = crypto.randomBytes(this.config.keyLength!).toString('hex');
    
    const newKey = `${this.config.keyPrefix}${oldKeyData.keyId}.${newSecret}`;
    const newRefreshKey = `${this.config.keyPrefix}refresh_${oldKeyData.keyId}.${newRefreshSecret}`;
    
    // Update stored data
    const updatedKeyData = {
      ...oldKeyData,
      hashedSecret: this.hashSecret(newSecret),
      hashedRefreshKey: this.hashSecret(newRefreshSecret),
      lastRotatedAt: new Date()
    };

    await this.tokenStorage.store(`apikey:${oldKeyData.keyId}`, updatedKeyData);

    const expiresIn = oldKeyData.expiresAt 
      ? Math.floor((new Date(oldKeyData.expiresAt).getTime() - Date.now()) / 1000)
      : undefined;

    return {
      keyId: oldKeyData.keyId,
      key: newKey,
      refreshKey: newRefreshKey,
      expiresIn
    };
  }

  /**
   * Parse API key to extract components
   */
  private parseApiKey(apiKey: string): { keyId?: string; secret?: string } {
    if (!apiKey.startsWith(this.config.keyPrefix!)) {
      return {};
    }

    const withoutPrefix = apiKey.substring(this.config.keyPrefix!.length);
    const parts = withoutPrefix.split('.');
    
    if (parts.length !== 2) {
      return {};
    }

    return {
      keyId: parts[0].replace('refresh_', ''),
      secret: parts[1]
    };
  }

  /**
   * Hash a secret using the configured algorithm
   */
  private hashSecret(secret: string): string {
    return crypto
      .createHash(this.config.hashAlgorithm!)
      .update(secret)
      .digest('hex');
  }

  /**
   * Apply scope filtering to user permissions
   */
  private applyScopeFiltering(user: User, scopes: string[]): User {
    // Filter permissions based on scopes
    const filteredPermissions = user.permissions.filter(permission => 
      scopes.some(scope => permission.startsWith(scope))
    );

    return {
      ...user,
      permissions: filteredPermissions,
      metadata: {
        ...user.metadata,
        apiKeyScopes: scopes
      }
    };
  }

  /**
   * Get all API keys for a user
   */
  private async getUserApiKeys(userId: string): Promise<string[]> {
    try {
      const userKeys = await this.tokenStorage.get(`user_keys:${userId}`);
      return userKeys || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Add API key to user's key list
   */
  private async addToUserKeyList(userId: string, keyId: string): Promise<void> {
    const userKeys = await this.getUserApiKeys(userId);
    userKeys.push(keyId);
    await this.tokenStorage.store(`user_keys:${userId}`, userKeys);
  }

  /**
   * List all API keys for a user
   */
  async listUserApiKeys(userId: string): Promise<ApiKeyData[]> {
    const keyIds = await this.getUserApiKeys(userId);
    const keys: ApiKeyData[] = [];

    for (const keyId of keyIds) {
      try {
        const keyData = await this.tokenStorage.get(`apikey:${keyId}`);
        if (keyData && keyData.isActive) {
          // Remove sensitive data
          const { hashedSecret, hashedRefreshKey, ...safeKeyData } = keyData;
          keys.push(safeKeyData);
        }
      } catch (error) {
        console.error(`Failed to fetch API key ${keyId}:`, error);
      }
    }

    return keys;
  }

  /**
   * Delete an API key permanently
   */
  async deleteApiKey(keyId: string, userId: string): Promise<boolean> {
    try {
      // Remove from storage
      await this.tokenStorage.delete(`apikey:${keyId}`);
      
      // Remove from user's key list
      const userKeys = await this.getUserApiKeys(userId);
      const updatedKeys = userKeys.filter(id => id !== keyId);
      await this.tokenStorage.store(`user_keys:${userId}`, updatedKeys);
      
      return true;
    } catch (error) {
      console.error('Failed to delete API key:', error);
      return false;
    }
  }
}