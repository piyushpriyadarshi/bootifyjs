/**
 * A unique Symbol to use as the DI token for the cache store.
 */
export const CACHE_STORE_TOKEN = Symbol.for('CacheStore')

/** Tag list: static, or derived from the decorated method's arguments. */
export type CacheTags = string[] | ((args: any[]) => string[])

/**
 * The contract that any cache store must adhere to.
 * This can be implemented for in-memory, Redis, Memcached, etc.
 *
 * The optional methods are capability extensions:
 * - set primitives (B1) enable the atomic tag-index path
 * - `mget`/`mset` (B2) enable batch operations
 * Stores that omit them get correct fallbacks in `CacheService`.
 */
export interface ICacheStore {
  get<T>(key: string): Promise<T | undefined>
  /**
   * @param ttlInSeconds `undefined`/`0` → no expiry; positive → seconds;
   *                     negative → `CacheError` (fail fast, A4).
   */
  set(key: string, value: any, ttlInSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  /** Optional liveness probe (used by observability tooling). */
  healthCheck?(): Promise<boolean>

  // --- B1: optional atomic tag-index primitives ---------------------------
  /** True when set primitives below are usable (may resolve lazily). */
  supportsTagSets?(): boolean | Promise<boolean>
  sAdd?(key: string, ...members: string[]): Promise<void>
  sMembers?(key: string): Promise<string[]>
  expire?(key: string, seconds: number): Promise<void>

  // --- B2: optional batch operations --------------------------------------
  mget?<T>(keys: string[]): Promise<(T | undefined)[]>
  mset?(entries: Array<{ key: string; value: any; ttlInSeconds?: number }>): Promise<void>
}

// Type guard for Bun bundler compatibility (ensures interface is not tree-shaken)
export function isCacheStore(obj: unknown): obj is ICacheStore {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'get' in obj &&
    'set' in obj &&
    'del' in obj
  )
}
