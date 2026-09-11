# LLD — Cache Tier 1: Single-Flight, remember, @CachePut, Tags, Conditionals + Commons Layer

> **SUPERSEDED by `LLD-CACHE.md`** — kept as the historical approved contract.
> The canonical engineering bible (current API, internals, test strategy and
> the A/B/C roadmap) lives in `LLD-CACHE.md`; the Tier-1 content is absorbed
> there (§2–§5). Do not amend this file.
>
> Status: APPROVED (Piyush). This document is the implementation contract for the
> Tier-1 caching features and the new `src/commons/` layer. All ⚖️ decisions below
> are locked.

## 0. Locked decisions

| ⚖️ | Decision |
|---|---|
| 1 | Single-flight is **default-ON** in `@Cacheable` (`singleFlight: false` escape hatch) |
| 2 | **Reentrancy guard** via `AsyncLocalStorage` — same-key reentrant `run()` throws a typed error (better than Go's documented deadlock) |
| 3 | **Stale-delete guard** — `finally` deletes only if the map still holds that exact promise |
| 4 | **Distributed (Redis-lock) single-flight deferred** — process-local takes N → instance-count; shared lock provider lands with the v3.x scheduler-locks roadmap item |
| 5 | **Commons layer**: `src/commons/` inside bootifyjs, exported publicly as `bootifyjs/commons`. Docs disambiguate "framework commons" vs "commons-sqlite" (`@priyadarship4/commons`) |
| 6 | Tags via **store RMW index + in-process per-tag mutex** — cross-instance Redis race documented; atomic `sAdd` fast-path deferred |
| 7 | **No value envelope** — tag index lives in separate `__bc:tag:*` keys; values stay raw in the store |

## 1. Commons layer (`src/commons/`)

Placement rule: generic + dependency-free + used by ≥2 modules. Dependency rule:
`src/commons` imports **nothing** from framework modules.

```
src/commons/
├── single-flight.ts       # SingleFlight class + singleFlight singleton
├── stable-stringify.ts    # order-stable serialization (extracted from cache/decorators)
└── index.ts               # barrel
```

Export surface: `"./commons"` subpath in package.json exports + root barrel
re-export. `bootifyjs/cache` re-exports `singleFlight`, `SingleFlight`,
`stableStringify` for convenience.

**Deviation from draft LLD (intentional):** the reentrancy error is
`SingleFlightReentrancyError` (defined in commons, extends `Error`) — NOT
`CacheError`, because the commons layer must stay dependency-free
(`CacheError` lives in the framework). Keep the same clear message.

### 1.1 SingleFlight semantics

- **Leader**: arrives when the notebook (Map<key, Promise>) is empty for the
  key → runs `fn`, publishes the promise.
- **Follower**: arrives while an entry exists → receives the leader's promise;
  never executes `fn`.
- **Failures are not memoized**: the `finally` removes the entry on settle
  (success or failure) → the next caller retries fresh. Concurrent followers
  of a failed leader all receive the same rejection.
- **Memory**: entries exist only while work is in flight — transit room, not
  warehouse. Bounded by in-flight key count; no TTL/LRU needed.
- **Sync-throwing `fn`**: nothing is published; the error propagates to that
  caller alone.
- **Reentrancy**: `run()` with a key already on the ALS flight stack throws
  `SingleFlightReentrancyError` (different-key nesting is allowed).
- **Stale-delete guard**: `finally` compares the stored promise before
  deleting — a `clear()` mid-flight cannot delete a newer flight's entry.
- **clear()**: forgets tickets; never cancels running work.

## 2. `@Cacheable` v2 flow

```ts
descriptor.value = async function (...args: any[]) {
  const cacheService = getCacheService()               // actionable CacheError if unbound
  const cacheKey = resolveCacheKey(options, args)      // keyBuilder/hashArgs aware

  // (1) condition — full bypass: no read, no flight, no write
  if (options.condition && !(await options.condition(args))) {
    return originalMethod.apply(this, args)
  }

  // (2) cache hit
  const cached = await cacheService.get(cacheKey)
  if (cached !== undefined) return cached

  const storeResult = async () => {
    const value = await originalMethod.apply(this, args)
    if (options.unless && (await options.unless(value))) return value  // skip storing
    const tags = resolveTags(options.tags, args)
    await cacheService.set(cacheKey, value, options.ttl, tags)
    return value
  }

  if (options.singleFlight === false) return storeResult()
  return singleFlight.run(`load:${cacheKey}`, storeResult)
}
```

Ordering: `condition` bypass happens **before** the flight; `unless` runs
**inside** the flight (followers receive the leader's value even when it was
not stored — they asked for the value).

## 3. Tag-based invalidation

Data layout:
```
entry key:     dashboard::"u1"     → value (raw, no envelope)
tag index key: __bc:tag:users      → JSON string[] of entry keys (TTL + 60s)
```

- `__bc:` is a **reserved key prefix**.
- `CacheService.set(key, value, ttl?, tags?)` — additive 4th param; after
  storing, appends the entry key to each tag index (RMW under per-tag mutex;
  index TTL = (ttl ?? 3600) + 60, refreshed per append — indexes self-expire).
- `CacheService.flushTags(...tags)` — under mutex: read index → delete
  members (expired members are harmless no-ops) → delete index. Returns the
  deleted-entry count.
- `tags` option type: `string[] | ((args: any[]) => string[])` (sync; async
  deferred). Supported on `@Cacheable`, `@CachePut`, `@CacheEvict` (evict
  flushes the tags after method success).
- Per-tag mutex (promise-chain map, pruned on settle) serializes RMW within
  the process: in-memory tags fully correct; single-instance Redis correct;
  **multi-instance Redis RMW has a documented lost-append window** (atomic
  `sAdd` fast-path deferred with ⚖️6).
- Cross-instance append race → v2: optional `sAdd/sMembers/sRem` on
  `CacheRedisClient` (needs no store-contract change).

## 4. `@CachePut` + conditionals

```ts
@CachePut({ key: 'product', ttl: 300, tags, condition, unless, keyBuilder?, hashArgs? })
```
Flow: `condition` false → executes without caching; always executes the
method; `unless(value)` true → return without storing; `value === undefined`
→ not cached (miss sentinel — return `null` for "valid empty"). Sync methods
supported.

`@CacheEvict` validation: requires at least one of `key`/`keyBuilder`/`tags`.

## 5. `remember()` / `rememberForever()`

```ts
CacheService.remember<T>(key, ttl: number | undefined, loader, tags?): Promise<T>
CacheService.rememberForever<T>(key, loader, tags?): Promise<T>
```
Get → hit returns; miss → `singleFlight.run(key, ...)` → loader → set (with
tags). Shares the module-singleton flights with `@Cacheable`.

## 6. Test matrix

| # | Suite | Cases |
|---|---|---|
| 1 | single-flight | 1,000 concurrent misses → 1 call; identity-shared value; failure → followers reject, next retries; sequential no-dedupe; different keys independent; clear() mid-flight; stale-delete guard; sync-throw; size/keys; reentrancy throw; different-key nesting |
| 2 | remember | hit/miss/ttl; concurrent coalesce; failure not cached; tags stored; rememberForever |
| 3 | @CachePut | always executes; stores result; undefined skip; unless; condition bypass; sync method; tags |
| 4 | condition/unless | bypass ordering (no read/no write/no flight); unless skips store returns value; async predicates |
| 5 | tags | set→flush round-trip (in-memory + fakeRedis); args-derived tag fn; @CacheEvict tags; concurrent appends survive (mutex); dangling member no-op; index self-expiry (fake timers); multi-tag; reserved-prefix |
| 6 | regression | existing cache tests; builder-features (enableCache); GoalSetter suite |

## 7. File changes

| File | Change |
|---|---|
| `src/commons/{single-flight,stable-stringify,index}.ts` | NEW |
| `package.json` | `./commons` export |
| `src/index.ts` | commons re-export |
| `src/cache/decorators.ts` | v2 flow, @CachePut, options (tags/condition/unless/singleFlight), commons imports |
| `src/cache/cache.service.ts` | set tags param, tag mutex, flushTags, remember/rememberForever |
| `src/cache/index.ts` | commons re-exports |
| `tests/unit/cache/tier1.test.ts` | NEW — matrix §6 |
| `src/cache/README.md`, `src/commons/README.md`, `CHANGELOG.md` | docs |

## 8. Compatibility

No breaking changes: `ICacheStore` untouched; `CacheService.set` gains an
optional 4th param; `CacheOptions` extends additively; custom stores get all
features free; `bootifyjs/commons` is purely additive.
