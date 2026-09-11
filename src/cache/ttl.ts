import { CacheError } from './errors'

/**
 * Normalize a TTL for every built-in store (A4) so semantics cannot drift:
 * - `undefined` / `null` / `0` → no expiry (`undefined`)
 * - positive number → seconds
 * - negative / non-finite → `CacheError` (fail fast — a negative TTL is a bug)
 */
export function normalizeTtlInSeconds(ttl?: number | null): number | undefined {
  if (ttl === undefined || ttl === null || ttl === 0) return undefined
  if (!Number.isFinite(ttl) || ttl < 0) {
    throw new CacheError(`[Cache] ttlInSeconds must be >= 0 (received ${ttl})`)
  }
  return ttl
}
