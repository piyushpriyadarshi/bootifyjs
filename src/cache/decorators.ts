import { createHash } from 'crypto'
import { container } from '../core/di-container'
import { singleFlight } from '../commons/single-flight'
import { stableStringify } from '../commons/stable-stringify'
import { CacheService } from './cache.service'
import { CacheError } from './errors'
import type { CacheTags } from './cache.types'

/** Builds the cache key from the decorated method's arguments. Full override. */
export type CacheKeyBuilder = (args: any[]) => string

export interface CacheOptions {
  /** A base key for the cache entry. Required unless `keyBuilder` is set. */
  key?: string
  /** Time-to-live in seconds. */
  ttl?: number
  /** Full override: build the key yourself from the method's arguments. */
  keyBuilder?: CacheKeyBuilder
  /** Always SHA-256 the arguments portion (e.g. PII that must not leak into keys). */
  hashArgs?: boolean
  /**
   * Tag the entry for group invalidation — `cache.flushTags(...tags)`.
   * Static list, or derived from the method's arguments
   * (e.g. `(args) => [\`user:\${args[0]}\`]`).
   */
  tags?: CacheTags
  /** Before execution: return false to bypass the cache entirely (no read/write). */
  condition?: (args: any[]) => boolean | Promise<boolean>
  /**
   * After execution: return true to skip storing this result (value is still
   * returned). Receives the method args as the second parameter (A6).
   */
  unless?: (result: any, args: any[]) => boolean | Promise<boolean>
}

export interface CacheableOptions extends CacheOptions {
  /**
   * Single-flight (default true): concurrent callers with the same key share
   * ONE execution — one database query instead of a stampede. Turn off only
   * if the method has side effects that every caller must run.
   */
  singleFlight?: boolean
}

export interface CachePutOptions extends CacheOptions {}
export interface CacheEvictOptions extends CacheOptions {}

/**
 * Arguments longer than this are hashed (SHA-256) instead of inlined, so a
 * big payload can never bloat the cache key.
 */
const MAX_PLAIN_ARGS_LENGTH = 256

/**
 * Build a deterministic cache key from a method's arguments.
 * Format: `<baseKey>::<stable(arg1)>:<stable(arg2)>...`
 *
 * - Object keys are sorted recursively — argument ORDER never changes the key.
 * - Circular references serialize as `"<circular>"` instead of throwing.
 * - When the key exceeds the length threshold (big object arguments) — or when
 *   `options.hashArgs` is set — the arguments portion is replaced by
 *   `sha256:<digest>` so keys stay small and never leak sensitive arguments.
 */
export function generateCacheKey(
  baseKey: string,
  args: any[],
  options: { hashArgs?: boolean } = {}
): string {
  if (options.hashArgs) {
    const digest = createHash('sha256')
      .update(args.map((arg) => stableStringify(arg, new WeakSet())).join(':'))
      .digest('hex')
    return `${baseKey}::sha256:${digest}`
  }

  const seen = new WeakSet<object>()
  const argsString = args.map((arg) => stableStringify(arg, seen)).join(':')
  const key = `${baseKey}::${argsString}`

  if (key.length <= MAX_PLAIN_ARGS_LENGTH) {
    return key
  }
  const digest = createHash('sha256').update(key).digest('hex')
  return `${baseKey}::sha256:${digest}`
}

/**
 * Single source of truth for key resolution inside the decorators — honors
 * `keyBuilder` (full override), then `hashArgs`, then the default formula.
 */
function resolveCacheKey(options: CacheOptions, args: any[]): string {
  if (options.keyBuilder) {
    const key = options.keyBuilder(args)
    if (typeof key !== 'string' || key.length === 0) {
      throw new CacheError('[Cache] keyBuilder must return a non-empty string')
    }
    return key
  }

  if (!options.key) {
    throw new CacheError('[Cache] Either `key` or `keyBuilder` is required')
  }

  return generateCacheKey(options.key, args, { hashArgs: options.hashArgs })
}

/** Resolve the tag list (static or args-derived). */
function resolveTags(tags: CacheTags | undefined, args: any[]): string[] | undefined {
  if (!tags) return undefined
  return typeof tags === 'function' ? tags(args) : tags
}

/**
 * Resolve the CacheService at call time with an ACTIONABLE error when no
 * store is bound (raw ServiceNotFoundError names a symbol nobody recognizes).
 */
function getCacheService(): CacheService {
  try {
    return container.resolve<CacheService>(CacheService)
  } catch {
    throw new CacheError(
      '[Cache] No cache store is bound. Caching is on by default in createBootifyApp() ' +
        'apps — you may have called .disableCache(). Bind one via .enableCache({ store }) ' +
        'or register a store under CACHE_STORE_TOKEN.'
    )
  }
}

export const Cacheable = (options: CacheableOptions): MethodDecorator => {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const cacheService = getCacheService()
      const cacheKey = resolveCacheKey(options, args)

      // (1) condition — full bypass: no read, no flight, no write
      if (options.condition && !(await options.condition(args))) {
        return originalMethod.apply(this, args)
      }

      // (2) cache hit
      const cachedValue = await cacheService.get(cacheKey)
      if (cachedValue !== undefined) {
        return cachedValue
      }

      const storeResult = async (): Promise<any> => {
        // (3) cache miss — run the original method
        const result = await originalMethod.apply(this, args)

        // (4) unless — execute but skip storing
        if (options.unless && (await options.unless(result, args))) {
          return result
        }

        // (5) store (tags indexed when provided)
        const tags = resolveTags(options.tags, args)
        await cacheService.set(cacheKey, result, options.ttl, tags)

        return result
      }

      // (6) single-flight: concurrent callers with the same key share ONE
      // execution — one database query instead of a stampede.
      if (options.singleFlight === false) {
        return storeResult()
      }
      return singleFlight.run(`load:${cacheKey}`, storeResult)
    }

    return descriptor
  }
}

/**
 * Write-through: the method ALWAYS executes and its result is written to the
 * cache (unless `unless` disqualifies it or the result is `undefined`).
 */
export const CachePut = (options: CachePutOptions): MethodDecorator => {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const cacheService = getCacheService()
      const cacheKey = resolveCacheKey(options, args)

      if (options.condition && !(await options.condition(args))) {
        return originalMethod.apply(this, args)
      }

      const result = await originalMethod.apply(this, args)

      if (options.unless && (await options.unless(result, args))) {
        return result
      }

      // `undefined` is the miss sentinel — never stored.
      if (result !== undefined) {
        const tags = resolveTags(options.tags, args)
        await cacheService.set(cacheKey, result, options.ttl, tags)
      }

      return result
    }

    return descriptor
  }
}

/**
 * Invalidate after the method succeeds:
 * - `key`/`keyBuilder` → deletes the entry for the same arguments
 * - `tags`             → flushes every entry carrying those tags
 * At least one of the two is required. A failed method does NOT evict.
 */
export const CacheEvict = (options: CacheEvictOptions): MethodDecorator => {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args)

      const cacheService = getCacheService()
      const hasKey = Boolean(options.key || options.keyBuilder)
      const tags = resolveTags(options.tags, args)

      if (!hasKey && !(tags && tags.length > 0)) {
        throw new CacheError('[Cache] @CacheEvict requires `key`/`keyBuilder` or `tags`')
      }

      if (hasKey) {
        const cacheKey = resolveCacheKey(options, args)
        await cacheService.del(cacheKey)
      }

      if (tags && tags.length > 0) {
        await cacheService.flushTags(...tags)
      }

      return result
    }

    return descriptor
  }
}
