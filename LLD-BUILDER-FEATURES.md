# LLD — Opinionated Builder Features (createBootify)

Vision (locked): **Spring Boot-style opinionated fallbacks.** Every core feature
works out of the box with sensible defaults, is customizable through builder
methods, and can be disabled entirely. A user should go from zero to a
documented, CORS-enabled, health-probed, traceable API in ~10 lines.

---

## 1. Default-on vs opt-in matrix (the core decision)

| Feature | Default | Customization | Rationale |
|---|---|---|---|
| Request context (`x-request-id`) | **ON** | `.disableRequestContext()` | Zero risk, core observability; k8s/trace propagation expectation |
| Structured logging w/ request context | **ON** (already) | `.useLogger()` | BaseLogger + `RequestContextProvider` already wired in `build()` |
| Health check at `/health` | **ON** | `.disableHealthCheck()` | Actuator-style; probe targets expect it; harmless response |
| CORS | **ON** (dev-safe) | `.enableCors(options)` to narrow, `.disableCors()` to turn off | Reflect-origin is safe-ish and unblocks local dev; production without an explicit origin list logs a **warning** |
| Swagger UI | **Opt-in, zero-config** | `.enableSwagger(options?)` | Exposing API docs by default in production is a security foot-gun (NestJS/Spring do not auto-enable either) |
| Auth | **Opt-in** | `.enableAuth(options?)` + decorators | Framework cannot guess secrets or your user store |

Principle: **default-ON only for features that are safe, stateless and
expected by every deployment** (tracing, health). Everything that leaks
information (swagger) or requires credentials (auth) is a one-liner opt-in
that works with zero options.

Every `enable*` is idempotent (calling twice logs a debug and no-ops) and
every feature has an explicit `disable*` counterpart.

---

## 2. Public API contract

```ts
const app = await createBootifyApp()
  .setServiceName('my-api')                    // feeds swagger title, health payload, logs
  .setPort(3000)
  .useConfig(schema)

  // --- defaults (already active, shown for discoverability) ---
  .disableRequestContext()                     // opt OUT of x-request-id/ALS context
  .disableHealthCheck()                        // opt OUT of GET /health

  // --- opt-in features ---
  .enableSwagger({                             // zero-config; all fields optional
    path?: string            // default '/docs'
    title?: string           // default `${serviceName} API`
    description?: string
    version?: string         // default VERSION
    jwtSecurity?: boolean    // default: true when auth is enabled -> bearerAuth scheme
  })
  .enableCors({                                // zero-config; all fields optional
    origin?: string | string[] | boolean   // default true (reflect); PROD warning if true
    methods?: string[]                     // default GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS
    credentials?: boolean                  // default true
    maxAge?: number                        // default 86400
  })
  .enableHealthCheck({                         // zero-config
    path?: string            // default '/health'
    readinessPath?: string   // default: none (opt-in '/ready')
    includeCache?: boolean   // default true — pings bound ICacheStore (500ms timeout)
  })
  .enableAuth({                                // zero-config IF env secrets exist
    strategy?: 'jwt' | 'api-key'           // default 'jwt'
    accessTokenSecret?: string             // default env JWT_ACCESS_SECRET
    refreshTokenSecret?: string            // default env JWT_REFRESH_SECRET
    accessTokenExpiry?: string             // default '15m'
    refreshTokenExpiry?: string            // default '7d'
    userProvider?, credentialValidator?, tokenStorage?
    global?: boolean                       // default false — authenticate ALL routes
  })

  .build()

await app.start()
```

Route-level auth decorators:

```ts
@UseAuth()                    // method OR class — require a valid token
@Roles('admin', 'manager')    // implies @UseAuth + role check (403 on mismatch)
@CurrentUser() user: any      // parameter decorator — verified JWT payload
```

---

## 3. Per-feature LLD

### 3.1 Request tracing & context (default ON)

**Files:** `src/middleware/context.middleware.ts`, `src/BootifyApp.ts`

- `createContextMiddleware(extractor?, options?: { trustIncomingRequestId?: boolean })`
  — keeps the current positional signature for back-compat; new options param.
- Enhancement: when `trustIncomingRequestId !== false` and the incoming
  request already has `x-request-id` (case-insensitive), **reuse it** as the
  ALS `requestId` and response header (trace propagation across services);
  otherwise generate `randomUUID()`.
- `BootifyApp.build()`: registers the context middleware as the FIRST
  `onRequest` hook unless `disableRequestContext()` was called.
- Structured logging: unchanged — `initializeLogger()` already attaches
  `RequestContextProvider`, so every log line inside a request carries
  `requestId`.
- Optional: `.enableRequestLogging()` adds `createRequestLoggerOnResponse(app.logger)`
  as an `onResponse` hook (access logs; opt-in because it is noisy).

### 3.2 Health check (default ON)

**Files:** `src/features/health.ts` (new), `src/BootifyApp.ts`

- `enableHealthCheck(options?)` stores config; `build()` registers:
  - `GET {path}` → `200 { status: 'ok', service, version, uptime, timestamp, checks? }`
  - `GET {readinessPath}` (only if configured) → same + dependency checks
- Cache probe: when `CACHE_STORE_TOKEN` is registered in the app container
  and the store implements `healthCheck()`, race it against a 500ms timeout
  and surface `{ cache: boolean }`. A failing cache check flips
  `/ready` to `503 { status: 'degraded' }` while `/health` stays 200
  (liveness vs readiness — k8s semantics).
- Registered through `usePlugin()` so it lands in the injected container's
  app instance and respects `setBasePrefix()` (default route is NOT prefixed —
  probes must live at root; document).
- `disableHealthCheck()` removes the default entirely.

### 3.3 CORS (default ON, dev-safe)

**Files:** `src/features/cors.ts` (new wrapper), `src/BootifyApp.ts`

- `enableCors(options?)` merges options over defaults
  `{ origin: true, credentials: true, methods: [...], maxAge: 86400 }`.
- Production guard at `build()` time: if `NODE_ENV === 'production'` and
  `origin === true` (reflect) → `console.warn` with guidance (never block —
  warn only; the user may have a proxy handling CORS).
- `.disableCors()` opts out entirely.
- Depends on `@fastify/cors` (regular dependency).

### 3.4 Swagger (opt-in, zero-config)

**Files:** `src/features/swagger.ts` (new), `src/BootifyApp.ts`

- `enableSwagger(options?)`:
  - path default `/docs`; registers `@fastify/swagger` +
    `@fastify/swagger-ui` with `{ openapi: { info: { title, version, description } } }`
  - title default `${serviceName} API`; version default `VERSION`
  - when auth is enabled (or `jwtSecurity: true`), adds
    `securitySchemes.bearerAuth = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }`
    and sets `security: [{ bearerAuth: [] }]` on routes carrying `@UseAuth`
    (router already merges `@Swagger` metadata into route schemas — swagger
    consumes the same route schemas, so `@Schema` zod bodies appear
    automatically)
- `@fastify/swagger` + `@fastify/swagger-ui` move devDependencies → dependencies.

### 3.5 Auth (opt-in) + decorators

**Files:** `src/auth/builder.ts` (new), `src/core/decorators.ts`,
`src/core/router.ts`, `src/constants/index.ts`, `src/types/fastify.d.ts`

**Decoupling rule (layering):** `core` must NOT import `auth`. The router
consumes auth middleware through a well-known container token declared in
core/constants; only `enableAuth` (which lives in the auth layer) registers
implementations against it.

```
AUTH_MIDDLEWARE_TOKEN = Symbol.for('bootify.auth.middleware')
// resolved shape: { authenticate: FastifyMiddleware, authorize(roles): FastifyMiddleware }
```

**New metadata keys** (constants): `AUTH_REQUIRED: 'bootify:auth'`,
`AUTH_ROLES: 'bootify:auth:roles'`.

**Decorators (core/decorators.ts):**
- `@UseAuth()` — class + method; sets `AUTH_REQUIRED = true` (method wins over class)
- `@Roles(...roles)` — class + method; sets `AUTH_ROLES` AND implies auth required
- `@CurrentUser()` — parameter decorator → `{ type: 'currentUser', name, index }`
  (same metadata shape as other param decorators — router change only)

**`enableAuth(options?)` (auth/builder.ts):**
1. Validates: strategy jwt requires secrets — from options or
   `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` env; missing → throw
   `ConfigValidationError` with an actionable message at BUILD time.
2. Creates `AuthManager` + `JwtStrategy` (or `ApiKeyStrategy`) with the
   merged config; registers into the app container:
   - `AuthManager` (class token, override)
   - `AUTH_MIDDLEWARE_TOKEN` → `{ authenticate, authorize }` where
     `authenticate` = `createAuthMiddleware({ secret: accessTokenSecret })`
     (same verification the strategy signs with — consistent) and
     `authorize` = existing `authorize(roles)` factory.
3. `global: true` → also `app.addHook('preHandler', authenticate)`.
4. Returns `AuthHandle { authManager, authenticate, requireRoles }` so users
   can also wire manually; app stores it as `app.auth`.

**Router changes (core/router.ts):**
- After reading class/method middleware metadata:
  - `authRequired = method.AUTH_REQUIRED ?? class.AUTH_REQUIRED ?? false`
  - `roles = method.AUTH_ROLES ?? class.AUTH_ROLES`
- If `authRequired || roles.length`:
  - resolve `AUTH_MIDDLEWARE_TOKEN` from `options.container`; absent →
    throw `BootifyStateError('@UseAuth/@Roles requires enableAuth() in createBootifyApp()')`
    at REGISTRATION time (fail fast, actionable)
  - prepend `[authenticate]`, and when roles present prepend
    `[authenticate, authorize(roles)]` to the route preHandler chain
- Param resolution: `case 'currentUser': return (request as any).user`

**Typing:** `src/types/fastify.d.ts` — declare module 'fastify'
`FastifyRequest { user?: Record<string, any>; authenticated?: boolean }`.

---

## 4. BootifyApp integration

New private fields: `swaggerOptions?`, `corsOptions?` (+`corsDisabled`),
`healthOptions?` (+`healthDisabled`), `authOptions?`, `requestContextDisabled`,
`requestLoggingEnabled`.

`build()` ordering (matters):
1. initializeLogger (unchanged)
2. plugins (user) — user plugins first, features must not be overridden by users
3. **features**: cors → swagger → auth(global hook if any) → health
4. controllers (routes) — auth metadata resolution happens here
5. context middleware registration happens via plugin list BEFORE controllers
   (it is an onRequest hook — order among onRequest hooks: context first)
6. error handler, eagerInit, scheduler (unchanged)

Each feature registration is wrapped in an idempotence guard and emits a
single startup log line via the startup logger (skipped in quiet mode).

---

## 5. Dependency changes (package.json)

| Package | From | To |
|---|---|---|
| `@fastify/swagger` | devDependencies | dependencies |
| `@fastify/swagger-ui` | devDependencies | dependencies |
| `@fastify/cors` | — | dependencies (^11) |

(`install` was interrupted earlier — re-run `npm install` before building.)

---

## 6. Test plan

**`tests/integration/builder-features.test.ts`** (createTestApp + inject):
1. health: `GET /health` → 200 `{ status:'ok', service, version, uptime }`; custom path; cache check surfaced when store bound; `/ready` 503 when cache unhealthy
2. cors: preflight `OPTIONS` carries `access-control-allow-origin`; production + reflect-origin logs warning (spy)
3. swagger: `GET /docs` → 200; `/docs/json` exposes title from serviceName, paths for registered controllers, zod body schemas; custom path; bearerAuth scheme when auth enabled
4. tracing: response carries `x-request-id`; incoming `x-request-id: trace-123` is REUSED; disabled via `disableRequestContext()` → header absent
5. auth: `@UseAuth` route → 401 without token, 200 with valid JWT; `@Roles('admin')` → 403 for wrong role; `@CurrentUser()` receives payload; class-level `@UseAuth` covers all methods; missing `enableAuth` → build throws with actionable message
6. disabling: `disableHealthCheck()` → 404; `disableCors()` → no CORS headers

**`tests/unit/auth/decorators.test.ts`**: `@UseAuth`/`@Roles` metadata storage
(class + method override matrix); `@CurrentUser()` param metadata
`{ type:'currentUser', index }`.

**`tests/unit/middleware/context-middleware.test.ts`** (extend): incoming
`x-request-id` reuse.

---

## 7. Sequencing (build order)

| # | Step | Why first |
|---|---|---|
| 1 | constants + decorators (`@UseAuth/@Roles/@CurrentUser`) + router plumbing | pure metadata, no runtime deps |
| 2 | context middleware x-request-id propagation + BootifyApp default wiring | default-on foundations |
| 3 | health check | smallest feature module |
| 4 | cors | wrapper only |
| 5 | enableAuth | needs middleware token + decorators |
| 6 | swagger | consumes everything (schemas + security) |
| 7 | tests per feature + CHANGELOG + README claims sync | contract lock-in |

Estimate: 2-3 days.

## 8. Risks / decisions to be aware of

| Risk | Decision |
|---|---|
| Swagger auto-on would leak API surface | **Opt-in** (deviates from "all default-on", matches Spring/NestJS practice) |
| CORS reflect-origin in production | Warn loudly, never block (proxy setups vary) |
| core ↔ auth coupling | Container token in constants; only auth layer registers it |
| Route 404 vs 401 for unknown paths under global auth | Global hook is preHandler — unknown routes 404 as usual |
| swagger deps add install weight | Accepted; they are the framework's own feature deps |
| `request.user` typing for api-key strategy | Same payload contract (sub/roles) documented for both strategies |
