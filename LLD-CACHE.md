# LLD — BootifyJS Cache (`bootifyjs/cache`): Engineering Bible

> **Status:** APPROVED. Canonical design document for the cache module —
> developer API, internal implementation, test strategy, and the full
> A/B/C roadmap. Supersedes `LLD-CACHE-TIER1.md` (kept as the historical
> Tier-1 contract). The user-facing guide is `src/cache/README.md`; the docs
> site lives under `docs/docs/modules/cache/`.
>
> **Audience:** framework engineers implementing/refactoring the module, and
> power users who need to reason about internals. If you only want to *use*
> the cache, read `src/cache/README.md` instead.

---

## 0. Document control

### 0.1 Reading paths

| You want to… | Read |
|---|---|
| Use the cache in an app | `src/cache/README.md` (user guide) |
| Know every public signature/option | §2 Developer API |
| Change decorators/stores/single-flight | §3 Architecture & internals |
| Add tests | §4 Test strategy & matrix |
| Build a roadmap item | §5 Roadmap (per-item API + internals) |
| Find a symbol fast | §6 Appendices |

### 0.2 Related documents

| Doc | Role |
|---|---|
| `LLD-CACHE-TIER1.md` | Historical Tier-1 contract (single-flight, remember, @CachePut, tags, conditionals). Superseded by this file. |
| `LLD-PLAN.md` | Flagship master plan. §8 roadmap points here for cache. |
| `src/cache/README.md` | User-facing module bible (usage, gotchas, FAQ). |
| `docs/docs/modules/cache/*.md` | Published docs site (overview, decorators, stores, custom-stores). |
| `src/auth/README.md` | Precedent for pluggable serializers (`RedisTokenStorage.serializer`). |

### 0.3 Item status model

Every roadmap item (§5) has a stable ID (`A1`…`C3`) and a status:

| Status | Meaning |
|---|---|
| `planned` | Designed in this doc; not scheduled |
| `approved` | Scheduled for the current release window |
| `in-progress` | Being implemented |
| `shipped` | Implemented, tested, documented |

### 0.4 Glossary

| Term | Meaning |
|---|---|
| **Store** | Backend implementing `ICacheStore` (memory, Redis, custom). |
| **Facade** | `CacheService` — the only thing decorators and user code call. |
| **Miss sentinel** | `undefined` — a cached `undefined` is impossible; return `null` for a valid empty result. |
| **Single-flight** | Concurrent callers with the same key share one execution (stampede protection). |
| **Tag index** | Auxiliary key holding the list of entry keys for a tag. |
| **L1 / L2** | Process-local cache / shared remote cache (Phase C). |
| **SWR** | Stale-while-revalidate: serve stale, refresh in the background. |

---

## 1. Mission & principles

### 1.1 Mission

Give BootifyJS apps Spring-Boot-grade caching DX — declarative decorators,
convention-over-configuration, enterprise-safe failure semantics — while
staying native to Fastify/TypeScript and dependency-free at the core.

### 1.2 Principles (inherited, non-negotiable)

1. **Fail fast, never silently degrade.** A store failure throws `CacheError`;
   it never turns into a cache miss. Silent degradation masks outages.
2. **Code matches README.** Docs are part of the contract; doc drift is a bug
   (see A1).
3. **DI-token decoupling.** Decorators never know the backend. Swapping memory
   → Redis is one binding.
4. **Commons layer rule.** `src/commons/*` is generic, dependency-free, and
   importable by ≥2 modules. `src/cache` may import commons; commons imports
   nothing from framework modules.
5. **Tests are the contract.** Deterministic, real state assertions, no
   mock-theater. Fake timers for TTL, `FakeRedisClient` for Redis.
6. **Zero dead code.** Delete, don't comment out.

### 1.3 Explicit non-goals

- No GraphQL/REST directive integration — a cache module must not know HTTP
  or GraphQL semantics (Phase C rejected).
- No read/write-through DB proxy — the cache must not know your database.
- No LFU eviction — LRU is sufficient and simpler to reason about.
- No blanket `clear()` — library code flushing a shared cache is a foot-gun.

---

## 2. Developer API

### 2.1 Import map

```ts
import { createBootifyApp } from 'bootifyjs'                       // wiring
import {
  Cacheable, CachePut, CacheEvict, generateCacheKey,              // decorators + keys
  CacheService, CACHE_STORE_TOKEN, ICacheStore, isCacheStore,      // facade + contract
  InMemoryCacheStore, RedisCacheStore, CacheRedisClient,           // stores
  bootstrapCache,                                                  // manual wiring
  CacheError, CacheConnectionError,                                // errors
  singleFlight, SingleFlight, stableStringify,                     // commons re-exports
} from 'bootifyjs/cache'
import { singleFlight, stableStringify } from 'bootifyjs/commons'  // commons subpath
import { FakeRedisClient, FakeTokenStorage } from 'bootifyjs/testing'
```

### 2.2 Wiring

#### Default-ON (recommended)

```ts
const app = await createBootifyApp()   // cache is ON with an InMemoryCacheStore
  .useControllers(controllers)
  .build()
```

`BootifyApp.build()` binds a store **before any service resolves it**, into
the app container *and* the global container (decorators resolve from the
global one), then eagerly resolves `CacheService` so broken bindings fail at
startup. See §3.8 for the exact algorithm.

#### `enableCache(options)`

Exactly **one** of `store` / `client` / `maxEntries` may be provided; omitting
all three binds `InMemoryCacheStore`.

```ts
.enableCache({ store: myStore })              // A. your ICacheStore
.enableCache({ client: ioredisInstance })     // B. wrap an app-owned client (A5)
.enableCache({ maxEntries: 10_000 })          // C. default store, bounded (A2)
.disableCache()                               // opt out entirely
```

Validation is fail-fast at build (`ConfigValidationError`):

| Condition | Error |
|---|---|
| >1 of `store`/`client`/`maxEntries` | `enableCache() accepts only ONE of: store, client, maxEntries.` |
| `client` missing `get`/`set`/`del` | actionable client-shape error |

The framework **never creates a Redis client** (⚖️14/A5): the app constructs
one (e.g. `new Redis(url)`) and owns its lifecycle; BootifyJS wraps it in
`RedisCacheStore` so no second connection is opened. There is no `redisUrl`
option and no ioredis dependency.

`disableCache()` semantics: the framework binds nothing. A store *you*
registered manually stays yours and keeps working; a `@Cacheable` call with
nothing bound throws an actionable `CacheError` (never a raw
`ServiceNotFoundError`).

#### `bootstrapCache(options?)` (non-builder apps)

```ts
import { bootstrapCache } from 'bootifyjs/cache'

const unbootstrap = bootstrapCache()                       // InMemoryCacheStore
const unbootstrapBounded = bootstrapCache({ maxEntries: 1_000 })  // bounded (A2/⚖️17)
```

Idempotent, silent, user-bound wins; returns an unbootstrap for tests/HMR.

### 2.3 Decorators

#### `@Cacheable(options)` — cache-aside

```ts
@Cacheable({ key: 'report.monthly', ttl: 300 })
async monthly(userId: string, month: string) { /* expensive */ }
```

| Option | Type | Default | Semantics |
|---|---|---|---|
| `key` | `string` | — | Base key. Required unless `keyBuilder`. |
| `ttl` | `number` (seconds) | no expiry | See §2.7 TTL contract. |
| `keyBuilder` | `(args: any[]) => string` | — | Full key override; must return non-empty string. |
| `hashArgs` | `boolean` | `false` | Always SHA-256 the args portion (PII-safe). |
| `tags` | `string[] \| ((args) => string[])` | — | Group invalidation via `flushTags`. |
| `condition` | `(args) => boolean \| Promise<boolean>` | — | `false` → bypass entirely (no read, no flight, no write). |
| `unless` | `(result, args) => boolean \| Promise<boolean>` | — | `true` → return value without storing (A6). |
| `singleFlight` | `boolean` | `true` | Concurrent misses share one execution. |

Execution order (locked, see §3.4): `condition` → cache read → single-flight →
method → `unless` → store. The method **must be async**; a result of
`undefined` is never stored (miss sentinel).

#### `@CachePut(options)` — write-through

Always executes the method; stores the result (unless `unless` disqualifies
or the result is `undefined`). Options: same as `@Cacheable` minus
`singleFlight`. `condition` bypasses execution *and* storing.

```ts
@CachePut({ key: 'product', ttl: 300, tags: ['products'] })
async update(id: string, patch: Patch) { return repo.update(id, patch) }
```

#### `@CacheEvict(options)` — invalidate after success

Runs the method first; **on success** deletes the entry for the same
arguments and/or flushes tags. A thrown method does **not** evict (a failed
write must not wipe a valid entry). Requires at least one of
`key`/`keyBuilder`/`tags` (else `CacheError` at call time).

```ts
@CacheEvict({ key: 'product' })
async remove(id: string) { await repo.remove(id) }

@CacheEvict({ tags: (args) => [`user:${args[0]}`] })
async updateEmail(userId: string, email: string) { /* ... */ }
```

### 2.4 `CacheService` (imperative facade)

Resolved via DI; also the programmatic twin of the decorators.

```ts
class CacheService {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: any, ttlInSeconds?: number, tags?: string[]): Promise<void>   // alias of put
  put(key: string, value: any, ttlInSeconds?: number, tags?: string[]): Promise<void>
  del(key: string): Promise<void>

  mget<T>(keys: string[]): Promise<(T | undefined)[]>                                   // B2
  mset(entries: Array<{ key: string; value: any; ttlInSeconds?: number; tags?: string[] }>): Promise<void>  // B2

  remember<T>(key: string, ttl: number | undefined, loader: () => Promise<T>, tags?: string[]): Promise<T>
  rememberForever<T>(key: string, loader: () => Promise<T>, tags?: string[]): Promise<T>

  flushTags(...tags: string[]): Promise<number>   // returns deleted-entry count
}
```

- `remember` is cache-aside with built-in single-flight: concurrent callers
  share one loader run; `undefined` results are not stored.
- `flushTags` unions members across tags, dedupes, deletes once, counts once.
- `mget`/`mset` delegate to the store when it implements the optional batch
  methods, else fall back to loops (§5.B2).
- Tag index TTL = `(ttl ?? 3600) + 60` seconds — indexes self-expire shortly
  after their last member (§3.6). The tag path is atomic when the store
  exposes set primitives (B1), else RMW + mutex.

### 2.5 Key generation

```ts
generateCacheKey(baseKey: string, args: any[], options?: { hashArgs?: boolean }): string
```

| Case | Result |
|---|---|
| `generateCacheKey('k', ['u1', '2026-09'])` | `k::"u1":"2026-09"` |
| No args | `k::` |
| Object key order differs | **same key** (keys sorted recursively) |
| Serialized length > 256 chars | `k::sha256:<64-hex>` |
| `{ hashArgs: true }` | always `k::sha256:<64-hex>` |
| Circular reference | serializes as `"<circular>"`, never throws |

Stability comes from `stableStringify` (`src/commons/stable-stringify.ts`):
recursive key sort, `Date` → ISO JSON, `undefined` → literal `undefined`,
circular → `"<circular>"`.

### 2.6 Single-flight (standalone)

```ts
import { singleFlight, SingleFlight, SingleFlightReentrancyError } from 'bootifyjs/commons'

const value = await singleFlight.run('oauth:refresh', async () => refreshFromProvider())
```

Semantics: leader runs, followers await the same promise, failures are **not**
memoized, same-key reentrancy throws `SingleFlightReentrancyError` (instead of
deadlocking), `clear()` forgets in-flight entries without cancelling work,
`size`/`keys()` expose observability. `@Cacheable` uses the same
process-wide singleton.

### 2.7 TTL contract (A4)

| `ttlInSeconds` | Behavior |
|---|---|
| `undefined` / `null` | no expiry |
| `0` | no expiry (Redis cannot `EX 0`; memory treats it as forever) |
| positive number | expiry after N seconds |
| negative number | **`CacheError`** — fail fast; a negative TTL is a bug |

Both stores normalize through one shared helper (§3.9), so semantics cannot
drift.

### 2.8 Stores

#### `ICacheStore` (the contract)

```ts
export interface ICacheStore {
  get<T>(key: string): Promise<T | undefined>   // undefined = miss
  set(key: string, value: any, ttlInSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  healthCheck?(): Promise<boolean>
}
export function isCacheStore(obj: unknown): obj is ICacheStore
```

Custom stores get every decorator/tag/remember feature for free. See
`docs/docs/modules/cache/custom-stores.md`.

#### `InMemoryCacheStore` (default)

- `new InMemoryCacheStore({ maxEntries?: number })` — opt-in LRU (A2, §5.A2).
- `Map<key, { value, expiry }>`; expired entries evict lazily on `get`.
- **Stores raw references** (no serialization) — mutating a cached object
  mutates the cache. Redis serializes. This divergence is documented (A1) and
  fixable via the Phase-B serializer (B3).
- Per-process only; use Redis behind multiple instances.

#### `RedisCacheStore`

- `new RedisCacheStore({ client, clientFactory?, onError?, serializer? })`
  — **app-owned client** (A5/⚖️14). `clientFactory` is an optional
  caller-provided lazy factory (tests/advanced); neither → `CacheConnectionError`
  at construction (fail-fast). `onError` is A3; `serializer` is B3.
- Keys are namespaced `cache:<key>`; tag indexes therefore live at
  `cache:__bc:tag:<tag>`.
- Values are `JSON.stringify`/`JSON.parse`; `EX <seconds>` only when TTL > 0.
- `CacheRedisClient` is the minimal client surface: `get`, `set`, `del`,
  `ping?`, `on?` (A3), plus optional `sAdd`/`sMembers`/`expire` (B1) and
  `mget` (B2). Any client with that shape works — ioredis, node-redis
  wrappers, or test fakes. **ioredis is just an example; it is not a
  dependency of the framework.**
- Errors from ops are wrapped with operation + key context; connection errors
  emitted by the client are recorded (never thrown inside the listener) and
  surface through `healthCheck()`.

### 2.9 Errors

```ts
class CacheError extends BootifyError { code = 'CACHE_ERROR' }              // status 500
class CacheConnectionError extends CacheError { code = 'CACHE_CONNECTION' } // backend unreachable
```

Stores wrap backend failures with operation + key context
(`Redis GET failed for 'user:1': <cause>`). The default error handler maps
`BootifyError.status` → HTTP, so cache failures surface as 500s — by design
(see principle 1). Apps that prefer degrading to recompute must catch
explicitly.

### 2.10 Testing surface

- `FakeRedisClient` (`bootifyjs/testing`) — Map-backed with `EX`/`PX` TTL
  semantics, `failingOps: Set<string>`, `raw(key)` inspection, `on()`/`emit()`
  listener hooks (A3), and optional set ops `sAdd`/`sMembers`/`expire`
  (B1).
- `createTestApp()` binds a per-test `InMemoryCacheStore`; register your own
  under `CACHE_STORE_TOKEN` with `override: true` for isolation.

---

## 3. Architecture & internals

### 3.1 Component diagram

```
            ┌────────────────────────────────────────────────────────┐
            │ app code                                                │
            │  @Cacheable/@CachePut/@CacheEvict      CacheService     │
            └───────────────┬─────────────────────────────┬──────────┘
                            │ resolve at call time         │ DI (@Autowired)
                            ▼                              ▼
                   global container  ◄── CACHE_STORE_TOKEN ──► app container
                            │                              │
                            └────────────┬─────────────────┘
                                         ▼
                                  ICacheStore
                          ┌──────────────┴──────────────┐
                   InMemoryCacheStore            RedisCacheStore
                                                        │
                                                CacheRedisClient (app-owned: ioredis | fake)

  cross-cutting: src/commons/single-flight (stampede), src/commons/stable-stringify (keys)
```

### 3.2 File map

| File | Responsibility |
|---|---|
| `src/cache/cache.types.ts` | `CACHE_STORE_TOKEN`, `CacheTags`, `ICacheStore`, `isCacheStore` |
| `src/cache/cache.service.ts` | Facade: get/set/put/del/remember/rememberForever/flushTags; tag index + mutex |
| `src/cache/decorators.ts` | `Cacheable`, `CachePut`, `CacheEvict`, `generateCacheKey`, key/tag resolution |
| `src/cache/builder.ts` | `EnableCacheOptions`, `resolveCacheStoreFromOptions` (fail-fast validation) |
| `src/cache/bootstrap.ts` | `bootstrapCache()` — idempotent manual binding |
| `src/cache/errors.ts` | `CacheError`, `CacheConnectionError` |
| `src/cache/ttl.ts` | Shared TTL normalizer for both stores (A4) |
| `src/cache/stores/in-memory-cache.store.ts` | Default store (Map + TTL; A2 LRU) |
| `src/cache/stores/redis-cache.store.ts` | Redis store (prefix, JSON, health, A3 error handling, B1 sets, B2 batch) |
| `src/cache/stores/redis-client.ts` | `CacheRedisClient` contract (optional set/batch/error primitives) |
| `src/commons/single-flight.ts` | `SingleFlight`, singleton, reentrancy error |
| `src/commons/stable-stringify.ts` | Order-stable serialization |
| `src/cache/index.ts` | Public barrel (`bootifyjs/cache`) |
| `src/BootifyApp.ts` | Build-time binding (dual container, eager resolve) |

### 3.3 Key resolution algorithm

```
resolveCacheKey(options, args):
  if options.keyBuilder:
      key = keyBuilder(args)
      if key is not a non-empty string -> CacheError
      return key
  if !options.key -> CacheError('Either `key` or `keyBuilder` is required')
  return generateCacheKey(options.key, args, { hashArgs: options.hashArgs })

generateCacheKey(base, args, { hashArgs }):
  if hashArgs: return `${base}::sha256:${sha256(args.map(stableStringify).join(':'))}`
  key = `${base}::${args.map(stableStringify).join(':')}`
  if key.length <= 256: return key
  return `${base}::sha256:${sha256(key)}`
```

### 3.4 `@Cacheable` execution flow

```
caller ──▶ wrapped method
  (1) condition(args) === false ──▶ original method (no read/flight/write)
  (2) cached = cache.get(key)
      cached !== undefined ──▶ return cached                      (HIT)
  (3) miss:
        singleFlight:false ──▶ storeResult()
        else ──▶ singleFlight.run(`load:${key}`, storeResult)
                    │
                    ├── leader: run storeResult()
                    └── followers: await the leader's promise (no method call)

      storeResult():
        value = original method(...)
        unless(value, args) ──▶ return value (not stored)
        set(key, value, ttl, tags)   // tags indexed here
        return value
```

Ordering rationale (locked in Tier-1): `condition` is checked **before** the
flight (a bypassed call must not join a flight); `unless` is evaluated
**inside** the flight so followers still receive the value even when it is not
stored.

### 3.5 `@CachePut` / `@CacheEvict` flows

```
@CachePut:   condition? ──▶ method ──▶ unless? ──▶ (value !== undefined)? set
@CacheEvict: method ──▶ on success: del(key if key/keyBuilder) + flushTags(tags)
             method throws ──▶ no eviction (propagate)
```

### 3.6 Tag invalidation internals

Data layout:

```
entry:          <user key>                     → value (raw; no envelope — ⚖️7)
tag index:      __bc:tag:<tag>                 → JSON string[] (RMW) | Redis SET (B1)
Redis physical: cache:__bc:tag:<tag>           (store prefix `cache:`)
index TTL:      (entryTtl ?? 3600) + 60s
```

- **Tag strategy (B1):** if the store exposes `sAdd`/`sMembers` (Redis with
  set support) → atomic Sets path: `SADD` + `EXPIRE`, no mutex;
  `flushTags` = `SMEMBERS` → `DEL` members → `DEL` index. Otherwise fall back
  to the RMW + per-tag promise-chain mutex (in-memory, minimal custom stores).
- `indexTags(key, tags, ttl)` (RMW path): per tag, under the mutex, read →
  append (dedupe) → set with `indexTtl`.
- `flushTags(...tags)`: per tag, read index → delete index → union members →
  delete each member once → return unique count.
- **Migration (B1):** `SADD` against a legacy JSON-string index raises
  `WRONGTYPE` → `DEL` + retry once; old indexes self-heal, orphaned entries
  are bounded by their own TTL.
- Mutex scope: process-local (`tagLocks: Map<tag, Promise>`), pruned on
  settle. In-memory is always exact; Redis is exact on both paths once set
  support is present.
- **Known limitation (⚖️6, fixed by B1):** multi-instance Redis RMW has a
  lost-append window; the Sets path removes it.
- **Crash window (G6):** a crash between member deletes and index delete
  leaks orphaned entries until their TTL. Bounded, accepted.
- Index growth: O(n) per append/flush on the RMW path; O(1) membership on the
  Sets path.

### 3.7 Single-flight internals

```
run(key, fn):
  stack = ALS.getStore() ?? []
  if key in stack -> throw SingleFlightReentrancyError(key)   // deadlock guard
  existing = inFlight.get(key)
  if existing -> return existing                              // follower
  promise = ALS.run([...stack, key], fn)
              .finally(() => { if (inFlight.get(key) === promise) delete })  // stale-delete guard
  inFlight.set(key, promise)
  return promise
```

- **Not memoized:** the `finally` removes the entry on settle (success or
  failure), so the next caller retries fresh. Concurrent followers of a
  failed leader all receive the same rejection.
- **Bounded by construction:** entries exist only while work is in flight —
  a waiting room, not a warehouse; no eviction strategy needed.
- **Observability:** `size`, `keys()`, `clear()` (test/debug; never cancels
  running work).
- **Process-local** — distributed stampede protection is C1.

### 3.8 Lifecycle & DI wiring

`BootifyApp.build()` cache block (order matters):

```
if cacheDisabled: skip entirely
else if cacheOptions (explicit enableCache):
    store = resolveCacheStoreFromOptions(options)   // fail-fast validation
    bind store into app container AND global container (same instance)
else if a store is already bound in either container:
    adopt it and mirror the SAME instance into the other container
else:
    store = resolveCacheStoreFromOptions({})        // InMemoryCacheStore
    bind into both containers

register CacheService (useClass) if absent
resolve CacheService eagerly                        // broken bindings fail at startup
```

- Decorators resolve `CacheService` from the **global** container at call
  time; injected services resolve from the app container. Dual binding keeps
  both paths on the same store instance.
- Binding happens before any controller registration, so the first request
  can never race the store.
- `bootstrapCache()` is the non-builder path: binds `InMemoryCacheStore` only
  if the token is empty; returns an `unbootstrap()` for tests/HMR.

### 3.9 Store internals

**In-memory** (`Map<key, { value, expiry: number | null }>`):

- `get`: miss → `undefined`; expired (`expiry <= Date.now()`, inclusive) →
  delete + `undefined`.
- `set`: `expiry = ttl ? now + ttl*1000 : null`.
- No serialization — returns the stored reference (documented divergence).
- A2 adds `maxEntries` LRU and the shared TTL normalizer.

**Redis**:

- `get`: `JSON.parse(raw)`; `null` → `undefined`; failures wrapped
  `CacheError('Redis GET failed for ...')`.
- `set`: `JSON.stringify`; `EX` when `ttl > 0`.
- `del`: prefixed `DEL`.
- `healthCheck`: `PING` contains `pong`; client/factory failure → `false`.
- **App-owned client (A5):** the store receives a `CacheRedisClient` (or a
  caller-provided factory); it never creates connections and has no ioredis
  dependency.
- **A3:** the client's `'error'` events are recorded (`lastError`) and
  forwarded to `onError` — never thrown inside the listener (an exception in
  an EventEmitter listener is uncaught and can crash the process).
  `healthCheck()` reports `false` while `lastError` is set; a successful op
  or ping clears it.
- **B1/B2:** set primitives and `mget` are implemented by delegating to the
  client when present; otherwise left `undefined` so `CacheService` uses its
  fallbacks.

### 3.10 Concurrency & failure model

| Situation | Behavior |
|---|---|
| Concurrent same-key miss | One execution (single-flight); all callers get the same value/error |
| Leader fails | Followers reject identically; next caller retries fresh |
| Same-key reentrant loader | `SingleFlightReentrancyError` (no deadlock) |
| Store op fails | Throws `CacheError` — never a silent miss |
| `@CacheEvict` method throws | No eviction |
| `@Cacheable` method returns `undefined` | Not stored; next call misses again |
| Tag index across processes | Atomic on the Redis Sets path (B1); RMW fallback has a documented lost-append window |
| In-memory under multi-instance | Per-process; expected, documented |

### 3.11 Known limitations registry

| ID | Limitation | Severity | Fixed by |
|---|---|---|---|
| G1 | README claims both stores serialize; in-memory stores references | Doc truth + semantic divergence | A1 ✅ (docs); B3 (serializer) pending |
| G2 | Redis `'error'` listener throws → possible process crash | High | A3 ✅ |
| G3 | TTL semantics diverge for `0`/negative across stores | Medium | A4 ✅ |
| G4 | Tag key prefix doc mismatch (`__bc:tag:` vs physical `cache:__bc:tag:`) | Low | A1 ✅ |
| G5 | README test counts stale | Low | A1 ✅ (31+31+8) |
| G6 | `flushTags` crash window leaks members until TTL; O(n) tag indexes | Low/Medium | B1 ✅ (Sets path); crash window documented |
| G7 | In-memory unbounded/lazy expiry | High (default-ON) | A2 ✅ (opt-in LRU) |
| G8 | Multi-instance tag RMW race | Medium | B1 ✅ (when client has set ops) |
| G9 | Process-local single-flight | Medium (multi-instance) | C1 (planned) |
| G10 | No cache observability (hit/miss/latency) | Medium | B4 (planned) |

---

## 4. Test strategy & matrix

### 4.1 Suites today

| Suite | Cases | Covers |
|---|---|---|
| `tests/unit/cache/cache.test.ts` | 31 | stores (incl. A2 LRU, A3 errors, A4 TTL, A5 client), decorators, bootstrap, errors, health, keys |
| `tests/unit/cache/tier1.test.ts` | 31 | single-flight, remember, @CachePut, condition/unless (incl. A6 args), tags |
| `tests/unit/cache/tier2.test.ts` | 8 | B1 atomic tag sets + fallback, B2 `mget`/`mset` |
| `tests/integration/cache-builder.test.ts` | 13 | `enableCache` default-ON, store/client/maxEntries validation, dual container |

(README §9/§11 must be updated to match — A1.)

### 4.2 Patterns

- **Hit/miss via behavior:** spy the underlying method, call twice, assert
  one invocation.
- **TTL:** `vi.useFakeTimers()`; in-memory expiry boundary is inclusive
  (`expiry <= now`).
- **Redis:** always `FakeRedisClient` (Map + `EX`/`PX`, `failingOps`,
  `raw()`); live integration gated `describe.skipIf(!process.env.REDIS_URL)`.
- **Isolation:** unique keys per test; `globalContainer.unregister(CACHE_STORE_TOKEN)`
  in `afterEach`; `singleFlight.clear()` where flights leak between tests.
- **No mock-theater:** assert stored state (`store.get(...)`, `fake.raw(...)`),
  not just calls.

### 4.3 Coverage

LLD-PLAN §6 ratchet applies: 100% lines/branches/functions at the v3.0 gate.
New Phase-A code ships with tests in the same PR (see §5 acceptance criteria).

---

## 5. Roadmap

Priority framing: v3.0's mission is launch + README truth (LLD-PLAN §0).
Only **A2** (memory safety of a default-ON feature) is arguably
launch-blocking; A3 is a crash bug; A1/A4 are truth/consistency. Phase B/C are
post-launch.

---

### Phase A — Truth & Safety (pre-3.0)

#### A1 — Documentation truth pass — `shipped`

**Problem:** README claims both stores serialize (false), names the wrong
physical tag prefix, undercounts tests, and omits Tier-1 features
(`@CachePut`, `condition`/`unless`, single-flight exports) from the API
reference.

**Deliverable (docs only):**

1. `src/cache/README.md`
   - §4 "Values must be JSON-serializable (both built-in stores serialize)" →
     state that **Redis serializes JSON; in-memory stores references** and
     explain the mutation consequence.
   - §10.5 "Both stores round-trip through JSON" → same correction.
   - §6.6 tag layout → physical Redis key `cache:__bc:tag:<tag>`.
   - §9/§11 test references → 31 + 31 + 8 cases, add `tier1.test.ts`/`tier2.test.ts`.
   - Add `@CachePut` + `condition`/`unless` documentation (new §6.x).
   - §11 API reference: add `CachePut`, `CacheableOptions`, `CachePutOptions`,
     `CacheEvictOptions`, `singleFlight`, `SingleFlight`,
     `SingleFlightReentrancyError`, `stableStringify`; update
     `Cacheable / CacheEvict` row.
   - §12 decisions: add Tier-1 locked decisions (single-flight default-ON,
     no value envelope, tags RMW, commons layer).
2. `docs/docs/modules/cache/*.md` — mirror the Tier-1 coverage and correct
   store-semantics claims; update `stores.md` "No eviction policy" once A2
   ships.
3. `CHANGELOG.md` — entries for A2/A3/A4 under `[3.0.0] - Unreleased`.

**Acceptance:** every factual claim in README/docs is traceable to code;
`rg "15 cases|both built-in stores serialize"` returns nothing.

#### A2 — In-memory LRU (`maxEntries`, opt-in) — `shipped`

**Problem:** the default-ON store is an unbounded `Map`; unique unread keys
grow until OOM (G7).

**Developer API:**

```ts
new InMemoryCacheStore({ maxEntries?: number })   // omitted = unlimited (⚖️9)
.enableCache({ maxEntries: 10_000 })              // sugar for the default store
bootstrapCache({ maxEntries: 10_000 })            // non-builder sugar (⚖️17)
```

- `maxEntries` must be a positive integer → else `CacheError`.
- Mutually exclusive with `store`/`client` in `enableCache`.
- Implemented with zero dependencies (Map insertion order doubles as LRU
  order) — `lru-cache`/`mnemonist` rejected to keep the core dependency-free.

**Internal design:**

```
get(key):
  entry = map.get(key)
  if miss -> undefined
  if expired -> delete, undefined
  touch(key)                 // LRU recency: delete + re-set
  return entry.value

set(key, value, ttl):
  if map.has(key): delete(key)            // refresh recency, no eviction
  else if maxEntries && map.size >= maxEntries:
      evictOldest()                       // map.keys().next().value -> delete
  map.set(key, { value, expiry })

touch(key): const e = map.get(key); map.delete(key); map.set(key, e)
```

- Map insertion order = LRU order; all operations O(1).
- Eviction is **approximate LRU** (recency updated on access), standard and
  sufficient.
- Tag-index keys also count toward `maxEntries` (they are ordinary entries);
  document that a very large tag population consumes capacity.
- Expired-but-unread entries can occupy capacity until evicted as LRU; no
  background sweeper (unchanged).

**Edge cases:** `maxEntries: 1`; updating an existing key at capacity (no
eviction); TTL interplay; `maxEntries` omitted = unlimited; tag-index keys
counted; invalid values (`0`, `-1`, `1.5`, `NaN`) throw.

**Tests:** LRU order (evict least-recently-used, not oldest-inserted after a
touch), update-refreshes-recency, capacity+TTL, unlimited default, validation,
builder conflict + happy path.

**Files:** `stores/in-memory-cache.store.ts`, `builder.ts`, `bootstrap.ts`,
`BootifyApp.ts` docs, README §5.1/§10.6, tests.

#### A3 — Redis error-listener crash fix — `shipped`

**Problem:** the old default-client factory attached
`client.on('error', (e) => { throw new CacheConnectionError(...) })`. A throw
inside an EventEmitter listener is an uncaught exception → process crash (G2).

**Developer API:**

```ts
new RedisCacheStore({ client, onError?: (error: Error) => void })
```

- Default: no-op (never throws, never crashes). Users pass `onError` for
  logging/metrics; ops still throw `CacheError` on failure (fail-fast is
  preserved — the listener only records).

**Internal design:**

- `CacheRedisClient` gains optional
  `on?(event: 'error', listener: (error: Error) => void): void`.
- `RedisCacheStore` tracks `private lastError: Error | null`; it attaches
  `client.on?.('error', handler)` (constructor for a direct client, first use
  for a factory); the handler stores the error and calls `onError` (guarded
  try/catch).
- `healthCheck()` returns `false` while `lastError` is set; a successful op or
  ping clears it.
- The old `createDefaultRedisClient` (and its throwing listener) is deleted
  with A5 — the store owns error handling.

**Tests:** fake client with `on` capture → emit error → `onError` called,
`healthCheck()` false, no throw; successful op clears `lastError`.

**Files:** `stores/redis-client.ts`, `stores/redis-cache.store.ts`,
`src/testing/fakes.ts` (add `on`/`emit`), tests.

#### A4 — TTL normalization — `shipped`

**Problem:** `0`/negative TTL behaves differently across stores (G3):
in-memory negative → immediately expired; Redis negative → forever.

**Contract (locked):** `undefined`/`0` → no expiry; positive → seconds;
negative → `CacheError('ttlInSeconds must be >= 0')`.

**Internal design:** new internal helper
`normalizeTtlInSeconds(ttl?: number): number | undefined` in
`src/cache/ttl.ts` (not exported from the barrel), used by both stores;
`ICacheStore.set` doc comment updated.

**Tests:** both stores × (`undefined`, `0`, positive, negative); helper unit
cases.

**Files:** `src/cache/ttl.ts` (new), both stores, `cache.types.ts` docs,
README, tests.

#### A5 — App-owned Redis client — `shipped`

**Problem:** the framework created Redis connections
(`createDefaultRedisClient` + `enableCache({ redisUrl })`) and carried an
optional ioredis peer dependency. Connection lifecycle, pooling and config
belong to the app.

**Developer API:**

```ts
new RedisCacheStore({ client, clientFactory?, onError? })
.enableCache({ client: ioredisInstance })          // wrap an owned client
// removed: enableCache({ redisUrl }), createDefaultRedisClient, ioredis peer
```

**Internal design:**

- `CacheRedisClient` + `CacheRedisClientFactory` remain; `createDefaultRedisClient`
  and the lazy `import('ioredis')` are deleted.
- `RedisCacheStore`: exactly one of `client` / `clientFactory`; neither →
  `CacheConnectionError` at construction (fail-fast). A direct client gets the
  A3 error listener attached immediately; the factory path attaches on first
  use.
- `package.json`: ioredis removed from `peerDependencies` and
  `peerDependenciesMeta`.
- Consistency: auth's `RedisTokenStorage` already takes an injected
  `RedisClient` interface — same pattern, no change there.

**Tests:** direct client works; missing client throws at construction; builder
`{ client }` wraps without a second connection; `redisUrl` no longer exists in
the type surface.

**Files:** `stores/redis-client.ts`, `stores/redis-cache.store.ts`,
`builder.ts`, `BootifyApp.ts` docs, `package.json`, README, tests.

#### A6 — `unless(result, args)` — `shipped`

**Problem:** `unless` only received the result, so "skip storing if empty
*and* the caller is an admin" required a closure hack.

**Developer API (non-breaking):**

```ts
unless?: (result: any, args: any[]) => boolean | Promise<boolean>
```

`condition(args)` is unchanged. Both `@Cacheable` and `@CachePut` pass args as
the second parameter. The reviewer's `(ctx) => …` object shape was rejected
for now (cosmetic; a v4 candidate).

**Tests:** `unless` receives result + args; async variants; existing
single-parameter usages unchanged.

**Files:** `decorators.ts`, README, tests.

---

### Phase B — Production batteries (v3.1; B1/B2 pulled forward into 3.0.0)

#### B1 — Atomic tag invalidation via Redis Sets — `shipped`

**Problem:** tag indexes are JSON arrays updated with read-modify-write; two
instances can lose appends (G8/G6). Index operations are O(n).

**Developer API (additive, optional):**

```ts
interface CacheRedisClient {
  // ...existing get/set/del/ping
  sAdd?(key: string, ...members: string[]): Promise<number>
  sMembers?(key: string): Promise<string[]>
  expire?(key: string, seconds: number): Promise<number>
}

interface ICacheStore {
  // ...existing
  sAdd?(key: string, ...members: string[]): Promise<void>
  sMembers?(key: string): Promise<string[]>
  expire?(key: string, seconds: number): Promise<void>
}
```

**Internal design:**

- `RedisCacheStore` implements the set primitives by delegating to the client
  when the methods exist; otherwise leaves them undefined (capability
  detection).
- `CacheService` tag strategy: if `typeof store.sAdd === 'function'` → use
  sets (`SADD` + `EXPIRE`), no mutex needed (atomic); else fall back to the
  current RMW + mutex. Custom stores without set support keep working
  unchanged.
- `flushTags` set path: `SMEMBERS` → `DEL` each member → `DEL` index.
- **Migration:** old index keys are JSON strings. A `SADD` against a string
  key raises `WRONGTYPE`; on that error, `DEL` the key and retry once (the
  index self-heals; entries remain reachable only via their own TTL).
- Multi-instance correctness now holds for Redis; in-memory remains exact via
  the mutex.
- **Lua rejected** as the primary mechanism: it requires `eval` on the client
  surface, which minimal clients/fakes lack, and Sets are natively atomic for
  this shape. A Lua variant can ride the same optional capability later.

**Acceptance/tests:** set-path append/flush round-trip; fallback path
unchanged; WRONGTYPE self-heal; `FakeRedisClient` gains set ops; concurrent
appends across two `CacheService` instances sharing one client.

#### B2 — Batch operations (`mget` / `mset`) — `shipped`

**Problem:** bulk warm/evict paths do N round trips.

**Developer API:**

```ts
class CacheService {
  mget<T>(keys: string[]): Promise<(T | undefined)[]>
  mset(entries: Array<{ key: string; value: any; ttlInSeconds?: number; tags?: string[] }>): Promise<void>
}

interface ICacheStore {
  mget?<T>(keys: string[]): Promise<(T | undefined)[]>
  mset?(entries: Array<{ key: string; value: any; ttlInSeconds?: number }>): Promise<void>
}
```

**Internal design:** `CacheService` delegates when the store implements the
optional methods, else falls back to `Promise.all(get)` / sequential `set`
(with tag indexing per entry). `RedisCacheStore` uses client `mget` when
available (else `Promise.all`) and a `MULTI`/pipeline for `mset` when the
client supports it; otherwise sequential `SET`. Tags on `mset` go through the
normal tag path (Sets when available — B1). `mget` preserves input order 1:1.
Failure semantics: fail-fast — the call rejects with the first `CacheError`;
the fallback path may have written earlier entries (documented, no
transaction guarantee).

**Acceptance/tests:** fallback equivalence (same observable state as loops);
Redis path via extended `FakeRedisClient`; tags indexed for every entry.

#### B3 — Pluggable serializers (both stores) — `planned`

**Problem:** JSON-only Redis values destroy `Date`/`Map`/`Set`; in-memory
stores references while Redis clones (G1). The auth module already proves the
pattern (`RedisTokenStorage.serializer`).

**Developer API:**

```ts
export interface CacheSerializer {
  serialize(value: unknown): string
  deserialize<T>(raw: string): T
}

new RedisCacheStore({ serializer?: CacheSerializer })        // default: JSON
new InMemoryCacheStore({ serializer?: CacheSerializer })     // default: none (reference)
```

**Internal design:**

- Shared `jsonSerializer` default for Redis; in-memory uses a
  `referenceSerializer` by default (back-compat) and switches to
  serialize/deserialize round-trips when a serializer is provided — making
  both stores clone-on-read and finally unifiable.
- Recommended user serializers: SuperJSON (`Date`/`Map`/`Set`), msgpack.
- Document that a custom serializer is a data-format contract: changing it
  invalidates existing entries (they will fail to deserialize → treat as miss
  or throw? Decision: deserialize errors throw `CacheError`; users flush on
  format change).

**Acceptance/tests:** Date/Map round-trip with SuperJSON-like fake on both
stores; mutation isolation for in-memory when serializer set; default
behavior unchanged; deserialize failure → `CacheError`.

#### B4 — Observability event hook — `planned`

**Problem:** caches are blind spots; no hit/miss/latency/eviction signals
(G10).

**Developer API:**

```ts
export type CacheEvent =
  | { type: 'hit'; key: string; store: string }
  | { type: 'miss'; key: string; store: string }
  | { type: 'set'; key: string; ttl?: number; tags?: string[]; store: string }
  | { type: 'evict'; key: string; store: string }
  | { type: 'flush-tags'; tags: string[]; deleted: number; store: string }
  | { type: 'flight-leader' | 'flight-follower'; key: string }
  | { type: 'error'; key?: string; error: Error; store: string }

.enableCache({ onEvent?: (event: CacheEvent) => void })   // or a CACHE_EVENTS_TOKEN sink
```

**Internal design:** a `CacheEventSink` token (`CACHE_EVENTS_TOKEN`) bound
by `enableCache` when `onEvent` is provided; `CacheService` takes an optional
injected sink and emits at get/set/del/remember/flushTags boundaries; flight
events come from a small hook on the single-flight singleton (optional,
key-only). Sink failures are swallowed (observability must never break
caching). `@bootifyjs/observability` (LLD-PLAN §8) consumes the sink for
Prometheus counters/histograms — the cache module stays dependency-free.

**Acceptance/tests:** every event type emitted with correct metadata; sink
throw does not break the cache path; no sink → zero overhead beyond a guard.

#### B5 — Cache warming — `planned`

**Problem:** cold caches pay the latency penalty on first traffic.

**Approach (docs-first):**

1. Document the pattern now:
   ```ts
   .beforeStart(async () => {
     await cache.remember('config:flags', 300, loadFlags)
   })
   ```
2. Optional API only if demand appears:
   `enableCache({ warmup?: Array<{ key; loader; ttl?; tags? }>, warmupFailure?: 'warn' | 'throw' })`
   executed after store binding, before `start()`; default `'warn'`.

**Acceptance/tests:** pattern documented with an integration example; if the
API lands: loaders run in order, failures honor the policy, warmup does not
block beyond configured behavior.

---

### Phase C — Scale (v4, demand-driven)

#### C1 — Distributed single-flight — `planned`

**Problem:** process-local single-flight degrades to N executions across N
instances (G9); locked as deferred in Tier-1 ⚖️4.

**Developer API:**

```ts
export interface DistributedLockProvider {
  tryAcquire(key: string, ttlMs: number): Promise<boolean>
  release(key: string): Promise<void>
  wait(key: string, timeoutMs: number): Promise<void>   // resolve when released or timeout
}

.enableCache({ client, distributedFlight?: { lockTtlMs?: number; waitTimeoutMs?: number } })
```

**Internal design:**

- Redis provider: `SET cache:flight:<key> <token> NX PX <lockTtlMs>` for
  leadership; followers `wait()` via a pub/sub channel
  (`cache:flight:done:<key>`) with polling fallback (25ms) and a hard timeout.
- Leader publishes on release; followers that time out proceed locally
  (availability over strictness — degraded stampede, never a deadlock).
- Lock TTL is a safety net (max flight duration + buffer); if it expires
  mid-flight, a second leader may run — document at-least-once semantics.
- Integrates with the scheduler's distributed-lock roadmap item (one provider
  interface, two consumers).
- Failure of Redis → fall back to local single-flight (never fail requests
  because the flight coordinator is down).

**Risks:** clock skew, partition behavior, lock expiry mid-flight (duplicate
execution), pub/sub message loss (poll fallback covers).

**Acceptance/tests:** two simulated instances against one `FakeRedisClient`
→ one execution; wait timeout → local execution; provider errors → local
fallback; lock released on failure.

#### C2 — Multi-level caching (`CompositeCacheStore`) — `planned`

**Problem:** L1 speed + L2 sharing requires manual plumbing today.

**Developer API:**

```ts
new CompositeCacheStore({ l1: ICacheStore, l2: ICacheStore, l1Ttl?: number })
```

**Internal design:**

- `get`: L1 hit → return; L1 miss → L2 → on hit backfill L1 with
  `min(l1Ttl, remainingL2Ttl)` (remaining TTL requires a store capability;
  otherwise use `l1Ttl ?? 60`).
- `set`: L2 first (source of truth), then L1.
- `del`: both; publish `cache:invalidate` (Redis pub/sub) so other instances
  drop their L1 copy.
- `flushTags`: union of both stores' flushes; L1 entries are bounded by
  `l1Ttl` as the safety net when pub/sub is unavailable.
- `healthCheck`: L2 critical (`l1 && l2`).
- Consistency model documented: L1 is best-effort; cross-instance
  invalidation is eventually consistent (pub/sub or `l1Ttl`).

**Acceptance/tests:** L1 hit / L2 fallback + backfill; write-through order;
del propagation; tag flush across tiers; pub/sub-less staleness bounded by
`l1Ttl`.

#### C3 — Refresh-ahead / stale-while-revalidate — `planned`

**Problem:** cold expiry spikes latency for the caller who pays the miss
(named in LLD-PLAN §8).

**Developer API (option on `@Cacheable` / `remember`):**

```ts
@Cacheable({ key: 'stats', ttl: 300, staleWhileRevalidate: 60 })
```

**Internal design:**

- When enabled, store a **per-entry envelope** `{ value, softExpiry,
  hardExpiry }` under the entry key (an explicit, documented exception to
  Tier-1 ⚖️7 "no value envelope" — applied only to SWR-enabled entries).
- Read: `now < softExpiry` → fresh; `softExpiry <= now < hardExpiry` → return
  stale immediately and trigger a background refresh through single-flight
  (one refresher); `now >= hardExpiry` → synchronous miss.
- `hardExpiry = softExpiry + staleWhileRevalidate`; physical store TTL =
  `hardExpiry`.
- Back-compat: entries without an envelope are treated as fresh until their
  physical TTL (no SWR); mixed states are safe.
- Refresh failures are logged (B4 event) and the stale value keeps serving
  until `hardExpiry`.

**Acceptance/tests (fake timers):** fresh/stale/hard phases; one background
refresh for N concurrent stale reads; refresh failure keeps serving stale;
envelope back-compat.

---

### Decision log (locked)

| # | Decision | Source |
|---|---|---|
| ⚖️1 | Single-flight default-ON in `@Cacheable` (`singleFlight: false` escape) | Tier-1 |
| ⚖️2 | Reentrancy guard via ALS → typed error (no deadlock) | Tier-1 |
| ⚖️3 | Stale-delete guard on settle | Tier-1 |
| ⚖️4 | Distributed single-flight deferred to the scheduler lock provider | Tier-1 → C1 |
| ⚖️5 | Commons layer (`bootifyjs/commons`) for single-flight + stable stringify | Tier-1 |
| ⚖️6 | Tags via store RMW + per-tag mutex; atomic Sets fast-path deferred | Tier-1 → B1 |
| ⚖️7 | No value envelope; tag index lives in `__bc:tag:*` keys | Tier-1 → C3 (SWR exception) |
| ⚖️8 | Phase A executes pre-3.0; B (v3.1) and C (v4) are post-launch — B1/B2 pulled forward into 3.0.0 | This doc |
| ⚖️9 | `maxEntries` is opt-in; unlimited stays the v3.0 default | This doc |
| ⚖️10 | Serializers apply to **both** stores (Phase B), default behavior unchanged | This doc |
| ⚖️11 | Negative TTL is an error; `0`/`undefined` mean no expiry | This doc (A4) |
| ⚖️12 | Redis error listener never throws; `onError` callback + health flag | This doc (A3) |
| ⚖️13 | README/docs are part of the contract — truth passes ship with behavior changes | This doc (A1) |
| ⚖️14 | **Apps own the Redis client** — no `redisUrl`, no `createDefaultRedisClient`, no ioredis dependency | This doc (A5) |
| ⚖️15 | `unless` gains an `args` second parameter (`condition(args)` unchanged) | This doc (A6) |
| ⚖️16 | Distributed single-flight stays **deferred** (C1, demand-driven) — not built now | This doc |
| ⚖️17 | `bootstrapCache({ maxEntries })` sugar for non-builder apps | This doc (A2) |

---

## 6. Appendices

### 6.1 API cheat sheet

```ts
// wiring
createBootifyApp().enableCache({ store | client | maxEntries })
createBootifyApp().disableCache()
bootstrapCache({ maxEntries? })

// decorators
@Cacheable({ key, ttl?, keyBuilder?, hashArgs?, tags?, condition?, unless?, singleFlight? })
@CachePut({ key, ttl?, keyBuilder?, hashArgs?, tags?, condition?, unless? })
@CacheEvict({ key?/keyBuilder?/tags? })

// facade
cache.get / set / put / del / mget / mset / remember / rememberForever / flushTags

// keys + flight
generateCacheKey(base, args, { hashArgs? })
singleFlight.run(key, fn)

// stores
new InMemoryCacheStore({ maxEntries? })
new RedisCacheStore({ client, clientFactory?, onError? })
```

### 6.2 Options reference

| Option | Decorators | Default | Notes |
|---|---|---|---|
| `key` | Cacheable/Put/Evict | — | Required unless `keyBuilder` |
| `keyBuilder` | Cacheable/Put/Evict | — | Non-empty string or `CacheError` |
| `hashArgs` | Cacheable/Put/Evict | `false` | PII-safe key hashing |
| `ttl` | Cacheable/Put | no expiry | seconds; see §2.7 |
| `tags` | Cacheable/Put/Evict | — | static or args-derived |
| `condition` | Cacheable/Put | — | bypass before read/flight/write |
| `unless` | Cacheable/Put | — | `(result, args)`; skip storing, still return |
| `singleFlight` | Cacheable | `true` | `false` for side-effectful methods |

### 6.3 Error codes

| Error | Code | Trigger |
|---|---|---|
| `CacheError` | `CACHE_ERROR` | store op failure, key/keyBuilder misuse, invalid `maxEntries`/TTL |
| `CacheConnectionError` | `CACHE_CONNECTION` | no client/factory provided, factory failure |

### 6.4 LLD item → version map

| Item | Version | Status |
|---|---|---|
| Tier-1 (single-flight, remember, @CachePut, tags, conditionals) | 3.0.0 | shipped |
| A1 doc truth pass | 3.0.0 | shipped |
| A2 `maxEntries` | 3.0.0 | shipped |
| A3 Redis error-listener fix | 3.0.0 | shipped |
| A4 TTL normalization | 3.0.0 | shipped |
| A5 App-owned Redis client | 3.0.0 | shipped |
| A6 `unless(result, args)` | 3.0.0 | shipped |
| B1 Atomic Redis tags | 3.0.0 | shipped (pulled forward) |
| B2 `mget`/`mset` | 3.0.0 | shipped (pulled forward) |
| B3–B5 | 3.1 | planned |
| C1–C3 | 4.x | planned |

### 6.5 Gotchas index

The authoritative user-facing gotcha list lives in `src/cache/README.md` §10.
Engineering-relevant ones: miss sentinel, eviction-key quoting
(`dashboard::"u1"`), lazy in-memory expiry, per-process stores, tag-prefix
reservation (`__bc:`), store failure throws, `Date`/`Map` degradation under
JSON.
