import type { RedisClient } from '../auth/storage/RedisTokenStorage'
import type { TokenStorage } from '../auth/types'
import type { ILogTransport, LogEntry } from '../logging'

/**
 * In-memory TokenStorage with Redis-like JSON round-tripping: stored values
 * are deep-copied via JSON, so mutations to retrieved objects do NOT write
 * through — matching real Redis semantics.
 */
export class FakeTokenStorage implements TokenStorage {
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

  /** Direct (non-JSON) inspection for assertions. */
  peekRaw(key: string): any {
    const raw = this.data.get(key)
    return raw === undefined ? undefined : JSON.parse(raw)
  }

  keys(): string[] {
    return Array.from(this.data.keys())
  }

  clear(): void {
    this.data.clear()
    this.expiry.clear()
  }

  private evictIfExpired(key: string): void {
    const expiresAt = this.expiry.get(key)
    if (expiresAt !== undefined && Date.now() > expiresAt) {
      this.data.delete(key)
      this.expiry.delete(key)
    }
  }
}

/**
 * Map-backed Redis client implementing the auth `RedisClient` interface AND
 * the cache `CacheRedisClient` surface (set ops for B1, `mget` for B2,
 * `on`/`emit` for A3), with EX/PX expiry semantics and injectable failures.
 */
export class FakeRedisClient implements RedisClient {
  private data = new Map<string, string>()
  private sets = new Map<string, Set<string>>()
  private expiry = new Map<string, number>() // absolute epoch ms
  private listeners = new Map<string, Array<(error: Error) => void>>()

  /** When set, matching operations throw (e.g. ['get', 'set']). */
  public failingOps: Set<string> | null = null

  async get(key: string): Promise<string | null> {
    this.maybeFail('get')
    this.evictIfExpired(key)
    if (this.sets.has(key)) {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value')
    }
    return this.data.get(key) ?? null
  }

  async set(
    key: string,
    value: string,
    modeOrOptions?: 'EX' | { EX?: number; PX?: number },
    duration?: number
  ): Promise<string | null> {
    this.maybeFail('set')
    this.data.set(key, value)
    this.sets.delete(key)
    if (modeOrOptions === 'EX') {
      if (duration && duration > 0) {
        this.expiry.set(key, Date.now() + duration * 1000)
      } else {
        this.expiry.delete(key)
      }
    } else if (modeOrOptions && typeof modeOrOptions === 'object') {
      if (modeOrOptions.EX) {
        this.expiry.set(key, Date.now() + modeOrOptions.EX * 1000)
      } else if (modeOrOptions.PX) {
        this.expiry.set(key, Date.now() + modeOrOptions.PX)
      } else {
        this.expiry.delete(key)
      }
    } else {
      this.expiry.delete(key)
    }
    return 'OK'
  }

  async del(key: string): Promise<number> {
    this.maybeFail('del')
    this.expiry.delete(key)
    const deletedString = this.data.delete(key)
    const deletedSet = this.sets.delete(key)
    return deletedString || deletedSet ? 1 : 0
  }

  async exists(key: string): Promise<number> {
    this.maybeFail('exists')
    this.evictIfExpired(key)
    return this.data.has(key) || this.sets.has(key) ? 1 : 0
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.maybeFail('expire')
    if (!this.data.has(key) && !this.sets.has(key)) return 0
    this.expiry.set(key, Date.now() + seconds * 1000)
    return 1
  }

  async ttl(key: string): Promise<number> {
    this.maybeFail('ttl')
    this.evictIfExpired(key)
    if (!this.data.has(key) && !this.sets.has(key)) return -2
    const expiresAt = this.expiry.get(key)
    return expiresAt === undefined ? -1 : Math.ceil((expiresAt - Date.now()) / 1000)
  }

  // --- B1: set primitives --------------------------------------------------

  async sAdd(key: string, ...members: string[]): Promise<number> {
    this.maybeFail('sAdd')
    this.evictIfExpired(key)
    if (this.data.has(key)) {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value')
    }
    let set = this.sets.get(key)
    if (!set) {
      set = new Set<string>()
      this.sets.set(key, set)
    }
    let added = 0
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member)
        added++
      }
    }
    return added
  }

  async sMembers(key: string): Promise<string[]> {
    this.maybeFail('sMembers')
    this.evictIfExpired(key)
    return [...(this.sets.get(key) ?? [])]
  }

  // --- B2: batch read ------------------------------------------------------

  async mget(...keys: string[]): Promise<(string | null)[]> {
    this.maybeFail('mget')
    return keys.map((key) => {
      this.evictIfExpired(key)
      return this.data.get(key) ?? null
    })
  }

  // --- A3: error event surface --------------------------------------------

  on(event: 'error', listener: (error: Error) => void): void {
    const list = this.listeners.get(event) ?? []
    list.push(listener)
    this.listeners.set(event, list)
  }

  /** Test helper: fire a client error at registered listeners. */
  emit(event: 'error', error: Error): void {
    for (const listener of this.listeners.get(event) ?? []) listener(error)
  }

  /** Inspect stored raw value. */
  raw(key: string): string | undefined {
    return this.data.get(key)
  }

  /** Inspect a set's members (B1). */
  rawSet(key: string): string[] {
    return [...(this.sets.get(key) ?? [])]
  }

  private maybeFail(op: string): void {
    if (this.failingOps?.has(op)) {
      throw new Error(`simulated redis failure on ${op}`)
    }
  }

  private evictIfExpired(key: string): void {
    const expiresAt = this.expiry.get(key)
    if (expiresAt !== undefined && Date.now() > expiresAt) {
      this.data.delete(key)
      this.sets.delete(key)
      this.expiry.delete(key)
    }
  }
}

/** Captures log entries for assertions. */
export class FakeTransport implements ILogTransport {
  public entries: LogEntry[] = []
  public failOnWrite = false
  public flushed = false
  public closed = false

  constructor(readonly name: string = 'fake') {}

  write(entry: LogEntry): void {
    if (this.failOnWrite) throw new Error('transport write failure')
    this.entries.push(entry)
  }

  async flush(): Promise<void> {
    this.flushed = true
  }

  async close(): Promise<void> {
    this.closed = true
  }

  messages(): string[] {
    return this.entries.map((e) => e.message)
  }
}
