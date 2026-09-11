import type { TokenStorage } from '../types'

/**
 * In-memory TokenStorage — the zero-config default behind `enableAuth()`.
 * Sufficient for single-instance development and POCs; swap for
 * `RedisTokenStorage` in multi-instance production (documented).
 */
export class InMemoryTokenStorage implements TokenStorage {
  private data = new Map<string, string>()
  private expiry = new Map<string, number>()

  async store(key: string, value: any, ttl?: number): Promise<void> {
    this.data.set(key, JSON.stringify(value ?? null))
    if (ttl && ttl > 0) {
      this.expiry.set(key, Date.now() + ttl * 1000)
    }
  }

  async get(key: string): Promise<any> {
    this.evictIfExpired(key)
    const raw = this.data.get(key)
    return raw === undefined ? null : JSON.parse(raw)
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
    this.expiry.delete(key)
  }

  async exists(key: string): Promise<boolean> {
    this.evictIfExpired(key)
    return this.data.has(key)
  }

  private evictIfExpired(key: string): void {
    const expiresAt = this.expiry.get(key)
    if (expiresAt !== undefined && Date.now() > expiresAt) {
      this.data.delete(key)
      this.expiry.delete(key)
    }
  }
}
