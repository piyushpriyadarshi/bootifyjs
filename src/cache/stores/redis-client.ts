/**
 * Minimal Redis command surface the RedisCacheStore needs. Any client with
 * this shape works — ioredis, node-redis wrappers, or a test fake.
 *
 * The framework never creates a client (A5): the app owns the connection and
 * passes the client (or a factory) to RedisCacheStore.
 */
export interface CacheRedisClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string, mode?: 'EX', duration?: number): Promise<unknown>
  del(...keys: string[]): Promise<number>
  ping?(): Promise<string>
  /**
   * Optional error subscription (ioredis emits 'error' events). The store
   * uses this to record connection errors and surface them via `healthCheck`
   * instead of throwing inside the listener (A3).
   */
  on?(event: 'error', listener: (error: Error) => void): void
  /** Optional set primitives — enable the atomic tag-index path (B1). */
  sAdd?(key: string, ...members: string[]): Promise<number>
  sMembers?(key: string): Promise<string[]>
  expire?(key: string, seconds: number): Promise<number>
  /** Optional batch read — one round trip for `CacheService.mget` (B2). */
  mget?(...keys: string[]): Promise<(string | null)[]>
}

export type CacheRedisClientFactory = () => Promise<CacheRedisClient>
