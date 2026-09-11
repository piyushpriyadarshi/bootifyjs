# LLD — enableAuth Route Rules + Token Extraction (global auth engine)

> Status: APPROVED. Extends `LLD-AUTH-GLOBAL-PUBLIC.md` (metadata-aware global
> auth, `@Public()`, /health stamping) with the Spring-style ordered route
> rules engine and pluggable token extraction.
>
> Direction (locked): **NestJS core, Spring edges, Express escape hatch** —
> deny-by-default global mode, decorator opt-outs, declarative path rules,
> pluggable token location.

## 0. Locked decisions (Q1–Q8, recommended defaults)

| ⚖️ | Decision |
|---|---|
| 1 | **`@Public()` wins over `routes[]` rules** — explicit per-route intent beats global config |
| 2 | **Glob matching**: exact, `*` (one segment), `**` (all remaining segments), `RegExp` passthrough — matched against `request.routeOptions.url` (the route pattern, query excluded) |
| 3 | **Method-scoped rules included** — `methods?: string[]` on rules (webhook case) |
| 4 | **`roles` in global rules included** — path-level role gates via the existing `authorize` |
| 5 | **`tokenExtractor` + `cookieName` sugar included** — the CMS cookie pattern unblocked |
| 6 | **Rules apply only in `global: true` mode** — non-global has no global gate (documented constraint) |
| 7 | **Single `routes` array** (ordered, first-match-wins) — no separate publicPaths sugar |
| 8 | Non-global mode: rules cannot arise (per ⚖️6) |

## 1. Contract

```ts
type AuthDecision = 'public' | 'required'
type RoutePathPattern = string | RegExp

export interface AuthRouteRule {
  path: RoutePathPattern                      // route pattern or regex
  methods?: string[]                          // e.g. ['POST'] for webhooks (default: any)
  auth?: AuthDecision                         // default: 'required'
  roles?: string[]                            // path-level role gate (implies 'required')
}

export interface EnableAuthOptions {
  // ...existing (strategy, secrets, userProvider, credentialValidator, tokenStorage)
  global?: boolean
  /** Global-mode only. Ordered, first-match-wins. Evaluated against the
   *  Fastify route pattern (request.routeOptions.url) + method. */
  routes?: AuthRouteRule[]
  /** Full override for token extraction (default: Bearer header). */
  tokenExtractor?: (request: FastifyRequest) => string | undefined
  /** Sugar: also read the token from this cookie when the header is absent. */
  cookieName?: string
}
```

## 2. Resolution order (final)

| Priority | Source | Notes |
|---|---|---|
| 1 | Route `config.authPublic === true` (from `@Public()`) | skip authentication entirely |
| 2 | `request.method === 'OPTIONS'` | CORS preflights carry no credentials |
| 3 | First matching `routes[]` rule (global mode) | `auth: 'public'` → skip; `roles` → authenticate then `authorize(roles)`; no match → authenticate |
| 4 | (non-global mode) | no global hook — decorator metadata only |

Decorators (`@UseAuth`/`@Roles`) continue to work through the router's
metadata path in non-global mode — unchanged.

## 3. Glob matcher (`src/commons/path-match.ts` — commons placement rule: used by auth, reusable)

```ts
/**
 * Glob semantics: '**' matches any remaining segments; '*' matches exactly
 * one segment; other characters are literal. RegExp values are used as-is
 * against the candidate string.
 */
export function matchesPath(pattern: string | RegExp, url: string): boolean
```

- Compiled at build time where possible (`enableAuth` validates + precompiles
  patterns; `ConfigValidationError` on malformed regex/globs).
- Leading slash normalized; trailing slashes collapsed.

## 4. Global hook (v2)

```ts
if (this.authOptions.global) {
  const rules = compileRules(this.authOptions.routes ?? [])
  const authenticate = this.authHandle.authenticate
  const authorize = this.authHandle.requireRoles

  const globalAuth: FastifyMiddleware = async (request, reply) => {
    if (request.method === 'OPTIONS') return
    const config = (request as any).routeOptions?.config
    if (config?.authPublic) return

    const rule = matchRule(rules, request)                 // first match or undefined
    if (rule?.auth === 'public') return
    await authenticate(request, reply)
    if (rule?.roles?.length) await authorize(rule.roles)(request, reply)
  }
  this._app.addHook('preHandler', globalAuth)
}
```

`matchRule` matches `request.routeOptions.url` (route pattern) + method.
`tokenExtractor`/`cookieName` are wired into the auth middleware chain
(`createAuthMiddleware` gains an options field — see §5).

## 5. Token extraction (`src/middleware/auth.middleware.ts`)

```ts
export interface AuthMiddlewareOptions {
  secret: string
  tokenCache?: TokenCache
  /** Full override. Default: Bearer header. */
  tokenExtractor?: (request: FastifyRequest) => string | undefined
  /** Sugar: fall back to this cookie when the header is absent. */
  cookieName?: string
}
```

Default chain: `Authorization: Bearer <token>` → (if `cookieName`) cookie →
undefined. `enableAuth` forwards `tokenExtractor`/`cookieName` into the
middleware bundle; the same extraction feeds the global hook.

**`cookieName` requires `@fastify/cookie` registered** (user-side via
`usePlugin`) — documented; cookie parsing failure → treated as absent token.

## 6. Test matrix

| # | Case |
|---|---|
| 1 | rules: `/health public`, protected route → 200/401/200-with-token |
| 2 | rules order: first-match-wins (two overlapping patterns, opposite decisions) |
| 3 | `**` vs `*` glob semantics (`/admin/**` matches `/admin/x/y`; `*` does not) |
| 4 | RegExp rule passthrough |
| 5 | method-scoped rule: `POST /webhooks/*` public, `GET /webhooks/*` authenticated |
| 6 | `roles` rule: path gate 403 for wrong role (token required first) |
| 7 | `@Public()` beats a contradicting rule (route marked public, rule says required → public) |
| 8 | malformed rule patterns → `ConfigValidationError` at build |
| 9 | default extractor: Bearer header; `cookieName`: cookie fallback; `tokenExtractor`: full override |
| 10 | OPTIONS preflight skipped (with cors) under global + rules |
| 11 | non-global mode: rules ignored (documented constraint — no behavioral change) |
| 12 | /health public under global (carried from LLD-AUTH-GLOBAL-PUBLIC) |

## 7. File changes

| File | Change |
|---|---|
| `src/commons/path-match.ts` | NEW — glob/regex matcher |
| `src/cache/../auth/builder.ts` | `EnableAuthOptions` gains `routes`, `tokenExtractor`, `cookieName`; compile/validate rules at build |
| `src/middleware/auth.middleware.ts` | token extraction options on `createAuthMiddleware` |
| `src/BootifyApp.ts` | rules-aware global hook (v2), forwards token options |
| `tests/integration/auth-rules.test.ts` | NEW — matrix §6 |
| `LLD-AUTH-GLOBAL-PUBLIC.md` / bible | cross-reference + usage docs |

**Estimate: ~2h** including tests.
