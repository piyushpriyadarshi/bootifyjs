# BootifyJS — Flagship Master Plan (LLD + Roadmap)

**Mission:** BootifyJS becomes the default framework for all upcoming projects and
the flagship GitHub repo — code matching README claims line-for-line, a
commons-quality **100% test coverage** suite, differentiated on Fastify-native
performance + the buffered event system.

**Priority order (locked):** ① Cleanup → ② API DX → ③ 100% coverage → ④ Launch

**Design principles** (inherited from `@priyadarship4/commons`):
1. Instance-first, singleton only at the edge (`createContainer()` pattern)
2. Injected clock, config, and platform services — no `process.env` reads in constructors
3. Typed error hierarchy — never `process.exit()` inside library code
4. Zero dead code — delete, don't comment out
5. Tests are the contract — deterministic, real state assertions, no mock-theater

---

## 1. Target Repository Layout

```
bootifyjs/
├── src/
│   ├── core/
│   │   ├── container.ts               # REWRITE (from di-container.ts, commons-style)
│   │   ├── decorators.ts              # CLEAN (param index, no logs, 7 verbs)
│   │   ├── router.ts                  # FIX (param index, export pure fns)
│   │   ├── request-context.service.ts # KEEP
│   │   ├── errors.ts                  # NEW: BootifyError taxonomy root
│   │   └── index.ts
│   ├── config/
│   │   ├── AppConfig.ts               # FIX: no process.exit, reset(), ConfigValidationError
│   │   ├── errors.ts                  # NEW
│   │   └── index.ts
│   ├── cache/
│   │   ├── stores/in-memory-cache.store.ts   # KEEP
│   │   ├── stores/redis-cache.store.ts       # REWRITE: real ioredis, lazy import
│   │   ├── decorators.ts              # FIX: export generateCacheKey
│   │   ├── errors.ts                  # NEW
│   │   └── bootstrap.ts               # FIX: idempotent, silent
│   ├── events/
│   │   ├── event-bus.service.ts       # KEEP + tests
│   │   ├── buffered-event-bus.service.ts # FIX: inject config, add dispose()
│   │   ├── config/buffered-event-config.ts # FIX: injectable env
│   │   ├── shared-buffer.ts           # KEEP (pure, in-process)
│   │   ├── metrics/event-metrics.ts   # KEEP
│   │   ├── retry/retry-handler.ts     # KEEP
│   │   ├── monitoring/health-monitor.ts # KEEP
│   │   ├── worker/worker-manager.ts   # REWRITE: kill new Function() eval
│   │   ├── worker/processor-registry.ts # NEW: defineProcessor() module registry
│   │   ├── errors.ts                  # NEW
│   │   └── bootstrap.ts               # FIX: awaited init, returns DisposeFn
│   ├── logging/
│   │   ├── core/                      # KEEP builder/base-logger/transports
│   │   ├── core/logger.ts             # DELETE (deprecated pino path)
│   │   ├── core/logger.provider.ts    # DELETE (missing posthog transport)
│   │   ├── core/streaming-startup-logger.ts # FIX: inject SystemInfoProvider
│   │   ├── core/enhanced-startup-logger.ts  # FIX: inject SystemInfoProvider
│   │   └── config/logging.config.ts   # DELETE (dead file)
│   ├── scheduling/
│   │   ├── scheduler.service.ts       # FIX: inject clock/registry/cron, dispose()
│   │   └── scheduled.decorator.ts     # KEEP
│   ├── auth/                          # KEEP structurally — best module
│   ├── middleware/
│   │   └── auth.middleware.ts         # FIX: injectable TokenCache
│   ├── testing/                       # NEW: bootifyjs/testing subpath
│   │   ├── create-test-app.ts         # preconfigured BootifyApp for tests
│   │   ├── fakes.ts                   # FakeCacheStore, FakeTokenStorage, FakeRedisClient,
│   │   │                              # FakeTransport, FakeClock, fake req/reply, FakeFastify
│   │   └── index.ts
│   ├── BootifyApp.ts                  # FIX: build guard, no exit, injectable container
│   └── index.ts
├── tests/
│   ├── setup.ts                       # reflect-metadata, exit guard, ALS cleanup
│   ├── helpers/                       # with-env, fake-clock, fakes, fresh-container
│   ├── unit/
│   │   ├── core/                      # container, decorators, router, request-context
│   │   ├── config/  cache/  events/   # one dir per module
│   │   ├── logging/  scheduling/  auth/  middleware/
│   └── integration/
│       ├── bootify-app.test.ts        # app.inject() based
│       └── events-worker.integration.test.ts  # skipIf no RUN_WORKER_TESTS
├── examples/
│   ├── 01-hello/index.ts
│   ├── 02-todo-api/                   # CRUD + zod + swagger
│   ├── 03-auth-jwt/
│   ├── 04-buffered-events/
│   └── 05-scheduled-jobs/
├── scripts/decorator-globs.ts         # single source of truth for tsc plugin
├── vitest.config.ts                   # ported from commons, globs from scripts/
├── tsconfig.test.json
├── tsconfig.cjs.json                  # dual build (commons pattern) — release phase
├── .github/workflows/ci.yml
├── LICENSE (MIT) | CHANGELOG.md | CONTRIBUTING.md | .nvmrc
└── package.json                       # deps hygiene, test scripts, example scripts
```

**Delete list (Phase 0):** `src/core/di-container.ts` lines 1–154, `src/core/decorators.ts`
commented blocks (25–32, 197–252), `src/logging/core/logger.ts`,
`src/logging/core/logger.provider.ts`, `src/logging/config/logging.config.ts`,
`src/middleware/tracing.middleware.ts` (no-op stub), dead `api.ts` path,
fake `redis-cache.store.ts` (replaced), committed `bootifyjs-1.4.0.tgz`,
root `*-demo.ts` files, `eagerIdentifiers` set (implemented properly instead).

---

## 2. Phase 0 — CLEANUP (week 1)

### 2.1 Dead code deletion
See delete list above. Nothing gets commented out — deleted.

### 2.2 Dependency hygiene (package.json)
- Remove `@clickhouse/client`, `posthog-node` (no live code in repo)
- Move `@types/jsonwebtoken` → devDependencies
- `ioredis` becomes optional peerDependency (cache phase)
- Add devDeps: `vitest`, `@vitest/coverage-v8`

### 2.3 Repository infra
- `vitest.config.ts` + `tsconfig.test.json` + `tests/setup.ts` (ported from commons;
  decorator globs in `scripts/decorator-globs.ts` as single source of truth)
- `.github/workflows/ci.yml`: node 20/22 matrix, typecheck → test → build,
  concurrency cancel-in-progress, coverage artifact upload
- `LICENSE` (MIT), `CONTRIBUTING.md`, `CHANGELOG.md`, `.nvmrc`
- Unify exports: **`./auth` is missing from package.json exports — add it**; add
  `./testing` subpath; every barrel exports exactly the §3 public surface

### 2.4 Truth fixes (ship as 2.2.x)
- Guard `BootifyApp.start()` double-build
- `AppConfig`: no `process.exit(1)` → throw
- Remove `console.log` from `@Component` and DI registration path

**Exit criteria:** CI green on node 20/22; `npm test` runs the smoke suite;
dead code gone; 2.2.x published.

---

## 3. Phase 1 — API DX OVERHAUL (weeks 2–3)

Goal: a developer imports ONE thing (`bootifyjs`), gets typed everything,
predictable errors, and a testing kit. This is the public API contract for v3.

### 3.1 Unified public API contract

```ts
// 90% of apps import only this:
import {
  createBootify, BootifyApp,
  Component, Service, Repository, Controller, Autowired,
  Get, Post, Put, Delete, Patch, Head, Options,
  Body, Query, Param, Req, Res,
  Schema, Swagger, UseMiddleware,
  useConfig, getConfig, defineConfig,
  HttpError, BootifyError,
  VERSION,
} from 'bootifyjs';

// Power users use subpaths (all exported, all documented):
// bootifyjs/core, /events, /cache, /logging, /config, /scheduling, /auth
// bootifyjs/testing   ← NEW: first-class test kit (like @nestjs/testing)
```

### 3.2 App lifecycle (most-touched API)

```ts
const app = await createBootifyApp({ container? })   // NEW: injectable Container
  .setServiceName('my-api')
  .setPort(3000)
  .useConfig(defineConfig(z.object({ DATABASE_URL: z.string() })))
  .useControllers([TodoController])
  .build();                    // throws BootifyStateError on double build

await app.start();             // throws BootifyStartError on failure — never process.exit

app.handle     // FastifyInstance (renamed from `app.app` nesting)
app.logger     // ILogger
app.config     // NEW: typed config accessor (getConfig<T>())
app.scheduler?
app.close()    // NEW: explicit graceful shutdown, removes signal handlers
```
Changes: drop `startupLogger` from the public handle (internal concern); `start()`
no longer re-runs `build()`; signal handlers use `process.once`, tracked and removed
on close; `process.exit(0)` only in the user's own signal callback.

### 3.3 Type-safe DI

```ts
export type DiToken = string | symbol | Constructor;      // no `any`

export const TOKENS = {                                     // documented convention
  CacheStore: Symbol('bootify.cache.store'),
} as const;

container.register(TOKENS.CacheStore, { useClass: RedisCacheStore });
container.resolve<ICacheStore>(TOKENS.CacheStore);          // typed resolve
```

### 3.4 Errors & HTTP mapping (built-in, overridable)

```ts
export class BootifyError extends Error { status = 500; code: string; }
export class ConfigValidationError extends BootifyError { issues: ZodIssue[] }
export class RouteValidationError extends BootifyError { issues: ZodIssue[] }  // 400
export class UnauthorizedError extends BootifyError   // 401 (auth module reuses)
export class ForbiddenError   extends BootifyError    // 403
export class NotFoundError    extends BootifyError    // 404
export class BootifyStateError  extends BootifyError  // double build/start
export class BootifyStartError  extends BootifyError  // listen failure
```
Default error handler maps `ZodError`/`RouteValidationError` → 400 with issue list,
`BootifyError.status` → its code, unknown → 500 (no stack leak in prod). Users
override with `.useErrorHandler()` — one clear escape hatch.

### 3.5 Config DX

```ts
const schema = defineConfig(z.object({ DATABASE_URL: z.string() }));
const app = await createBootifyApp().useConfig(schema).build();
app.config.get('DATABASE_URL');   // typed by inference
```
`AppConfig` keeps singleton for back-compat, adds `reset()`; validation failure
throws `ConfigValidationError` (issues attached); `isSensitiveKey` exported.

### 3.6 Decorator consistency
- All class decorators accept the same `ComponentOptions { scope, bindTo, eager }`;
  `@Controller(prefix, options?)` gains scope (currently hardcoded singleton)
- Param metadata: `{ type, name, index }` (fix sparse arrays); route + param
  metadata both stored on `target.constructor` (single owner)
- `@Schema` canonical; `@Validate` alias removed (breaking, changelog entry);
  `Reply` alias added for `Res`

### 3.7 DX quick wins
- Export `VERSION` from root
- Banner: `--quiet` / `LOG_BANNER=false` (daily dev noise control)
- `app.printRoutes()` passthrough documented

---

## 4. Module LLD (implementation detail for Phase 1 + 2)

### 4.1 core — DI Container

**File: `src/core/container.ts`** (replaces `di-container.ts`)

```ts
export class Container {
  register(token: DiToken, options: RegistrationOptions): void;
  // Behavior changes vs 2.x:
  //  - duplicate token WITHOUT override → throws InvalidRegistrationError
  //  - interface-typed ctor param (Object) → InterfaceTokenError (was: silent undefined)
  //  - primitives (String|Number|Boolean) → undefined arg (unchanged)
  //  - factory-created instances ALSO get property injection (consistency fix)
  //  - failed resolve never caches a partial singleton (already true, now tested)
  resolve<T = unknown>(token: DiToken): T;
  isRegistered(token: DiToken): boolean;
  getRegisteredComponents(): Constructor[];
  eagerInit(): Promise<void>;   // NEW: resolves eager tokens (called by BootifyApp.build)
  clear(): void;                // NEW: full reset for tests/HMR
}

export interface RegistrationOptions {
  useClass?: Constructor;
  useFactory?: () => unknown;
  scope?: 'singleton' | 'transient';
  eager?: boolean;          // NOW REAL
  override?: boolean;       // allow replacing an existing token
}

export function createContainer(): Container;
export const container: Container;   // global default, used only at the edge
```

**Registry consolidation:** delete `component-registry.ts` global `registeredComponents`.
`@Component` registers into the container only; scheduler/events discover via
`container.getRegisteredComponents()`. Removes a duplicate source of truth.

**`src/core/decorators.ts`:** param metadata `{ type, name, index }`; no import-time
logging; add `Head`/`Options` verbs; delete legacy blocks; `@Autowired` keeps dual
(param + property) behavior.

**`src/core/router.ts`:** export pure fns `mergeSwaggerMetadata`, `buildFastifySchema`
for testing; read param metadata with `index`, handle gaps; param metadata moves to
`target.constructor`.

**Test matrix — `tests/unit/core/container.test.ts`** (~30 cases)
| # | Case |
|---|---|
| 1 | register+resolve singleton returns same instance |
| 2 | transient returns new instance each resolve |
| 3 | factory singleton cached / factory transient fresh |
| 4 | factory instance receives @Autowired property injection |
| 5 | constructor chain resolved via design:paramtypes (2-level, 3-level) |
| 6 | @Autowired(token) overrides design:paramtypes per index |
| 7 | circular constructor deps → CircularDependencyError |
| 8 | circular property injection → CircularDependencyError |
| 9 | interface param (Object) → InterfaceTokenError (not silent undefined) |
| 10 | primitive params → undefined args |
| 11 | duplicate register without override throws; with override succeeds, old instance discarded |
| 12 | resolve of unknown token → ServiceNotFoundError |
| 13 | register without provider → InvalidRegistrationError |
| 14 | failed resolution leaves no cached partial instance |
| 15 | clear() empties registry + instances |
| 16 | eagerInit() instantiates eager tokens once, non-eager untouched |
| 17 | getRegisteredComponents dedupes bindTo aliases |
| 18 | DiToken as string / symbol / class all resolve |
| 19 | createContainer() returns isolated instance |

**`decorators.test.ts`:** metadata shape per decorator, all 7 verbs, param
`{type,name,index}`, bindTo registers aliases, scope passthrough, Controller prefix +
container registration, both @Autowired error paths.

**`router.test.ts`:** `normalizePrefix`/`joinPaths` pure cases; `registerControllers`
against FakeFastify (records `.get/.post/...` calls + options); zod schema → JSON
schema snapshot; swagger class-level merge + method-level override; HEAD/OPTIONS.

**`request-context.test.ts`:** get/set inside `run()`, nested runs, isolation
between concurrent runs.

### 4.2 config

- `validateConfig()` throws `ConfigValidationError` (no `process.exit`)
- `AppConfig.reset()`; `initialize()` re-entrant, silent-flag controllable
- export `isSensitiveKey` predicate

**Tests:** schema merge with user schema; env precedence; typed `get`; failure
throws (spy: no process.exit); redaction of PASSWORD/TOKEN/SECRET keys; reset()
isolation via `withEnv()` helper.

### 4.3 cache

Real `RedisCacheStore` (README claims it; a flagship can't ship a fake). Optional
peer dep, lazy import:

```ts
export class RedisCacheStore implements ICacheStore {
  constructor(clientFactory?: () => IRedisClient);  // injectable for tests
}
```
- `ICacheStore` gains optional `healthCheck(): Promise<boolean>`
- `errors.ts`: `CacheError`, `CacheConnectionError`
- export `generateCacheKey(baseKey, args)` (pure; format `base::JSON(args)`)
- `bootstrap.ts`: idempotent, silent, returns unbootstrap for tests

**Tests:** in-memory store (TTL via fake timers, overwrite, delete, miss);
`CacheService` vs FakeCacheStore; `generateCacheKey` matrix (no args, primitives,
objects, arrays, circular-ref guard); `@Cacheable` hit/miss/TTL + `@CacheEvict`
before/after via fresh container; bootstrap idempotency; Redis vs FakeRedisClient;
Redis integration `describe.skipIf(!process.env.REDIS_URL)`.

### 4.4 events

Keep the strong pure core; fix the three hard spots.

**a) Config injection** — `BufferedEventConfigLoader.fromEnvironment(env?)`;
`BufferedEventBusService(configOverride?: Partial<BufferedEventConfig>)` merged
over env-loaded defaults; add `dispose(): Promise<void>` (clears ALL intervals,
waits worker drain).

**b) Worker handler transport (kills `new Function` eval)**

```ts
// src/events/worker/processor-registry.ts
export function defineProcessor(name: string, factory: () => IEventHandler): void;
// WorkerManager passes workerData: { buffer: SharedArrayBuffer, processorsModule: string }
// event-processor.worker.ts: await import(pathToFileURL(workerData.processorsModule))
```
Users declare a processors module (side-effect file calling `defineProcessor`).
No stringified handlers, no eval, debuggable stacks. Back-compat: no
`processorsModule` → sync-mode only + warning.

**c) Bootstrap determinism** — `bootstrapEventSystem(): Promise<DisposeFn>`;
`initialize()` awaited (no fire-and-forget `.then()`).

**Tests:**
- `shared-buffer.test.ts`: FIFO, size/stats, overflow policy, oversized throw,
  clear(), wrap-around, concurrent enqueue/dequeue in-process
- `event-metrics.test.ts`: counters, percentile math (fixed inputs), rates, worker map
- `retry-handler.test.ts`: fake timers — backoff schedule, jitter bounds, DLQ after
  max attempts, reprocessDLQ success/failure
- `health-monitor.test.ts`: FakeMetricsCollector — each threshold, score bands,
  alerts, trend detection
- `buffered-config.test.ts`: validator rejections, mergeWithDefaults, injected-env loader
- `event-bus.test.ts`: subscribe/emit, DLQ after 3 attempts (fake timers),
  correlationId enrichment inside `RequestContextService.run()`
- `buffered-bus.test.ts`: sync fallback path, emitEvent result shapes, dispose()
- `worker-manager.test.ts`: `vi.mock('node:worker_threads')` — spawn args, message
  protocol, health-check intervals, restart on death, scale-up/down
- `events-worker.integration.test.ts`: real workers, gated by `RUN_WORKER_TESTS=1`

### 4.5 logging

- **Delete** deprecated pino `Logger`, `logger.provider.ts`, dead `logging.config.ts`
- `LoggerBuilder.build()` keeps container registration (edge); `resetLogger()` ALSO
  clears the container binding (bug fix)
- Startup loggers: inject `SystemInfoProvider { get(): SystemInfo }` — default impl
  wraps `os`, tests inject static data; output-shape tests only

**Tests:** BaseLogger + FakeTransport — level filtering (numeric map boundaries),
context merge order (base < child < provider < call-site), child() bindings,
flush/close fan-out. ConsoleTransport — JSON vs pretty (spy `process.stdout.write`),
stderr routing for warn/error. RequestContextProvider inside `run()`. `@Audit`
success-path + arg path extraction; `@Loggable` no-op fallback. Builder + resetLogger
semantics.

### 4.6 scheduling

```ts
interface SchedulerDeps {
  clock?: () => Date;                 // default: () => new Date()
  registry?: () => Constructor[];     // default: () => container.getRegisteredComponents()
  cron?: CronModule;                  // default: dynamic import('node-cron')
}
constructor(deps?: SchedulerDeps)
```
- `start(components?: Constructor[])` — optional explicit list (tests: local set)
- `dispose()`; `onJobError` callback (no silent console); `getNextCronRun()`
  implemented via node-cron or deleted (no stubs in flagship)

**Tests:** @Scheduled metadata (string + options); discovery from injected registry;
fixed-rate/fixedDelay via fake timers; maxRetries + retryDelay schedule; overlap
prevention; enable/disable; trigger(name); getStats shape; stop() drains in-flight.

### 4.7 auth — no structural changes (best module; test-first)

- `jwt-strategy.test.ts`: authenticate success/failure via credentialValidator;
  validate happy path; expired token (1s expiry); refresh rotation (old invalid);
  revoke blacklist; malformed → InvalidTokenError
- `api-key-strategy.test.ts`: generate → hash determinism; parse format; scope
  filtering matrix; rotation invalidates old; delete/list
- `auth-manager.test.ts`: register/get/duplicate error; detectStrategy by header;
  session persistence via FakeTokenStorage; getStats
- `redis-token-storage.test.ts`: FakeRedisClient (map + TTL) — prefixing, serializer,
  batch ops, healthCheck false on client error
- `auth-middleware.test.ts`: fake req/reply — missing/invalid header 401,
  roles/permissions 403 matrix, skip-path logic

### 4.8 middleware

- `createAuthMiddleware({ secret, tokenCache? })` factory; module-level default kept
  for back-compat
- **Tests:** TokenCache set/get/expiry (fake timers); authenticate() valid/invalid/
  missing JWT with fake req/reply; authorize() roles matrix; isUserAuthorized pure
  cases; extractors (fingerprint, UA detection, custom headers); createContextMiddleware —
  ALS context, requestId, X-Request-Id header, extractor applied

### 4.9 BootifyApp

Implements §3.2 contract:
1. `built` flag; second `build()`/`start()` → `BootifyStateError`
2. `start()` failure → `throw new BootifyStartError(err)` — no `process.exit(1)`
3. `process.once` signal handlers, stored refs, removed by `app.close()`
4. Injectable container passed to `registerControllers` + scheduler resolution
5. `eagerInit()` awaited after container wiring

**Integration tests (`app.inject()` only):**
- Route resolution: basePrefix + group prefix + controller prefix + method path
- Zod validation: 400 with issue details on bad body; 200 happy path
- Middleware order (onRequest array order observed via context writes)
- Custom error handler wired; default zod error handler shape
- Plugins receive app instance; beforeStart/afterStart hook order
- `useScheduler(false)` → scheduler undefined in result
- Double build throws; start() failure → BootifyStartError (occupied port)
- Graceful shutdown: invoke registered SIGTERM handler → scheduler.stop + app.close
  invoked (fake process methods)

---

## 5. Test Infrastructure LLD

**vitest.config.ts** (ported from commons):
- `tscTranspile()` plugin — decorator globs imported from `scripts/decorator-globs.ts`;
  Phase-1 sanity test asserts `design:paramtypes` exists post-transform for every
  glob entry (no silent metadata loss)
- Coverage: v8 provider, `include: ['src/**/*.ts']`, ratchet (§6)
- `restoreMocks: true`, `testTimeout: 15_000`, `environment: 'node'`

**tsconfig.test.json**: extends root, `rootDir: '.'`, include `src + tests +
vitest.config.ts`, `declaration: false`. `npm run typecheck` → `tsc -p tsconfig.test.json --noEmit`.

**tests/setup.ts**: `import 'reflect-metadata'`; guard `process.exit` (fail test if
called); reset `RequestContextService` ALS; afterEach: clear fake timers if active.

**tests/helpers/** mirror into `src/testing/` (shipped via `bootifyjs/testing`):
`withEnv(vars, fn)`, `FakeClock`, fakes module, `freshContainer()`.

**package.json scripts**:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"typecheck": "tsc -p tsconfig.test.json --noEmit",
"example:hello": "ts-node examples/01-hello/index.ts",
"example:todo": "ts-node examples/02-todo-api/index.ts",
"example:auth": "ts-node examples/03-auth-jwt/index.ts",
"example:events": "ts-node examples/04-buffered-events/index.ts",
"example:scheduler": "ts-node examples/05-scheduled-jobs/index.ts"
```

---

## 6. Phase 2 — 100% COVERAGE PROGRAM (weeks 3–6)

Tooling proven in commons (150 tests, 2.87s, 100% enforced). Applied module by
module; Phase 1 enablers (injected clock/config, dispose(), typed errors) are what
make 100% a design outcome, not just test effort.

**Coverage ratchet (v8, enforced in CI):**
| Milestone | lines/stmts | branches | functions |
|---|---|---|---|
| Phase 2 start | 80 | 70 | 80 |
| after core+config+auth | 90 | 80 | 90 |
| after events+scheduling | 95 | 90 | 95 |
| **v3.0 release gate** | **100** | **100** | **100** |

Allowed exclusions (documented, like commons excludes `sqlite/bin.ts`):
`src/events/worker/event-processor.worker.ts` (covered by gated integration test),
CLI bin files. Nothing else.

**Execution order:** core+config → auth+middleware → logging → events →
scheduling+cache+BootifyApp. Per-module test matrices: §4.

---

## 7. Phased Execution Plan

| # | Phase | Scope | Exit criteria | Est |
|---|---|---|---|---|
| 0 | Cleanup + infra | delete list, deps, exports, vitest/CI scaffold, truth fixes | CI green node 20/22; smoke suite; 2.2.x published | 1 wk |
| 1 | API DX overhaul | §3 contract + §4 refactors, changesets for breaking changes | public contract exported & documented | 2 wk |
| 2 | Coverage → 100% | §6 ratchet + all test matrices; `bootifyjs/testing` shipped | 100/100/100 gate green | 3 wk |
| 3 | v3.0 release | dual ESM/CJS build, CLI publish (`npx bootifyjs-cli new`), examples/, README truth pass (badges, GIF, honest NestJS table), LICENSE/CONTRIBUTING/CHANGELOG | fresh-clone demo works <60s | 1 wk |
| 4 | Launch | benchmarks vs NestJS/Fastify (autocannon), deep-dive blog on buffered events, Show HN kit | bench repo + blog draft done | 1 wk |

**Total: ~7-8 weeks.** Phase 0+1 unblock everything; Phase 3 can partially overlap
with late Phase 2.

---

## 8. Roadmap (beyond v3.0)

### v3.x — "production batteries" (quarterly)
- `@bootifyjs/observability`: /health + /ready endpoints, Prometheus metrics hooks,
  request tracing context propagation
- OpenAPI generation improvements (method-level overrides, examples from zod)
- Buffered events: persistence-backed DLQ replay, dashboard (grow `trace-dashboard/`)
- Cache: `@CachePut`, stale-while-revalidate option
- Scheduling: distributed lock provider interface (DB/Redis backends)
- bootifyjs-cli: module/controller/service/event scaffolds, `--template` flag
- commons integration: optional `Repository<T>` over sqlite/pg via `@priyadarship4/commons`

### v4.0 — "platform" (exploratory)
- Stage-3 decorators when TS ecosystem settles (behind flag)
- Child containers / request scopes in DI
- Interceptors/pipes ONLY if real usage demands
- Benchmarks as CI perf gates (autocannon, budget ±5%)

---

## 9. Risk Register

| Risk | Mitigation |
|---|---|
| Decorator files outside tsc plugin lose metadata silently | globs constant + sanity test asserting `design:paramtypes` exists post-transform |
| Worker integration tests flaky in CI | gate behind env; retry twice; separate job |
| Redis tests without Redis in CI | FakeRedisClient units; integration skipIf; optional services job |
| Breaking changes vs 2.x users (121/mo downloads) | changesets + v3.0.0 major; migration guide in CHANGELOG |
| Coverage ratchet stalls | thresholds per-phase, not big-bang 100% |
| Scope creep into NestJS feature parity | wedge only: Fastify-native perf + zod + buffered events |
| 2.x consumers import deleted/deprecated exports | deprecation warnings in 2.2.x before removal in 3.0 |

## 10. Explicit Non-Goals (v3.0)

- No stage-3 decorators migration (legacy + emitDecoratorMetadata is the design)
- No Express compat layer
- No ORM beyond commons' sqlite repos
- No plugin marketplace / NestJS parity modules (guards/interceptors) — revisit post-launch
