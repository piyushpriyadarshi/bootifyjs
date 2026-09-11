import { CacheConnectionError, CacheError } from '../errors'
import type { ICacheStore } from '../cache.types'
import { normalizeTtlInSeconds } from '../ttl'
import { CacheRedisClient, CacheRedisClientFactory } from './redis-client'

export interface RedisCacheStoreOptions {
  /**
   * The app-owned Redis client (A5). BootifyJS never creates connections —
   * construct one (e.g. `new Redis(url)`) and pass it in.
   */
  client?: CacheRedisClient
  /**
   * Optional caller-provided lazy factory (advanced/tests). Exactly one of
   * `client` / `clientFactory` must be provided.
   */
  clientFactory?: CacheRedisClientFactory
  /**
   * Called when the client emits a connection error. Never throws — the
   * listener records the error and `healthCheck()` reports unhealthy (A3).
   */
  onError?: (error: Error) => void
}

/**
 * Redis-backed cache store implementing ICacheStore.
 *
 * Keys are namespaced under `cache:`. Values are JSON. The client is
 * app-owned; this store never creates connections.
 */
export class RedisCacheStore implements ICacheStore {
  readonly name = 'redis'
  private client?: CacheRedisClient
  private clientFactory?: CacheRedisClientFactory
  private lastError: Error | null = null
  private readonly onError?: (error: Error) => void
  private errorListenerAttached = false

  constructor(options: RedisCacheStoreOptions = {}) {
    if (options.client && options.clientFactory) {
      throw new CacheError(
        '[Cache] RedisCacheStore accepts either `client` or `clientFactory`, not both.'
      )
    }
    if (!options.client && !options.clientFactory) {
      throw new CacheConnectionError(
        '[Cache] RedisCacheStore requires an app-owned client. Create one (e.g. ' +
          '`new Redis(url)`) and pass it as `{ client }`.'
      )
    }

    this.onError = options.onError
    if (options.client) {
      this.client = options.client
      this.attachErrorListener(options.client)
    } else {
      this.clientFactory = options.clientFactory
    }
  }

  /** Never throw from an EventEmitter listener — record + report (A3). */
  private attachErrorListener(client: CacheRedisClient): void {
    if (this.errorListenerAttached) return
    this.errorListenerAttached = true
    client.on?.('error', (error) => {
      this.lastError = error
      try {
        this.onError?.(error)
      } catch {
        // Observability must never break caching.
      }
    })
  }

  /** Adopt the app-owned client (or resolve the factory) before first use. */
  private async getClient(): Promise<CacheRedisClient> {
    if (!this.client) {
      try {
        const client = await this.clientFactory!()
        this.attachErrorListener(client)
        this.client = client
      } catch (error) {
        if (error instanceof CacheError) throw error
        throw new CacheConnectionError(
          `Failed to create redis client: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
    return this.client
  }

  async get<T>(key: string): Promise<T | undefined> {
    const client = await this.getClient()
    try {
      const raw = await client.get(this.prefixed(key))
      this.lastError = null
      return raw === null ? undefined : (JSON.parse(raw) as T)
    } catch (error) {
      throw new CacheError(`Redis GET failed for '${key}': ${asMessage(error)}`)
    }
  }

  async set(key: string, value: any, ttlInSeconds?: number): Promise<void> {
    const ttl = normalizeTtlInSeconds(ttlInSeconds)
    const client = await this.getClient()
    try {
      const raw = JSON.stringify(value)
      if (ttl) {
        await client.set(this.prefixed(key), raw, 'EX', ttl)
      } else {
        await client.set(this.prefixed(key), raw)
      }
      this.lastError = null
    } catch (error) {
      throw new CacheError(`Redis SET failed for '${key}': ${asMessage(error)}`)
    }
  }

  async del(key: string): Promise<void> {
    const client = await this.getClient()
    try {
      await client.del(this.prefixed(key))
      this.lastError = null
    } catch (error) {
      throw new CacheError(`Redis DEL failed for '${key}': ${asMessage(error)}`)
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.getClient()
      if (!client.ping) return this.lastError === null
      const pong = await client.ping()
      const healthy = String(pong).toLowerCase().includes('pong')
      if (healthy) this.lastError = null
      return healthy
    } catch {
      return false
    }
  }

  // --- B1: atomic tag-index primitives ------------------------------------

  /** Resolve the client once and report whether set ops are available. */
  async supportsTagSets(): Promise<boolean> {
    const client = await this.getClient()
    return (
      typeof client.sAdd === 'function' &&
      typeof client.sMembers === 'function' &&
      typeof client.expire === 'function'
    )
  }

  async sAdd(key: string, ...members: string[]): Promise<void> {
    const client = await this.getClient()
    try {
      await client.sAdd!(this.prefixed(key), ...members)
      this.lastError = null
    } catch (error) {
      throw new CacheError(`Redis SADD failed for '${key}': ${asMessage(error)}`)
    }
  }

  async sMembers(key: string): Promise<string[]> {
    const client = await this.getClient()
    try {
      const members = await client.sMembers!(this.prefixed(key))
      this.lastError = null
      return members
    } catch (error) {
      throw new CacheError(`Redis SMEMBERS failed for '${key}': ${asMessage(error)}`)
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    const client = await this.getClient()
    try {
      await client.expire!(this.prefixed(key), seconds)
      this.lastError = null
    } catch (error) {
      throw new CacheError(`Redis EXPIRE failed for '${key}': ${asMessage(error)}`)
    }
  }

  // --- B2: batch operations -----------------------------------------------

  /** One `MGET` round trip when the client supports it, else parallel GETs. */
  async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
    if (keys.length === 0) return []
    const client = await this.getClient()
    try {
      if (client.mget) {
        const raws = await client.mget(...keys.map((k) => this.prefixed(k)))
        this.lastError = null
        return raws.map((raw) => (raw === null ? undefined : (JSON.parse(raw) as T)))
      }
      return await Promise.all(keys.map((key) => this.get<T>(key)))
    } catch (error) {
      throw new CacheError(`Redis MGET failed: ${asMessage(error)}`)
    }
  }

  /** Sequential SETs (write batching has no portable single command with TTL). */
  async mset(entries: Array<{ key: string; value: any; ttlInSeconds?: number }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttlInSeconds)
    }
  }

  private prefixed(key: string): string {
    return `cache:${key}`
  }
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
