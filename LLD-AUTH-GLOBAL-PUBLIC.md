# LLD — Global Auth × `@Public()` (metadata-aware global authentication)

> Status: LLD awaiting approval. Scope: make `.enableAuth({ global: true })`
> respect `@Public()` routes and keep probes/CORS-preflight working, without
> changing the semantics of route-level (`@UseAuth`) authentication.

## 1. Problem statement

`.enableAuth({ global: true })` installs a **raw Fastify preHandler hook**:

```ts
if (this.authOptions.global) {
  this._app.addHook('preHandler', this.authHandle.authenticate)
}
```

A raw hook is **metadata-blind**. Consequences:

1. `@Public()` routes are still authenticated — no per-route opt-out under
   global mode (route-level `@UseAuth` mode DOES respect `@Public`, via the
   router's metadata path).
2. The built-in `GET /health` + `/ready` probes would demand a token —
   Kubernetes liveness/readiness probes cannot authenticate.
3. CORS preflight (`OPTIONS` requests) would hit authentication and fail —
   preflights never carry credentials.

This closes the loop on the "three tiers" model:

```
global: true  → everything authenticated, EXCEPT @Public routes + /health + preflights
@Public()     → per-route opt-out (works in global AND non-global mode)
@UseAuth()    → per-route/class opt-in (non-global mode)
```

## 2. Background: the two auth paths today

| Path | Mechanism | `@Public()` today |
|---|---|---|
| Route-level (`@UseAuth`) | Router reads `AUTH_REQUIRED` metadata, prepends `authenticate` (+`authorize(roles)`) to the route's preHandler chain | ✅ respected — `@Public()` stores `false`, and resolution is `method ?? class ?? false` (`??` skips only null/undefined, so explicit `false` wins) |
| Global (`global: true`) | Raw `app.addHook('preHandler', authenticate)` — fires for every request regardless of metadata | ❌ ignored |

## 3. Design: route-config stamping

Fastify carries route options `config` into `request.routeOptions.config` at
request time. We stamp a marker on routes that opt out; the global hook
consults it.

### 3.1 Marker contract

```ts
// src/constants/index.ts
export interface RouteAuthConfig {
  /** When true, the global auth preHandler skips this route. */
  authPublic?: boolean
}
```

- Marker name: `authPublic` on the route `config` object.
- Absence of the marker = authenticated under global mode (the "global"
  semantic is preserved — a route registered directly via `app.get` without
  a marker is authenticated, matching "everything by default").

### 3.2 Router stamping (`src/core/router.ts`)

In `registerControllers`, when building each `routeOptions`:

```ts
const isPublic = Reflect.getMetadata(METADATA_KEYS.authRequired, controllerClass, route.handlerName) === false
  || Reflect.getMetadata(METADATA_KEYS.authRequired, controllerClass) === false

const routeOptions: RouteOptions = {
  method: route.method,
  url,
  schema,
  ...(isPublic ? { config: { authPublic: true } } : {}),
  preHandler: allMiddlewares,
  handler: ...
}
```

Notes:
- Only stamp when an explicit `@Public()` exists — never mutate a user route
  config silently otherwise.
- Method-level `@Public()` wins over class-level `@UseAuth` (the `=== false`
  check reads the same `AUTH_REQUIRED` metadata the router already resolves
  for auth-required routes — single source of truth).
- No change to the non-global auth path: routes with `@UseAuth` metadata
  keep getting the authenticate/authorize middleware prepended exactly as
  today.

### 3.3 Health feature stamping (`src/features/health.ts`)

`/health` and `/ready` register with `config: { authPublic: true }`:

```ts
app.get(path, { config: { authPublic: true }, schema: { tags: ['System'], ... } }, handler)
```

Liveness/readiness must never require authentication — probe contracts.

### 3.4 Global hook wrapper (`src/BootifyApp.ts`)

Replace the raw hook with a config-aware wrapper:

```ts
if (this.authOptions.global) {
  const authenticate = this.authHandle.authenticate as FastifyMiddleware
  const globalAuth: FastifyMiddleware = async (request, reply) => {
    // CORS preflights carry no credentials — never authenticate them.
    if (request.method === 'OPTIONS') return
    // @Public routes (and /health) opt out via route config.
    const config = (request as any).routeOptions?.config
    if (config?.authPublic) return
    await authenticate(request, reply)
  }
  this._app.addHook('preHandler', globalAuth)
}
```

Notes:
- `request.routeOptions` is the Fastify v5 API (this project pins fastify ^5).
- The wrapper preserves `authenticate`'s existing contract: missing header →
  `authenticated: false` + continues; invalid token → `user: null` — actual
  rejection still comes from `authorize`/`@UseAuth` chains for route-level
  mode. Under global mode, unauthenticated requests proceed with
  `authenticated: false` exactly like today's route-level flow; **protected
  controllers must declare `@UseAuth`** — documented (global mode currently
  behaves this way too: the raw hook only *marks*, it doesn't reject).

  ⚠️ Semantics note (unchanged from current global behavior): the global
  authenticate marks `request.authenticated`; routes that must hard-reject
  anonymous callers add `@Roles(...)`/`@UseAuth` or an `authorize()` step.
  This matches the CMS starter's soft-authenticate pattern.

- CORS interplay: `enableCors` preflight handling stays; the OPTIONS skip
  only bypasses authentication.

### 3.5 Compatibility

| Scenario | Behavior after this LLD |
|---|---|
| Non-global `@UseAuth` mode | Unchanged — metadata path untouched |
| `global: true` + no `@Public` | Everything authenticated (minus /health, OPTIONS) — same "global" promise |
| `global: true` + `@Public` | Public route skips authentication |
| User-registered route (direct `app.get`, no marker) | Authenticated under global — global default preserved |
| Swagger/static/admin routes under global | Authenticated (registered without the marker) — matches CMS behavior; users can add their own `config` when registering directly |
| Existing tests | Global-auth tests updated for the two new public paths (/health, OPTIONS) |

## 4. Test matrix

| # | Case |
|---|---|
| 1 | `global: true` + `@UseAuth` route → 401 without token, 200 with valid token |
| 2 | `global: true` + `@Public()` route → 200 **without** token |
| 3 | `global: true` + class-level `@UseAuth` + method `@Public` → method is public, siblings protected |
| 4 | `/health` under `global: true` → 200 without token |
| 5 | Non-global mode regression: `@UseAuth`/`@Public` behave exactly as before |
| 6 | CORS preflight: `OPTIONS` under `global: true` + `enableCors` → 204 without token, CORS headers present |
| 7 | Direct route (no marker) under `global: true` → authenticated=true set by hook |
| 8 | Router stamping: only `@Public` routes carry `authPublic` (introspect routeOptions via inject + a probe route) |

## 5. File changes

| File | Change |
|---|---|
| `src/constants/index.ts` | `RouteAuthConfig` interface (typed marker contract) |
| `src/core/router.ts` | stamp `config: { authPublic: true }` on `@Public` routes |
| `src/BootifyApp.ts` | global hook wrapper (OPTIONS skip + config check) |
| `src/features/health.ts` | stamp `/health` + `/ready` |
| `tests/integration/builder-features.test.ts` or new `auth-global.test.ts` | matrix §4 |
| `src/cache/README.md` / root README auth sections | one-line note: `@Public` now works under `global: true` |

**Estimate: ~1.5h** including the test matrix.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Fastify strips route `config`? | It doesn't — `routeOptions.config` is the documented pattern (verify with the probe test #8) |
| Users overwrite `config` on their own routes | Marker only stamped by the router for @Public; user `config` merging is out of scope and unchanged |
| Global + soft-authenticate confusion | Documented explicitly in §3.4 (unchanged semantics, now with opt-outs) |
