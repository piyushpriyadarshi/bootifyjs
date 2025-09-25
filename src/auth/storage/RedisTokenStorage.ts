/**
 * Redis-based Token Storage Implementation
 * Provides persistent, scalable storage for authentication tokens and sessions
 */

import { TokenStorage } from '../types';

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number; PX?: number }): Promise<string | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

export interface RedisTokenStorageConfig {
  client: RedisClient;
  keyPrefix?: string;
  defaultTTL?: number; // Default TTL in seconds
  serializer?: {
    serialize: (value: any) => string;
    deserialize: (value: string) => any;
  };
}

export class RedisTokenStorage implements TokenStorage {
  private client: RedisClient;
  private keyPrefix: string;
  private defaultTTL?: number;
  private serializer: {
    serialize: (value: any) => string;
    deserialize: (value: string) => any;
  };

  constructor(config: RedisTokenStorageConfig) {
    this.client = config.client;
    this.keyPrefix = config.keyPrefix || 'auth:';
    this.defaultTTL = config.defaultTTL;
    this.serializer = config.serializer || {
      serialize: (value: any) => JSON.stringify(value),
      deserialize: (value: string) => JSON.parse(value)
    };
  }

  /**
   * Store a value with optional TTL
   */
  async store(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      const serializedValue = this.serializer.serialize(value);
      
      const effectiveTTL = ttl || this.defaultTTL;
      
      if (effectiveTTL) {
        await this.client.set(fullKey, serializedValue, { EX: effectiveTTL });
      } else {
        await this.client.set(fullKey, serializedValue);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to store value in Redis: ${errorMessage}`);
    }
  }

  /**
   * Retrieve a value by key
   */
  async get(key: string): Promise<any> {
    try {
      const fullKey = this.getFullKey(key);
      const value = await this.client.get(fullKey);
      
      if (value === null) {
        return null;
      }
      
      return this.serializer.deserialize(value);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get value from Redis: ${errorMessage}`);
    }
  }

  /**
   * Delete a value by key
   */
  async delete(key: string): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      await this.client.del(fullKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete value from Redis: ${errorMessage}`);
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.client.exists(fullKey);
      return result > 0;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to check key existence in Redis: ${errorMessage}`);
    }
  }

  /**
   * Set TTL for an existing key
   */
  async setTTL(key: string, ttl: number): Promise<void> {
    try {
      const fullKey = this.getFullKey(key);
      await this.client.expire(fullKey, ttl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to set TTL in Redis: ${errorMessage}`);
    }
  }

  /**
   * Get TTL for a key
   */
  async getTTL(key: string): Promise<number> {
    try {
      const fullKey = this.getFullKey(key);
      return await this.client.ttl(fullKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get TTL from Redis: ${errorMessage}`);
    }
  }

  /**
   * Store multiple values in a batch operation
   */
  async storeBatch(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    try {
      // Redis doesn't have a native batch operation for SET with different TTLs
      // So we'll execute them sequentially for now
      // In a production environment, you might want to use Redis pipelines
      const promises = entries.map(entry => 
        this.store(entry.key, entry.value, entry.ttl)
      );
      
      await Promise.all(promises);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to store batch in Redis: ${errorMessage}`);
    }
  }

  /**
   * Get multiple values by keys
   */
  async getBatch(keys: string[]): Promise<Record<string, any>> {
    try {
      const promises = keys.map(async key => {
        const value = await this.get(key);
        return { key, value };
      });
      
      const results = await Promise.all(promises);
      
      return results.reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, any>);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get batch from Redis: ${errorMessage}`);
    }
  }

  /**
   * Delete multiple keys
   */
  async deleteBatch(keys: string[]): Promise<void> {
    try {
      const promises = keys.map(key => this.delete(key));
      await Promise.all(promises);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to delete batch from Redis: ${errorMessage}`);
    }
  }

  /**
   * Get the full Redis key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
    try {
      const testKey = 'health_check_' + Date.now();
      const testValue = 'ping';
      
      // Test write
      await this.store(testKey, testValue, 10); // 10 second TTL
      
      // Test read
      const retrievedValue = await this.get(testKey);
      
      // Test delete
      await this.delete(testKey);
      
      if (retrievedValue === testValue) {
        return { status: 'healthy' };
      } else {
        return { 
          status: 'unhealthy', 
          details: 'Read/write test failed' 
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        status: 'unhealthy', 
        details: `Health check failed: ${errorMessage}` 
      };
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    keyPrefix: string;
    defaultTTL?: number;
    connectionStatus: 'healthy' | 'unhealthy';
  }> {
    const healthCheck = await this.healthCheck();
    
    return {
      keyPrefix: this.keyPrefix,
      defaultTTL: this.defaultTTL,
      connectionStatus: healthCheck.status
    };
  }
}