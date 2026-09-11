# BootifyJS Cache (`bootifyjs/cache`)

> **The module bible** — everything about the caching system: the mental model,
> the API, the internals, and every gotcha. Written so a newcomer can go from
> zero to confident in one read, and experienced users can treat it as the
> reference for this module.

---

## 1. The 30-second mental model

```
@Cacheable / @CachePut / @CacheEvict   ← decorators on your service methods
        │  (build a key, check the cache, call your method on miss)
        ▼
CacheService                    ← thin facade (get/set/del/remember/tags/batch)
        │  (resolves the bound store via the DI token CACHE_STORE_TOKEN)
        ▼
ICacheStore                     ← the contract every backend implements
        ├── InMemoryCacheStore  ← default. Map + TTL (+ opt-in LRU). Per-process.
        └── RedisCacheStore     ← optional. Real Redis, APP-OWNED client.
```

Three sentences:

1. **A store** holds key→value pairs with optional TTLs. The default is an
   in-memory Map; swap in Redis by binding one token.
2. **`CacheService`** is the tiny facade everything goes through.
3. **Decorators** (`@Cacheable`, `@CachePut`, `@CacheEvict`) turn "check cache
   → run method → store result" into one line on your service methods.

Everything below expands on this picture.

---

## 2. Quick start

### 2.1 Store-only (no decorators)

```ts
import { bootstrapCache, CacheService } from 'bootifyjs/cache'

bootstrapCache()               // binds InMemoryCacheStore (no-op if you bound one)

const cache = container.resolve(CacheService)
await cache.set('greeting', { text: 'Hello' }, 60)   // TTL: 60 seconds
await cache.get('greeting')                          // { text: 'Hello' }
await cache.del('greeting')                          // gone
```

### 2.2 Decorators (the way you'll actually use it)

```ts
import { Service, Cacheable, CacheEvict } from 'bootifyjs'

@Service()
export class ReportService {
  @Cacheable({ key: 'report.monthly', ttl: 300 })   // cached 5 minutes
  async monthly(userId: string, month: string) {
    // ... expensive query ...
    return { rows: 42, month }
  }

  @CacheEvict({ key: 'report.monthly' })
  async regenerate(userId: string, month: string) {
    // runs first; on SUCCESS the cached entries for these args are dropped
  }
}
```

Call `monthly('u1', '2026-09')` twice — the second call is served from the
cache and the expensive body never runs. Call `regenerate('u1', '2026-09')`
and the next `monthly` recomputes.

---

## 3. Architecture

```
src/cache/
├── cache.types.ts            # CACHE_STORE_TOKEN, ICacheStore contract
├── cache.service.ts          # CacheService facade (tags, remember, batch)
├── decorators.ts             # @Cacheable, @CachePut, @CacheEvict, generateCacheKey
├── bootstrap.ts              # bootstrapCache() — binds the default store
├── ttl.ts                    # shared TTL normalizer (internal)
├── errors.ts                 # CacheError, CacheConnectionError
└── stores/
    ├── in-memory-cache.store.ts   # the default (Map + TTL + opt-in LRU)
    ├── redis-cache.store.ts       # real Redis (app-owned client)
    └── redis-client.ts            # CacheRedisClient contract (optional set/batch ops)
```

**The DI token.** The store is resolved through
`CACHE_STORE_TOKEN = Symbol.for('CacheStore')`. `CacheService` receives the
store via constructor injection:

```ts
@Service()
export class CacheService {
  constructor(@Autowired(CACHE_STORE_TOKEN) private readonly store: ICacheStore) {}
  get / set / del / remember / flushTags / mget / mset   // facade over the store
}
```

**Why a token?** Binding is runtime configuration: `@Service` classes never
know which backend they use. Bind Redis, and every decorator in the app
transparently uses Redis.

---

## 4. The contract: `ICacheStore`

```ts
export interface ICacheStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: any, ttlInSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  /** Optional liveness probe (used by GET /ready). */
  healthCheck?(): Promise<boolean>

  // Optional capability extensions (stores that omit them get fallbacks):
  supportsTagSets?(): boolean | Promise<boolean>   // atomic tag indexes (B1)
  sAdd?(key: string, ...members: string[]): Promise<void>
  sMembers?(key: string): Promise<string[]>
  expire?(key: string, seconds: number): Promise<void>
  mget?<T>(keys: string[]): Promise<(T | undefined)[]>   // batch read (B2)
  mset?(entries: Array<{ key: string; value: any; ttlInSeconds?: number }>): Promise<void>
}
```

Writing your own backend is ~20 lines:

```ts
import { ICacheStore } from 'bootifyjs/cache'

export class MemcachedStore implements ICacheStore {
  async get<T>(key: string) { /* ... */ }
  async set(key: string, value: any, ttlInSeconds?: number) { /* ... */ }
  async del(key: string) { /* ... */ }
  async healthCheck() { return true }
}

// bind it (before bootstrapCache runs — it only fills an empty token)
container.register(CACHE_STORE_TOKEN, { useClass: MemcachedStore, override: true })
```

Contract notes:

- `get` returns **`undefined` for a miss** — this is load-bearing (see
  gotcha §10.2).
- TTL is always in **seconds**. `undefined`/`0` mean no expiry; a negative TTL
  throws `CacheError` (fail fast).
- Values must be JSON-serializable **for Redis** — see the store-semantics
  note below.

---

## 5. The stores

### 5.1 `InMemoryCacheStore` (default)

A `Map<string, { value, expiry }>`. No dependencies, per-process.

TTL semantics:

- `set(k, v, 60)` → expiry = `Date.now() + 60_000` ms.
- A key is expired when `expiry <= Date.now()` — i.e. **at** the timestamp
  (inclusive boundary, not one tick late).
- Expired keys are evicted lazily on `get` — there is no background sweeper,
  and memory is only reclaimed when the key is read. ⚠ See gotcha §10.6.
- **Opt-in LRU bound:** `new InMemoryCacheStore({ maxEntries: 10_000 })`
  evicts the least-recently-used entry at capacity (reads refresh recency).
  Omitted → unlimited. Also available as `enableCache({ maxEntries })` or
  `bootstrapCache({ maxEntries })`. ⚠ See gotcha §10.6.

**Store semantics:** in-memory stores the value **by reference** — mutating a
retrieved object mutates the cache. `RedisCacheStore` serializes JSON, so
retrieved values are copies. Don't mutate cached objects; treat them as
read-only. (A pluggable serializer for both stores is on the roadmap.)

### 5.2 `CacheService` — the facade beyond get/set/del

```ts
// The imperative twin of @Cacheable (Rails fetch / Laravel remember):
await cache.remember('stats:u1', 300, async () => expensiveCompute())  // single-flight built in
await cache.rememberForever('config:app', loader)

// Group invalidation (see §6.8):
await cache.flushTags('user:42')

// Write-through with tags:
await cache.set('profile:u1', profile, 300, [`user:u1`])

// Batch read/write (B2) — one MGET round trip on Redis:
await cache.mget(['stats:u1', 'stats:u2'])
await cache.mset([
  { key: 'stats:u1', value: one, ttlInSeconds: 300, tags: ['stats'] },
  { key: 'stats:u2', value: two, ttlInSeconds: 300, tags: ['stats'] },
])
```

### 5.3 `RedisCacheStore`

Real Redis, with an **app-owned client** (the framework never creates
connections):

```ts
import Redis from 'ioredis'
import { RedisCacheStore } from 'bootifyjs/cache'

const client = new Redis('redis://localhost:6379')   // you own the lifecycle
const store = new RedisCacheStore({
  client,
  onError: (error) => logger.warn('redis error', { error }),   // optional
})
```

- **Keys are namespaced** under `cache:` — `store.set('user:1', ...)` writes
  Redis key `cache:user:1`. Your keys never collide with other data in a
  shared Redis. Tag indexes live at `cache:__bc:tag:<tag>`.
- **TTL** is passed as `SET key value EX <seconds>`; `0`/`undefined` skip EX.
- **Client shape:** any object with
  `{ get, set(key, value, mode?, duration?), del, ping?, on? }` works
  (`CacheRedisClient` interface) — ioredis, node-redis wrappers, or test
  fakes. ioredis is an *example*, not a dependency: there is no `redisUrl`
  option and no lazy client creation.
- **Error events** (`client.on('error')`) are recorded and forwarded to
  `onError` — they never throw from the listener. `healthCheck()` reports
  unhealthy while an error is recorded; a successful ping/op clears it.
- **Atomic tags (B1):** when the client exposes `sAdd`/`sMembers`/`expire`,
  tag indexes use Redis Sets (no lost appends across instances). Otherwise
  the facade falls back to read-modify-write + an in-process mutex.
- **`healthCheck()`** pings the client; used by the built-in `GET /ready`
  endpoint (raced against a 500 ms timeout).

### 5.4 Errors

```ts
CacheError                 // base — wraps client failures with the operation:
                           //   "Redis GET failed for 'user:1': <cause>"
CacheConnectionError       // no client/factory provided, or factory failure
```

Both extend `BootifyError` with stable `code`s (`CACHE_ERROR`,
`CACHE_CONNECTION`). A failing store **throws** — it never silently degrades
to a cache miss, because silently skipping the cache would mask outages.

---

## 6. The decorators, end to end

### 6.1 `@Cacheable({ key, ttl? })`

What the decorator actually does (the wrapped method):

```
1. key = generateCacheKey(options.key, methodArguments)
2. value = await cacheService.get(key)
3. if value !== undefined → return it            (cache HIT)
4. result = await originalMethod(...args)        (cache MISS)
5. await cacheService.set(key, result, ttl)
6. return result
```

Rules that follow from this:

- The method **must be async** (the wrapper awaits it).
- A method that returns **`undefined` always misses** — `undefined` is the
  miss sentinel. Return `null` (or anything else) if "nothing" is a valid
  cached outcome.
- Arguments become part of the key, so different arguments = different
  entries automatically.
- TTL omitted → stored without expiry (in-memory: forever; Redis: no EX).

### 6.2 The key format (`generateCacheKey`, exported)

```
<baseKey>::<stable(arg1)>:<stable(arg2)>:...
```

Arguments are serialized **order-stably** — object keys are sorted
recursively, so logically-equal arguments always map to the same key:

```ts
import { generateCacheKey } from 'bootifyjs/cache'

generateCacheKey('report.monthly', ['u1', '2026-09'])
// 'report.monthly::"u1":"2026-09"'

generateCacheKey('hello.stats', [])
// 'hello.stats::'

// property order does NOT matter:
generateCacheKey('k', [{ name: 'x', role: 'admin' }])   // k::{"name":"x","role":"admin"}
generateCacheKey('k', [{ role: 'admin', name: 'x' }])   // SAME key
```

**Big object arguments are hashed automatically.** When the serialized key
would exceed 256 characters, it becomes `baseKey::sha256:<64-hex-digest>` —
so a 10 KB payload still yields a ~90 character key:

```ts
generateCacheKey('report.monthly', [{ blob: 'x'.repeat(4096) }])
// 'report.monthly::sha256:9f2a...c1d'   (deterministic — same payload, same key)
```

Design consequences:
- **Deterministic**: same payload → same key; different payload → different key.
- **Unreadable**: hashed keys don't show their contents in `redis-cli` — keep
  the *natural* key (an id) as an argument when you need readable keys.
- **Still JSON-serializable**: values must remain serializable; hashing only
  compresses the *key*, not the stored value.
- **Circular references** serialize as `"<circular>"` instead of throwing:
  `generateCacheKey('c', [circular])` → `'c::{"self":"<circular>"}'`.

### 6.3 Customizing the key behavior

Three levels of control, from light to absolute:

**a) `hashArgs: true` — always hash the arguments portion.** Use when
arguments contain sensitive values (PII, tokens) that must never appear in
Redis keys:

```ts
@Cacheable({ key: 'profile', hashArgs: true, ttl: 300 })
async load(userId: string, ssn: string) { ... }
// key: 'profile::sha256:9f2a...c1d'   — no ssn visible, small key guaranteed
```

Also available programmatically: `generateCacheKey(base, args, { hashArgs: true })`.

**b) `keyBuilder` — full override.** You own the entire key format; the
`key`/hash logic is skipped entirely:

```ts
const productKey = (args: any[]) => `product:${args[0]}`   // readable, no quoting

class CatalogService {
  @Cacheable({ keyBuilder: productKey, ttl: 300 })
  async getProduct(productId: string) { ... }

  @CacheEvict({ keyBuilder: productKey })   // SAME builder → keys match
  async updateProduct(productId: string) { ... }
}
// keys: product:p-42 — readable in redis-cli
```

Share the builder as a module constant so `@Cacheable` and `@CacheEvict`
always agree. A `keyBuilder` must return a **non-empty string** or the method
rejects with `CacheError`.

**c) `generateCacheKey` options** — programmatic use mirrors the decorators:
`generateCacheKey(base, args, { hashArgs: true })`.

**Rules:**
- `keyBuilder` wins over everything (ignore `key`/`hashArgs` when present)
- provide `key` OR `keyBuilder` — both absent → `CacheError`
- whatever the level, `@Cacheable` and `@CacheEvict` must resolve the SAME
  key for the same arguments — share the builder, never duplicate it inline

### 6.4 `@CacheEvict({ key })`

Wraps the method: **run the original method first; on SUCCESS, delete** the
entry for `generateCacheKey(options.key, args)`.

- If the method throws → **no eviction** (deliberate: a failed writeback
  shouldn't wipe a still-valid cache entry).
- Evicts only the entry matching the same arguments. For a base key you
  mutate with *different* arguments, you want `@CacheEvict` on the mutating
  method with the same argument shape — or manual eviction (§7).

### 6.5 `@CachePut({ key, ttl? })` — write-through

Always executes the method and stores the result — the "update and cache"
decorator (Spring's `@CachePut`):

```ts
@CachePut({ key: 'product', ttl: 300, tags: ['products'] })
async update(id: string, patch: Patch) {
  return repo.update(id, patch)   // always runs; result cached under product::"id"
}
```

- Runs the method even on a cache hit (unlike `@Cacheable`).
- `condition(args)` bypasses execution *and* storing; `unless(result, args)`
  returns without storing; `undefined` is never stored (miss sentinel).

### 6.6 `condition` / `unless` — conditional caching

Type-safe predicates (no SpEL strings):

```ts
@Cacheable({
  key: 'report',
  ttl: 60,
  condition: (args) => args[0] !== 'admin',        // no read/write for admins
  unless: (result, args) => result.rows === 0,     // run, but don't cache empties
})
async report(userId: string) { ... }
```

- `condition(args)` runs **before** everything: `false` → no read, no
  single-flight join, no write.
- `unless(result, args)` runs **after** the method: `true` → value returned
  but not stored. The `args` parameter lets you combine result and caller
  context (e.g. skip caching admin searches).
- Both may be async.

---

### 6.7 Single-flight (stampede protection)

**The problem:** a hot cache key expires, and N concurrent requests all miss
and all run the expensive method at once — a database stampede.

**The fix:** concurrent callers with the same key share ONE execution. The
first caller becomes the *leader* and runs the method; everyone else waits on
the leader's promise and receives the same value.

```
12:00:00.010  request A → miss → LEADER → runs the DB query (500ms)
12:00:00.011  request B → miss → waits on A's promise
12:00:00.012  request C → miss → waits on A's promise
   ...        4,997 more requests → all wait
12:00:00.500  A finishes → all 5,000 receive the value. DB queries: 1.
```

- **On by default** for every `@Cacheable`. Escape hatch:
  `@Cacheable({ singleFlight: false })` (for methods with side effects that
  every caller must run — but `@Cacheable` methods should be pure reads).
- **Failures are not remembered**: the in-flight entry is removed the moment
  the promise settles. A failed attempt fails everyone waiting on it; the
  *next* caller retries fresh.
- **Wait-room, not warehouse**: the in-flight map holds entries only while
  work is running — it self-cleans and needs no eviction strategy (unlike the
  cache itself, §10.6).
- **Reentrancy is detected**: a loader calling itself with the same key throws
  `SingleFlightReentrancyError` instead of deadlocking.
- The utility is exported for non-cache use too — dedupe OAuth token
  refreshes, rate-limited API calls, config loads:

```ts
import { singleFlight } from 'bootifyjs/commons'

async function getAccessToken() {
  return singleFlight.run('oauth:refresh', async () => refreshFromProvider())
}
```

### 6.8 Tag-based invalidation

Group invalidation without knowing key formulas:

```ts
class UserService {
  @Cacheable({ key: 'profile', ttl: 300, tags: (args) => [`user:${args[0]}`] })
  async profile(userId: string) { ... }

  @CacheEvict({ tags: (args) => [`user:${args[0]}`] })
  async updateEmail(userId: string, email: string) { ... }
}

// elsewhere — kill every entry for this user:
await cache.flushTags('user:42')
```

- Tags may be static (`tags: ['products']`) or args-derived (above).
- Works on ANY store: in-memory, Redis, or your custom store (the facade
  falls back to get/set/del when the store has no set primitives).
- Redis index keys are `cache:__bc:tag:<tag>` (the `__bc:` prefix is
  reserved — don't use it for your own keys).
- `@CacheEvict` accepts `tags` instead of (or alongside) `key`.
- Multi-tag flush is deduplicated: an entry carrying two flushed tags is
  deleted once and counted once.
- **Multi-instance Redis:** when the client exposes `sAdd`/`sMembers`/
  `expire` (ioredis does), tag appends are atomic — no lost updates. Without
  set support, the fallback is read-modify-write under an in-process mutex
  (exact for a single `CacheService` instance; a cross-instance lost-append
  window is possible — use a set-capable client in multi-instance setups).

## 7. ⚠ The eviction key contract (the #1 gotcha)

The cache key embeds **JSON-serialized arguments** — including the quotes
JSON puts around strings:

```ts
@Cacheable({ key: 'dashboard' })
async stats(userId: string) { ... }
// key for userId 'u1':  dashboard::"u1"     ← quotes are part of the key!
```

So manual eviction must reproduce the **exact** key:

```ts
// ✅ correct — matches what @Cacheable computed
await cache.del(`dashboard::${JSON.stringify(userId)}`)

// ❌ wrong — misses by the missing quotes
await cache.del(`dashboard::${userId}`)
```

**Tip:** export the eviction through a service method (or the `@CacheEvict`
decorator) instead of hand-building keys at call sites. The GoalSetter POC
uses `cache.del(\`dashboard::\${JSON.stringify(userId)}\`)` in its mutating
services — see `goal-setter/src/modules/*/service.ts` for the pattern.

---

## 8. Wiring & lifecycle

### 8.1 The builder way (recommended — default-ON)

```ts
const app = await createBootifyApp()   // ← that's it. Caching is ON.
  .useControllers(controllers)
  .build()
```

`BootifyApp.build()` binds an `InMemoryCacheStore` automatically — into the
app container AND the global container (the decorator resolution path) — and
eagerly resolves `CacheService`, so a broken binding fails at **startup**,
never on the first cached request.

Customize with one call:

```ts
.enableCache({ store: myStore })                 // A. your own ICacheStore
.enableCache({ client: myRedisClient })          // B. your Redis client (wrapped, app-owned)
.enableCache({ maxEntries: 10_000 })             // C. bounded default store (LRU)
.disableCache()                                  // opt out entirely
```

Validation is fail-fast at build (`ConfigValidationError`):
- more than one of `store`/`client`/`maxEntries` → error
- `client` without `get`/`set`/`del` → error
- invalid `maxEntries` (not a positive integer) → `CacheError` at build

There is **no `redisUrl` option**: the framework never creates Redis
connections. Construct the client yourself and pass it as `client` (or
provide a complete `store`).

**`disableCache()` semantics:** the framework binds nothing. A store YOU
registered manually stays yours and keeps working; a `@Cacheable` call with
nothing bound throws an actionable `CacheError` (telling you about
`enableCache`/`disableCache`) — never a raw `ServiceNotFoundError`.

### 8.2 The manual way (`bootstrapCache()` — non-builder code)

For apps that don't use `createBootifyApp()` (pure-DI scripts, workers):

```ts
import { bootstrapCache } from 'bootifyjs/cache'
bootstrapCache()                       // binds InMemoryCacheStore only if the token is empty
bootstrapCache({ maxEntries: 1_000 })  // …or a bounded default (LRU)
```

- **Idempotent**: call twice, second is a no-op.
- **User-bound wins**: if `CACHE_STORE_TOKEN` already has a store, no-op.
- **Silent**: no console output.
- Returns an `unbootstrap()` that unbinds — for tests/HMR.

### 8.3 Two containers, one store

Decorators resolve `CacheService` from the **global** container at call
time (§ design trade-off), while services injected through the app
container resolve there. The builder binds the **same store instance into
both** so every path agrees. If you bind manually, do the same (or rely on
the builder's mirroring):

```ts
container.register(CACHE_STORE_TOKEN, { useFactory: () => store, override: true }) // app
container.register(CACHE_STORE_TOKEN, { useFactory: () => store, override: true }) // global
```

**Timing matters:** bind **before** the first `CacheService` resolution —
the resolved singleton freezes its store. The builder handles this by
binding early in `build()`; for manual wiring, bind at startup.

## 9. Testing your cache-using code

The module's own suites (`tests/unit/cache/{cache,tier1,tier2}.test.ts`)
cover stores, decorators, single-flight, tags (both strategies), batch ops
and bootstrap, using the in-memory store and a `FakeRedisClient`. For app
code:

```ts
import { createTestApp } from 'bootifyjs/testing'
import { CACHE_STORE_TOKEN, InMemoryCacheStore } from 'bootifyjs/cache'

const app = await createTestApp({
  controllers,
  setup: (a, testContainer) => {
    testContainer.register(CACHE_STORE_TOKEN, {
      useFactory: () => new InMemoryCacheStore(),   // per-test store
      override: true,
    })
  },
})
```

Patterns that work:

- **Assert the hit/miss** through behavior: spy the underlying method
  (`vi.fn()`), call twice, `expect(spy).toHaveBeenCalledTimes(1)`.
- **Assert eviction** by reading the store directly:
  `expect(await store.get('dashboard::"u1"')).toBeUndefined()`.
- **Deterministic TTL** with `vi.useFakeTimers()` — the in-memory store
  expires at `expiry <= now`, so `vi.advanceTimersByTime(60_000)` expires a
  60 s entry exactly.
- **Per-test isolation:** `InMemoryCacheStore` keyed by unique user ids keeps
  tests independent without clearing between tests.

For Redis store tests, a `FakeRedisClient` (map + TTL semantics + injectable
`failingOps`) is available in `tests/helpers/fakes.ts` — the module's own
Redis suite runs against it, never against a live Redis. Live integration
tests are gated: `describe.skipIf(!process.env.REDIS_URL)`.

---

## 10. Gotchas & FAQ (read this twice)

**10.1 ⚠ `undefined` is the miss sentinel.**
A `@Cacheable` method returning `undefined` never caches. Return `null` or a
value.

**10.2 ⚠ Falsy values cache fine.**
`0`, `''`, `false` are cached and returned correctly — the check is
`!== undefined`, not truthiness.

**10.3 ⚠ The eviction key includes JSON quoting.**
`dashboard::"u1"` not `dashboard::u1` — see §7.

**10.4 ⚠ `@Cacheable` methods must be async.**
The wrapper awaits the original method. A sync method's return value is not
awaited correctly.

**10.5 ⚠ Values are JSON-serializable for Redis; in-memory stores references.**
`RedisCacheStore` round-trips values through JSON: `Date` objects come back as
ISO strings, class instances lose their prototype, `Map`/`Set` degrade.
`InMemoryCacheStore` stores the value by reference — mutating a retrieved
object mutates the cache. Store plain data, treat cached objects as
read-only, and prefer Redis when you need copy semantics.

**10.6 ⚠ In-memory expiry is lazy; bound it with `maxEntries`.**
Expired keys reclaim memory only when read, and the Map has no size limit by
default. A long-running process that generates many unique keys can grow
unbounded. Pass `maxEntries` (`new InMemoryCacheStore({ maxEntries: 10_000 })`,
`enableCache({ maxEntries })`, or `bootstrapCache({ maxEntries })`) to enable
LRU eviction, use Redis (server-side TTL reclamation), or `del` proactively.

**10.7 ⚠ In-memory stores are per-process.**
Multi-instance deployment → in-memory caches are per-instance (fine for
per-request memoization, wrong for shared state). Bind `RedisCacheStore`.

**10.8 ⚠ A store failure throws — no silent pass-through.**
`CacheError` on `get` means your method raises. Redis outages surface as
500s (shaped by the default error handler), not as expensive recomputes.
Decide deliberately: wrap `@Cacheable` methods in try/catch if your app
should degrade to recompute.

**10.9 ⚠ zod defaults don't affect cached method inputs.**
`@Schema` validation runs through JSON Schema (Fastify), so zod
`.default()`/`.coerce()` do not run — defaults belong in your service (the
same rule as controllers).

**10.10 ⚠ Object arguments: order-insensitive, big payloads hashed, customizable.**
`generateCacheKey` sorts object keys recursively and hashes keys over 256
chars — so `{a:1,b:2}` and `{b:2,a:1}` share an entry, and huge payloads
never bloat keys. Prefer natural keys (ids) over whole-object arguments when
you want readable keys in Redis. (Key derivation changed in 3.0.0 — entries
cached under the old raw-JSON format are stale and simply miss.)

**10.11 ⚠ You own the Redis client — the framework never creates one.**
Construct it (e.g. `new Redis(url)` from ioredis) and pass it as
`.enableCache({ client })` or `new RedisCacheStore({ client })`. ioredis is
not a dependency of BootifyJS; any client with the `CacheRedisClient` shape
works. Missing client → `CacheConnectionError` at construction (fail-fast).
For atomic tag indexes in multi-instance setups, use a client with
`sAdd`/`sMembers`/`expire` (ioredis has them).

**FAQ**

- *Can I cache per-user results?* Yes — the user id is just an argument:
  `@Cacheable({ key: 'stats' }) stats(userId: string)` →
  `stats::"u1"`, `stats::"u2"`. Evict with the quoting contract (§7).
- *How do I clear EVERYTHING?* `del` per key — the stores intentionally
  don't expose `clear()` (a blanket flush from library code is a foot-gun).
  Keep base-key constants and evict those.
- *Does `@CacheEvict` clear ALL entries under a base key?* No — it evicts
  only the entry for the same arguments (same key formula).
- *Why does `@Cacheable` resolve from the global container?* See §8.3 —
  binding-at-bootstrap beats constructor plumbing for app-wide caches.

---

## 11. API reference

| Export | Kind | Purpose |
|---|---|---|
| `CACHE_STORE_TOKEN` | symbol | DI token the store binds to |
| `ICacheStore` | interface | Store contract (+ optional `healthCheck`, set primitives, `mget`/`mset`) |
| `CacheService` | class | Facade: `get/set/put/del/remember/rememberForever/flushTags/mget/mset` |
| `InMemoryCacheStore` | class | Default store (Map + TTL + opt-in LRU, per-process) |
| `RedisCacheStore` | class | Redis store (app-owned client, `cache:` namespacing) |
| `CacheRedisClient` | interface | Minimal Redis command surface (fakes welcome) |
| `Cacheable` / `CachePut` / `CacheEvict` | decorators | Method caching / write-through / eviction |
| `CacheOptions` / `CacheableOptions` / `CachePutOptions` / `CacheEvictOptions` | types | Decorator option shapes (`key`, `ttl`, `tags`, `condition`, `unless`, `singleFlight`, …) |
| `CacheKeyBuilder` | type | Full key override for decorators |
| `generateCacheKey` | function | The key formula (order-stable, circular-safe, `hashArgs` option) |
| `singleFlight` / `SingleFlight` / `SingleFlightReentrancyError` | commons | Stampede protection (also usable standalone) |
| `stableStringify` | commons | Order-stable serialization used by key generation |
| `bootstrapCache` | function | Bind default store (`{ maxEntries }`); idempotent; returns unbootstrap |
| `CacheError` / `CacheConnectionError` | errors | Typed failures |
| `isCacheStore` | guard | Duck-type check (Bundler-safe) |

Source map: `src/cache/{cache.types, cache.service, decorators, bootstrap,
ttl, errors}.ts` + `src/cache/stores/{in-memory-cache.store,
redis-cache.store, redis-client}.ts`.
Tests: `tests/unit/cache/{cache,tier1,tier2}.test.ts` + integration
`tests/integration/cache-builder.test.ts`.

---

## 12. Design decisions (the "why")

| Decision | Rationale |
|---|---|
| Store behind a DI token | Runtime backend selection; decorators need zero constructor plumbing |
| `undefined` = miss | Keeps the hit check simple; document returning `null` for "valid empty" |
| Key = base + JSON args | Deterministic, collision-free per call shape; no hidden hashing |
| Eviction after success only | A failed writeback must not wipe valid entries |
| Redis client app-owned | Connection lifecycle/pooling/config belong to the app; no hidden connections, no ioredis dependency |
| `maxEntries` opt-in | Bounded memory without silently changing eviction semantics for existing apps |
| Atomic tag Sets when available | Kills the multi-instance lost-append window; RMW fallback keeps custom stores working |
| Negative TTL throws | A negative TTL is a bug — fail fast instead of diverging semantics per store |
| No blanket `clear()` | Library code flushing a shared cache is a foot-gun |
| Errors throw, not degrade | Outages must surface (observability) — degrade explicitly if wanted |
| Single-flight default-ON | Concurrent misses should never stampede the database |
