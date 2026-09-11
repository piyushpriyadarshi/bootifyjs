# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - Unreleased

A ground-up quality release: the DI container, error handling and app
lifecycle were redesigned, the buffered event system no longer evaluates
handler code, every module got a real test suite (412 tests, CI-enforced
coverage floor), and the deprecated paths were removed.

### Added
- **`.enableCache()` / `.disableCache()` — cache becomes a default-ON builder
  feature.** Zero calls: an InMemoryCacheStore is bound automatically and
  `@Cacheable` just works. Customize with exactly one of
  `{ store: ICacheStore }`, `{ client: RedisClient }` (your own Redis client,
  wrapped — the framework never creates connections), or `{ maxEntries }`
  (bounded default store with LRU eviction). Store binding is dual-container
  (app + global) and `CacheService` is eagerly resolved at startup — broken
  bindings fail at boot, not on the first request. `@Cacheable` with no store
  now throws an actionable `CacheError` instead of a raw
  `ServiceNotFoundError`. `bootstrapCache({ maxEntries? })` remains for
  non-builder (pure-DI) apps.
- **BootifyJS CLI (`npx bootifyjs`)** — the framework package ships a bin:
  - `npx bootifyjs new <name>` scaffolds a working project (auth, swagger,
    health, tracing, tests) — `minimal` (guided tour of every decorator,
    demo login `demo/demo123`) or `goals` (the full POC: goals/milestones/
    tasks/check-ins, events, digest cron, sqlite migrations)
  - `npx bootifyjs generate controller|service|repository|event <name>`
    scaffolds 3.0-convention components into existing projects
  - Zero runtime dependencies (readline prompts, hand-rolled arg parsing)
  - Generated projects reference `bootifyjs ^3.0.0` — publish first
- **`@Public()` decorator** — opts a single route out of class-level `@UseAuth()`
### Added
- **Global-auth engine: `enableAuth({ global: true, routes, tokenExtractor, cookieName })`**
  — deny-by-default global authentication (NestJS guard model):
  - everything locked; `@Public()` routes and `GET /health`+`/ready` opt out
    (Fastify route-config stamping, `request.routeOptions.config.authPublic`)
  - `routes[]`: ordered, first-match-wins path rules — `auth: 'public'`,
    `roles: ['admin']` gates, `methods` scoping, glob patterns (`*` one
    segment, `**` all remaining) and RegExp; validated at build
  - `tokenExtractor` / `cookieName` — pluggable token location (default:
    Bearer header)
  - CORS preflight `OPTIONS` requests never authenticate
  - unauthenticated requests → 401; role-gated → 403
- **Opinionated builder features** (Spring Boot-style zero-config opt-ins):
  - Request tracing **on by default**: `x-request-id` stamped on every
    response and reused from incoming requests (cross-service propagation);
    `.disableRequestContext()` to opt out
  - Health check **on by default**: `GET /health` (liveness) plus optional
    `readinessPath` with a cache probe (503 degraded); `.disableHealthCheck()`
  - CORS **on by default** with dev-safe reflect-origin; production without
    an explicit origin list warns; `.enableCors({ origin: [...] })` / `.disableCors()`
  - `.enableSwagger()` — zero-config OpenAPI UI at `/docs`, title from the
    service name, zod `@Schema` bodies included, `bearerAuth` scheme auto-added
    with auth; `hideUiInProduction` option
  - `.enableAuth()` — zero-config when `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`
    env vars exist, actionable `ConfigValidationError` at build time otherwise;
    registers the middleware bundle consumed by the new decorators
  - New decorators: `@UseAuth()` (method/class), `@Roles(...)` (implies
    `@UseAuth`, 403 on mismatch), `@CurrentUser()` (verified payload as a
    parameter); missing `enableAuth()` fails the build with an actionable
    error
  - `.enableRequestLogging()` for structured access logs
- **DI container** (`bootifyjs/core`): `createContainer()` factory,
  `Container.clear()` / `unregister()` / `eagerInit()` (makes `eager: true`
  real), strict registration with `{ override: true }`, typed
  `resolve<T>()`, `DiToken = string | symbol | Constructor`, factory-created
  instances receive `@Autowired` property injection
- **Error taxonomy**: `BootifyError` base with `code`, plus
  `BootifyStateError`, `BootifyStartError`, `HttpError` (with `status`),
  `RouteValidationError` (400), `UnauthorizedError` (401), `ForbiddenError`
  (403), `NotFoundError` (404), and typed DI errors
  (`ServiceNotFoundError`, `CircularDependencyError`,
  `InvalidRegistrationError`, `InterfaceTokenError`)
- **Default error handler**: Zod/Fastify validation errors → 400 with issue
  details, `HttpError` → its status, unknown → 500 (message hidden in
  production). Override with `.useErrorHandler()`
- **App handle**: `build()` returns the app; access via `app.handle`,
  `app.logger`, `app.config`, `app.scheduler`; plus `app.close()` (removes
  its own signal handlers), `app.printRoutes()`,
  `createBootifyApp({ container? })` for container injection, `LOG_BANNER=false`
  quiet mode, `VERSION` export
- **Config DX**: `defineConfig()`, `useConfig()`, `getConfig()`,
  `AppConfig.reset()`, exported `isSensitiveKey`
- **Decorators**: `Head`/`Options` verbs, `Reply` alias,
  `@Controller(prefix, options)` scope support, param metadata
  `{ type, name, index }` (sparse-safe)
- **`bootifyjs/testing` subpath**: `createTestApp()` (isolated container,
  silent, scheduler off, `inject()`-ready) plus the `FakeTokenStorage`,
  `FakeRedisClient` and `FakeTransport` fakes used by the framework's own tests
- **Cache (Tier 1 + Phase A/B)**: single-flight stampede protection
  (default-ON in `@Cacheable`), `CacheService.remember/rememberForever`,
  `@CachePut`, `condition`/`unless` (now with `args`), tag-based invalidation
  (atomic Redis Sets when the client supports `sAdd`/`sMembers`/`expire`;
  RMW + mutex fallback), `CacheService.mget/mset` batch operations, opt-in
  in-memory LRU (`maxEntries`), unified TTL semantics (0/undefined = no
  expiry, negative throws), Redis error events recorded instead of thrown,
  app-owned `RedisCacheStore` client (`{ client, onError? }` — no
  `redisUrl`/`createDefaultRedisClient`/ioredis dependency), exported
  `generateCacheKey()` (order-stable, circular-ref safe, auto-hashing),
  `CacheError`/`CacheConnectionError`, `bootifyjs/commons`
  (`singleFlight`, `stableStringify`)
- **Events**: `defineProcessor()` module registry — worker threads import a
  user processors module instead of evaluating handler strings with
  `new Function`; `BufferedEventConfigLoader.fromEnvironment(env?)` injection;
  `BufferedEventBusService.dispose()`; awaited `bootstrapEventSystem()`
  returning a `dispose()` function; `EventBusService.clear()`
- **Scheduling**: `start(components?)` for explicit wiring, `dispose()`,
  `onJobError` hook, direct instantiation for unregistered explicit classes
- **Logging**: `SystemInfoProvider` injection for startup banners,
  `resetLogger()` now also clears container bindings,
  `LoggerBuilder.build(container?)` targets a specific container
- `./auth` subpath export (`bootifyjs/auth`) — the module existed but was not exported
- Test infrastructure: Vitest with a checker-driven `ts.Program` transpile
  plugin (exact build-parity decorator metadata), v8 coverage with enforced
  thresholds, `npm run test / test:watch / test:coverage / typecheck`
- GitHub Actions CI (node 22/24: typecheck → test → build)
- 412 unit + integration tests (incl. the CLI) across core, config, cache, events
  (incl. mocked `worker_threads`), logging, scheduling, auth, middleware and
  full `app.inject()` integration coverage

### Changed
- **Cache: the framework no longer creates Redis clients.** `enableCache({ redisUrl })`
  and `createDefaultRedisClient` are removed (the `ioredis` peer dependency is
  gone); construct your client and pass `{ client }` or use a full
  `{ store }`. `RedisCacheStore` requires `{ client }` or a caller-provided
  `{ clientFactory }` and throws `CacheConnectionError` at construction when
  neither is given. Redis error events are recorded (and forwarded to
  `onError`) instead of thrown from the listener — a throw there could crash
  the process.
- Library code never calls `process.exit()` — `AppConfig` throws
  `ConfigValidationError`, `BootifyApp.start()` throws `BootifyStartError`;
  graceful shutdown no longer exits the process (host's decision)
- `BootifyApp.build()` throws `BootifyStateError` when called twice;
  `start()` after `build()` no longer rebuilds
- Boolean env parsing fixed: `CONFIG_DEBUG=false` previously evaluated to
  `true` (`z.coerce.boolean` treats any non-empty string as true)
- Registration is strict: re-registering a token throws unless
  `{ override: true }` (framework decorators pass it to stay idempotent)
- Interface-typed constructor params (emitted as `Object`) throw
  `InterfaceTokenError` instead of silently injecting `undefined`
- `@Component`/`@Service`/`@Repository` no longer log to console at import
  time; the duplicate `registeredComponents` global registry was removed —
  the container is the single source of truth (scheduler discovers jobs via
  `container.getRegisteredComponents()`)
- `authorize()` middleware returns **403** for authenticated users without
  the required roles (previously 401) — 401 stays reserved for
  missing/invalid authentication
- Removed per-request `console.log` noise from context middleware, JWT
  strategy, AuthManager, cache decorators and event buses
- Router registration accepts `{ container, silent }`; pure helpers
  (`mergeSwaggerMetadata`, `buildFastifySchema`) are exported
- Buffered event config precedence is now `options.config` > env vars

### Removed
- **Deprecated pino logging path**: `Logger`, `PINO_LOGGER_TOKEN`,
  `loggerFactory`, `intitializeLogging()` and friends — use the
  `LoggerBuilder` (`createLogger()`); also removed the missing-file
  `posthog-transport.js` reference this path carried
- Legacy functional entry `src/api.ts` (the 2.x `createBootifyApp(options)`
  options-object API) — replaced by the builder: `createBootifyApp()` returns
  a fluent `BootifyApp`. The 2.x entry NAME is preserved: same
  `createBootifyApp()` you knew, new builder pattern. `createBootify()` is a
  `@deprecated` alias (removal in the next major).
- Unused dependencies: `@clickhouse/client`, `posthog-node`
- `@types/jsonwebtoken` moved to devDependencies
- Dead code: commented-out legacy DI container, commented decorator variants,
  no-op `tracing.middleware.ts`, empty `logging.config.ts`, unused
  `eagerIdentifiers` registry, root-level demo scripts
- `SchedulerService.getNextCronRun()` stub (returned `undefined`)
- Fixed pre-existing build failure in `src/cluster.ts` (top-level await under CJS)

### Migration guide
- `const { app, start, logger } = await createBootifyApp({...})...build()` →
  `const application = await createBootifyApp()...build()`; server via
  `application.handle`, logs via `application.logger`, start via
  `await application.start()`
- `createBootifyApp({ controllers, port })` (options object) →
  `createBootifyApp().setPort(3000).useControllers([...]).build()` (builder)
- `container.register(tok, {...})` on an existing token → add `override: true`
- Deprecated logger imports → `createLogger().build()` and `ILogger`

## [2.1.2] - 2026-01-18

See git history for earlier releases.
