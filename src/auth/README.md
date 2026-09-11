# BootifyJS Auth (`bootifyjs/auth`)

> **The module bible** — everything about the authentication system: the mental
> model, the API, the internals, and every gotcha. Written so a newcomer can go
> from zero to confident in one read, and experienced users can treat it as the
> reference for this module.

---

## 1. The 30-second mental model

```
enableAuth({ ... })             ← builder wiring (secrets, providers, rules)
        │  creates
        ▼
AuthManager                     ← orchestrator: strategy registry + auto-detect
        ├── JwtStrategy         ← login / validate / refresh / revoke (jsonwebtoken)
        └── ApiKeyStrategy      ← key creation / validation / rotation (crypto)
        │  (both depend on injected callbacks — never on your database)
        ▼
TokenStorage                    ← the pluggable persistence contract
        ├── InMemoryTokenStorage ← default. Map + TTL. Per-process.
        └── RedisTokenStorage   ← optional. Real Redis via an injected client.

@UseAuth() / @Public() / @Roles() / @CurrentUser()   ← route-level declarative protection
createAuthMiddleware(...)       ← the Fastify preHandler that verifies Bearer tokens
```

Three sentences:

1. **A strategy** knows how to authenticate, validate, refresh and revoke —
   JWT and API-key ship built-in, and the `AuthStrategy` interface is open for
   your own (OAuth2, SAML, LDAP…).
2. **`AuthManager`** registers strategies, picks one per request (explicit →
   context → auto-detect → default) and delegates.
3. **You own the data**: the framework never touches your database or your
   password hashing — it calls *your* `credentialValidator` and
   `userProvider` callbacks and only handles tokens.

Everything below expands on this picture.

---

## 2. Quick start

### 2.1 The builder way (recommended)

```ts
import { createBootifyApp, Controller, Post, Body, UseAuth, CurrentUser } from 'bootifyjs'

const app = await createBootifyApp()
  .enableAuth({
    // Secrets: pass explicitly OR rely on JWT_ACCESS_SECRET / JWT_REFRESH_SECRET env vars
    accessTokenSecret: process.env.JWT_ACCESS_SECRET,
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET,
    userProvider: (userId) => userRepository.findById(userId),        // called on validate/refresh
    credentialValidator: async ({ email, password }) => {             // called on login
      const user = await userRepository.findByEmail(email)
      return user && (await bcrypt.compare(password, user.passwordHash)) ? toAuthUser(user) : null
    },
  })
  .useControllers([AuthController, UserController])
  .build()
```

Secrets are validated at **build time** with an actionable
`ConfigValidationError` — never at request time. With only the env vars set,
`.enableAuth()` alone is enough (zero-config).

### 2.2 Protecting routes

```ts
@Controller('/users')
@UseAuth()                          // class-level: EVERY route requires a valid token
export class UserController {
  @Public()                         // method-level opt-out (no token needed)
  @Get('/health')
  health() { return { ok: true } }

  @Roles('ADMIN', 'MANAGER')        // implies @UseAuth + 403 role gate
  @Get('/admin-stats')
  stats(@CurrentUser() user: any) { // ← verified token payload injected
    return { for: user.sub }
  }
}
```

Using `@UseAuth()`/`@Roles()` without `.enableAuth()` fails the **build**
with a clear error (`BootifyStateError`) — no silent no-ops.

### 2.3 The login route (you write it)

`enableAuth()` gives you the machinery, not an opinionated `/login` endpoint.
A login route is ~10 lines:

```ts
@Controller('/auth')
export class AuthController {
  constructor(private auth: AuthManager) {}   // enableAuth() registered it in the container

  @Post('/login')
  async login(@Body() body: any, @Req() request: any) {
    const result = await this.auth.authenticate({
      type: 'login',
      strategy: 'jwt',
      request,
      headers: request.headers,
      body,                                    // { email, password } → credentialValidator
    })
    if (!result.success) throw new HttpError(401, result.error!)
    return { user: result.user, tokens: result.tokens }  // { accessToken, refreshToken, expiresIn, tokenType: 'Bearer' }
  }
}
```

The refresh and logout endpoints follow the same shape:
`auth.refresh(refreshToken, ctx)` and `auth.revoke(token, ctx)`.

---

## 3. Architecture

```
src/auth/
├── types.ts                        # User, TokenPair, AuthResult, AuthContext,
│                                   # TokenStorage, AuthStrategy, error hierarchy
├── AuthManager.ts                  # orchestrator (registry, selection, sessions)
├── builder.ts                      # setupAuth() behind enableAuth() — fail-fast wiring,
│                                   # route rules (compileAuthRules / matchAuthRule)
├── strategies/
│   ├── JwtStrategy.ts              # access+refresh pair, rotation, blacklist-on-revoke
│   └── ApiKeyStrategy.ts           # hashed keys, scopes, rotation, per-user limits
└── storage/
    ├── in-memory-token-storage.ts  # the default (Map + TTL)
    └── RedisTokenStorage.ts        # real Redis via an injected RedisClient interface

src/middleware/
├── auth.middleware.ts              # createAuthMiddleware() — Bearer verify + TokenCache
└── authorization.middleware.ts     # authorize(roles), isUserAuthorized, requireAdmin…

src/core/decorators.ts              # @UseAuth, @Public, @Roles, @CurrentUser (metadata)
src/core/router.ts                  # consumes the metadata + AUTH_MIDDLEWARE_TOKEN
src/BootifyApp.ts                   # enableAuth() options, global deny-by-default hook
src/constants/index.ts              # AUTH_MIDDLEWARE_TOKEN (DI symbol)
```

**The DI token.** `enableAuth()` registers two things into the container:

- `AUTH_MIDDLEWARE_TOKEN` → an `{ authenticate, authorize }` bundle. The router
  resolves this token when it sees `@UseAuth()`/`@Roles()` metadata — this keeps
  the core decoupled from the auth module.
- `AuthManager` → the orchestrator itself, so controllers can inject it.

---

## 4. The contract: `AuthStrategy`

```ts
export interface AuthStrategy {
  readonly name: string                       // registry key, e.g. 'jwt'
  readonly type: AuthStrategyType             // JWT | API_KEY | OAUTH2 | SAML | LDAP

  initialize(config: AuthConfig): Promise<void>            // called once at registration
  authenticate(context: AuthContext): Promise<AuthResult>  // login / creation
  validate(token: string, context: AuthContext): Promise<AuthResult>
  refresh?(refreshToken: string, context: AuthContext): Promise<AuthResult>
  revoke?(token: string, context: AuthContext): Promise<boolean>
}
```

`AuthResult` is the universal return shape:

```ts
{ success: boolean; user?: User; tokens?: TokenPair; error?: string; metadata?: Record<string, any> }
```

Writing your own strategy is implementing ~4 methods and registering it
(§8.4). Everything the strategy needs — user lookup, credential checking,
persistence — arrives via the injected callbacks/config, so a strategy is
testable with zero infrastructure.

**Strategy selection order** (`AuthManager.selectStrategy`):

1. explicit `strategyName` argument to `authenticate()/validate()/…`
2. `context.strategy`
3. **auto-detect** from headers: `x-api-key`/`api-key` → `api-key`;
   `Authorization: Bearer …` → `jwt`
4. the default strategy (first registered, or the one marked `isDefault`)

---

## 5. The strategies

### 5.1 `JwtStrategy`

Full access/refresh token lifecycle with `jsonwebtoken`:

- **`authenticate(context)`** — takes credentials from `context.body`, hands
  them to your `credentialValidator`. On a non-null `User` it signs a token
  pair and stores the refresh token (`refresh:<jti>`) in the `TokenStorage`.
- **`validate(token)`** — `jwt.verify` against the access secret (issuer /
  audience / algorithm configurable), then loads the user via `userProvider`.
  Expired → `TOKEN_EXPIRED`; malformed → `INVALID_TOKEN` (both in
  `metadata.code`).
- **`refresh(refreshToken)`** — verifies against the **refresh secret**, checks
  the token still exists in storage (revocation-aware), issues a **new pair**
  (rotation), stores the new refresh token and deletes the old one.
- **`revoke(token)`** — deletes the refresh token and writes
  `blacklist:<jti>` with the remaining TTL. ⚠ See gotcha §10.1.

**The token payloads** (fixed framework keys — extend the access token with
`payloadBuilder`, §8.2):

```ts
// access token:
{ sub: user.id, email: user.email, roles: user.roles,
  permissions: user.permissions, type: 'access', iat, jti,
  ...payloadBuilder(user, context) }  // optional custom claims, spread LAST

// refresh token (deliberately minimal):
{ sub: user.id, type: 'refresh', iat, jti }
```

Config (`JwtStrategyConfig`): `accessTokenSecret`, `refreshTokenSecret`,
`accessTokenExpiry` (default `15m`), `refreshTokenExpiry` (default `7d`),
`issuer?`, `audience?`, `algorithm?` (default `HS256`), `tokenStorage?`,
`userProvider` (required), `credentialValidator?` (required for login),
`payloadBuilder?` (custom access-token claims — re-minted on login AND
refresh).
Expiry accepts a string (`'15m'`, `'7d'` — units `s|m|h|d|w`) or seconds.

### 5.2 `ApiKeyStrategy`

Keys of the form `ak_<uuid>.<secret>` — only the **hash** of the secret is
stored; the plaintext is shown once at creation.

- **`authenticate(context)`** is **key creation**, not verification: it expects
  `{ userId, name, scopes?, expiresIn? }` in the body, checks the per-user key
  limit (`maxKeysPerUser`, default 10), and returns the plaintext key pair.
- **`validate(apiKey)`** — parses `keyId` + secret, looks up `apikey:<keyId>`,
  checks active/expiry, compares the sha256 hash, updates `lastUsedAt`, loads
  the user and **filters her permissions down to the key's scopes**.
- **`refresh(refreshKey)`** — rotates the secrets under the same `keyId`
  (keeping the original expiry window).
- **`revoke`** marks the key inactive; `deleteApiKey` removes it permanently;
  `listUserApiKeys` lists sanitized (hash-stripped) keys.

Config: `tokenStorage` (required — there is no stateless API-key mode),
`userProvider` (required), `keyPrefix?` (`ak_`), `keyLength?` (32),
`hashAlgorithm?` (`sha256`), `defaultScopes?` (`['read']`), `maxKeysPerUser?`
(10), `keyExpiry?`.

⚠ In builder mode (`enableAuth({ strategy: 'api-key' })`) the route-decorator
`authenticate` bundle is a **no-op** — API-key validation is per-request via
the strategy (call `authManager.validate(key, ctx)` in your routes), because
key lookup requires storage access on every request. See §10.7.

---

## 6. Token storage

### 6.1 The contract

```ts
export interface TokenStorage {
  store(key: string, value: any, ttl?: number): Promise<void>  // ttl = seconds
  get(key: string): Promise<any>                               // null on miss
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

~20 lines for a custom backend (Postgres, DynamoDB, a JSON file…). Keys the
strategies write: `refresh:<jti>`, `blacklist:<jti>`, `apikey:<keyId>`,
`user_keys:<userId>`, plus `session:*` from `AuthManager`.

### 6.2 `InMemoryTokenStorage` (the default)

A `Map` with lazy TTL eviction — zero-config, fine for single-instance
development and POCs. Multi-instance production must swap it out: refresh-token
rotation state lives here, and with N instances behind a load balancer a
refresh token issued by instance A would be "revoked" from instance B's point
of view.

### 6.3 `RedisTokenStorage`

```ts
import { RedisTokenStorage } from 'bootifyjs/auth'

const storage = new RedisTokenStorage({
  client: myRedisClient,      // ANY object with get/set/del/exists/expire/ttl
  keyPrefix: 'auth:',         // namespacing — your keys never collide
  defaultTTL: 604800,         // seconds
  serializer: { serialize, deserialize },  // default JSON
})
```

The `RedisClient` is an **interface**, not a package import — ioredis, a
wrapper, or a test fake all work. Extras: `setTTL`, `getTTL`, `storeBatch`,
`getBatch`, `deleteBatch`, `healthCheck()` (write/read/delete round-trip),
`getStats()`. Values round-trip through JSON: `Date` fields come back as ISO
**strings** (§10.6).

### 6.4 Your own backend (the JSON-file example)

The "users in a JSON file" scenario needs no framework support — it's just
callbacks:

```ts
// users.json: [{ id, email, passwordHash, roles, permissions }]
const db = JSON.parse(await fs.readFile('users.json', 'utf8'))

const credentialValidator = async ({ email, password }) => {
  const u = db.find((x) => x.email === email)
  return u && (await bcrypt.compare(password, u.passwordHash))
    ? { id: u.id, email: u.email, roles: u.roles, permissions: u.permissions, createdAt: u.createdAt }
    : null
}
const userProvider = async (id) => {
  const u = db.find((x) => x.id === id)
  return u ? { id: u.id, email: u.email, roles: u.roles, permissions: u.permissions, createdAt: u.createdAt } : null
}
```

Swap `bcrypt` for argon2/scrypt/your LDAP call — the framework doesn't care
(§8.1).

---

## 7. Route protection: decorators, global mode, rules

### 7.1 Decorators (opt-in mode — the default)

| Decorator | Level | Meaning |
|---|---|---|
| `@UseAuth()` | method or class | route(s) require a verified token |
| `@Public()` | method or class | explicit opt-out (overrides class-level `@UseAuth`) |
| `@Roles(...roles)` | method or class | requires auth **and** one of the roles (403 otherwise) |
| `@CurrentUser()` | param | injects `request.user` (the verified token payload) |

Resolution: **method-level metadata wins over class-level**;
`authRequired = method ?? class ?? false`. `@Public()` works by storing an
explicit `false`, which the router also stamps into the Fastify route config
(`config.authPublic`) so global hooks can skip it.

The per-route pipeline the router builds when auth is required:

```
preHandler: [ authenticate,      ← verify Bearer token, set request.user / .authenticated
              authorize(roles) ] ← 401 if unauthenticated; 403 if role missing
```

### 7.2 Global mode (deny-by-default)

```ts
.enableAuth({ global: true, routes: [...rules] })
```

Every route is authenticated **unless** one of:

1. `OPTIONS` preflight requests
2. routes decorated `@Public()`
3. a matching `routes` rule with `auth: 'public'`

Unmatched routes without a token get `401 Unauthorized`. Rules are
**first-match-wins** and validated at build time.

### 7.3 Route rules (`AuthRouteRule`)

```ts
enableAuth({
  global: true,
  routes: [
    { path: '/auth/login',  methods: ['POST'], auth: 'public' },
    { path: '/health',      auth: 'public' },
    { path: '/admin/**',    roles: ['ADMIN'] },        // auth implied + role gate
    { path: /^\/internal/,  auth: 'required' },
  ],
})
```

- `path`: a Fastify-style pattern (`'*'` = one segment, `'**'` = all remaining)
  or a `RegExp`.
- `methods`: optional restriction (uppercase-normalized).
- `roles`: implies authentication + a 403 role gate.
- Build-time validation (`compileAuthRules`) rejects: empty paths, invalid
  RegExp, bad `auth` values, and `auth: 'public'` combined with `roles`.

Rules are matched against the **route pattern** (`routeOptions.url`), so a rule
for `/users/:id` matches the request even though `request.url` has the concrete
id.

### 7.4 The token-extraction knobs

`createAuthMiddleware` (which `enableAuth()` wires) finds the token by:

```ts
options.tokenExtractor?.(request)          // 1. full override (return the raw token)
?? request.headers.Authorization            // 2. Bearer header (prefix stripped if present)
?? request.headers.authorization
?? request.cookies?.[options.cookieName]   // 3. cookie fallback (needs @fastify/cookie)
```

So: "Bearer token" support is the default; custom schemes (custom headers,
query params, mTLS client certs, session cookies) plug in via
`enableAuth({ tokenExtractor })` or `cookieName`.

### 7.5 The `TokenCache` (middleware performance + a gotcha)

`createAuthMiddleware` caches **verified** tokens (keyed by the raw token
string) until their `exp`, so hot paths skip `jwt.verify`. The cache is
injectable (`tokenCache` option) — swap in a Redis-backed one for
multi-instance deployments. `TokenCache.clear()` exists for tests/shutdown.

⚠ Because the cache short-circuits verification, **revocation is not seen by
cached tokens** — see §10.3.

---

## 8. Customization cookbook (the "how do I…" section)

### 8.1 Custom password hashing / credential checking

The framework has **no opinion** about passwords. `credentialValidator` is the
entire login check — swap the library, swap everything:

```ts
// bcrypt today
credentialValidator: async ({ email, password }) => {
  const user = await users.findByEmail(email)
  return user && (await bcrypt.compare(password, user.passwordHash)) ? toAuthUser(user) : null
}

// argon2 tomorrow — nothing else changes
credentialValidator: async ({ email, password }) => {
  const user = await users.findByEmail(email)
  return user && (await argon2.verify(user.passwordHash, password)) ? toAuthUser(user) : null
}
```

Any credential shape works (`{ username, password }`, `{ apiKey }`,
`{ email, otp }`…) — `context.body` is passed through untouched. Return a
`User` on success, `null` on failure; that's the whole contract.

### 8.2 Custom claims inside the JWT (roles, goals, tenant, …)

The access token carries a fixed set of framework keys — `sub`, `email`,
`roles`, `permissions`, `type`, `iat`, `jti` — plus **any custom claims you
add via `payloadBuilder`**. Two ways to carry more data:

**a) Keep the token minimal — put the data in the `User` (recommended when the
data is per-request fresh).** `validate()` calls `userProvider(sub)` on every
request; anything you return there (goals, tenant, preferences) is available
as `result.user` and can be copied onto `request.user` by a custom middleware.
The JWT stays small, and claim data is always fresh — change the user's roles
and the *next request* sees them (no waiting for token expiry).

**b) Embed claims in the access token via `payloadBuilder` (recommended when
every request should read them without a lookup).** Add a function to the
strategy config (or `enableAuth()`):

```ts
enableAuth({
  accessTokenSecret, refreshTokenSecret, userProvider, credentialValidator,
  payloadBuilder: (user, context) => ({
    tenant: user.metadata?.tenantId ?? 'default',   // static per user…
    client: context.headers['x-client-id'],         // …or derived per request
  }),
})
```

The returned object is spread **after** the framework defaults, so you may
override `email`/`roles`/`permissions` (e.g. intentionally strip
permissions with `() => ({ permissions: [] })`) — but **`sub`, `type`, `iat`,
`jti` are reserved**: a builder touching them fails fast at token-generation
time (`JWT_PAYLOAD_CLAIM_RESERVED` → `{ success: false, error }`). The
JWT-standard `exp`/`iss`/`aud` are set by the signing options and are
untouchable by construction. Custom claims are re-minted on **refresh** too
(both issue a new pair), and the refresh token itself stays minimal (see §10.13).

`payloadBuilder` receives `(user, context)` — `user` is the freshly resolved
login user (or `userProvider` result on refresh), `context` lets you derive
request-scoped claims (device, client, region…).

### 8.3 Side effects on auth events (audit, welcome emails, lockouts)

There are no built-in auth event hooks today. The supported places to run side
effects:

```ts
credentialValidator: async (creds) => {
  const user = await checkAndLockOut(creds)                        // failed-attempt counting, lockout
  emit('auth.login_attempt', { email: creds.email, ok: !!user })   // audit
  return user
},

userProvider: async (id) => {
  const user = await users.findById(id)
  if (!user) emit('auth.user_disappeared', { id })                 // audit anomaly
  return user
},
```

Or wrap the orchestrator once, centrally:

```ts
class AuditingAuthManager extends AuthManager {
  async authenticate(ctx: AuthContext, name?: string) {
    const result = await super.authenticate(ctx, name)
    emit(result.success ? 'auth.login' : 'auth.login_failed', { ctx, result })
    return result
  }
  async refresh(token: string, ctx: AuthContext, name?: string) { /* same idea */ }
}
```

`AuthManager` is a plain class (no decorators, no singletons) — extending and
wrapping it is safe. (First-class `onLogin`/`onRefresh`/`onRevoke` hooks are a
natural future addition — see §12.)

### 8.4 Adding a new strategy (OAuth2, SAML, magic links, …)

Implement the interface and register it:

```ts
import { AuthManager, type AuthStrategy, type AuthResult, type AuthContext, type AuthConfig } from 'bootifyjs/auth'

class MagicLinkStrategy implements AuthStrategy {
  readonly name = 'magic-link'
  readonly type = AuthStrategyType.OAUTH2   // closest semantic fit; the string is yours
  private cfg!: { tokenStorage: TokenStorage; userProvider: (id: string) => Promise<User | null>; mailer: Mailer }

  async initialize(config: AuthConfig): Promise<void> {
    this.cfg = config.options as typeof this.cfg
    if (!this.cfg.tokenStorage) throw new AuthError('magic-link requires tokenStorage', 'INVALID_CONFIG', 500)
  }
  async authenticate(ctx: AuthContext): Promise<AuthResult> {
    const { email } = ctx.body ?? {}
    const user = await findByEmail(email)
    if (!user) return { success: false, error: 'User not found' }
    const link = crypto.randomUUID()
    await this.cfg.tokenStorage.store(`magic:${link}`, { userId: user.id }, 600)  // 10 min
    await this.cfg.mailer.send(email, `/auth/magic?token=${link}`)
    return { success: true, user, metadata: { linkSent: true } }
  }
  async validate(token: string): Promise<AuthResult> {
    const data = await this.cfg.tokenStorage.get(`magic:${token}`)
    if (!data) return { success: false, error: 'Invalid or expired link' }
    await this.cfg.tokenStorage.delete(`magic:${token}`)               // single-use
    const user = await this.cfg.userProvider(data.userId)
    return user ? { success: true, user } : { success: false, error: 'User not found' }
  }
}

// wiring:
const auth = new AuthManager({ defaultStrategy: 'magic-link' })
await auth.registerStrategy(new MagicLinkStrategy(), {
  strategy: 'magic-link',
  options: { tokenStorage, userProvider, mailer },
})
```

Notes:

- `refresh`/`revoke` are **optional** — omit them for strategies that don't
  rotate (magic links, basic auth).
- Registration failures throw `AuthError('STRATEGY_REGISTRATION_FAILED', 500)`.
- Multiple strategies can coexist on one `AuthManager`; auto-detection
  (§4) picks per request, so a JWT login and `x-api-key` traffic can share one
  manager.
- `enableAuth()` itself wires only `jwt` / `api-key`; for a custom strategy,
  construct the `AuthManager` yourself (or inject the one `enableAuth()`
  registered and `registerStrategy` on it), and attach any route guard via
  `useMiddleware()` or by re-registering your own bundle under
  `AUTH_MIDDLEWARE_TOKEN` with `override: true`.

### 8.5 Bearer tokens & alternative extraction

- **Standard Bearer (default):** `Authorization: Bearer <token>` — nothing to
  configure.
- **Cookie-based:** `.enableAuth({ cookieName: 'session' })` (register
  `@fastify/cookie` first).
- **Anything else:** `.enableAuth({ tokenExtractor: (req) => req.headers['x-custom-token'] as string })`.
  The extractor returns the raw token; a leading `Bearer ` is stripped if
  present, so extractors can return header values verbatim.

---

## 9. Testing auth

The module is the most test-friendly in the framework — no decorators, no
singletons, everything injectable. The module's own suites live in
`tests/unit/auth/auth-manager.test.ts`,
`tests/unit/middleware/auth-middleware.test.ts`,
`tests/unit/middleware/authorization.test.ts` and
`tests/integration/auth-rules.test.ts`. Patterns:

```ts
// strategies: a 20-line fake storage beats a mock library
const fakeStorage: TokenStorage = {
  data: new Map<string, any>(),
  async store(k, v) { this.data.set(k, v) },
  async get(k) { return this.data.get(k) ?? null },
  async delete(k) { this.data.delete(k) },
  async exists(k) { return this.data.has(k) },
}

const jwt = new JwtStrategy()
await jwt.initialize({
  strategy: 'jwt',
  options: {
    accessTokenSecret: 'test-access', refreshTokenSecret: 'test-refresh',
    accessTokenExpiry: '15m', refreshTokenExpiry: '7d',
    userProvider: async (id) => (id === 'u1' ? fakeUser : null),
    credentialValidator: async ({ email, password }) => (password === 'pw' ? fakeUser : null),
    tokenStorage: fakeStorage,
  },
})
```

- **Middleware:** drive it with plain objects —
  `{ headers: { authorization: 'Bearer …' } }` and assert
  `request.user` / `request.authenticated`. For `authorize(roles)`, a fake
  `{ status: () => ({ send }) }` reply is enough.
- **Token-cache interference:** `createAuthMiddleware({ tokenCache: new TokenCache() })`
  gives each test a fresh cache (the module-level default is shared), or call
  `.clear()` in `afterEach`.
- **Expiry paths:** sign with `accessTokenExpiry: '1s'` (or `-1s` for an
  already-expired token) rather than sleeping.
- **`fastify.inject()`** for integration: build the app (don't `start()`),
  inject with/without the `Authorization` header, assert 401/403/200.

---

## 10. Gotchas & FAQ (read this twice)

**10.1 ⚠ The access-token blacklist is written but never checked.**
`JwtStrategy.revoke()` stores `blacklist:<jti>`, but `validate()` does not
consult it — the access token keeps working until it expires (that's why
short access expiries + refresh rotation are the default). If you need
immediate access-token revocation, check the blacklist in `userProvider`
(throw if `storage.exists('blacklist:<jti>')`) or clear the middleware's
`TokenCache` on logout.

**10.2 ⚠ The middleware marks, it doesn't reject.**
`createAuthMiddleware` sets `authenticated: false` and returns when a token
is missing/invalid — the **401 comes from `authorize(roles)`** in the
decorator pipeline, or from the global-mode hook. A route with the
authenticate middleware attached *manually* (without `authorize`) lets
unauthenticated requests through.

**10.3 ⚠ Verified tokens are cached until expiry.**
The `TokenCache` skips `jwt.verify` for cached tokens, so even a secret
rotation or storage-side revocation won't invalidate an already-verified
token until its `exp`. Inject a shared/distributed cache for multi-instance
apps; call `.clear()` in tests.

**10.4 ⚠ Refresh tokens are single-use.**
Rotation deletes the old `refresh:<jti>` on use. A replayed refresh token
fails with `Refresh token not found or revoked`. Clients must persist the
*new* pair from the refresh response. Also: the access and refresh token
share the same `jti` — revoking either removes the refresh record.

**10.5 ⚠ `InMemoryTokenStorage` is per-process.**
Refresh rotation state and API keys live in it. Behind multiple instances,
route 50% of refreshes to "revoked". Use `RedisTokenStorage` in production.

**10.6 ⚠ Storage values round-trip through JSON.**
`Date`s come back as ISO strings (`expiresAt`, `createdAt`, `lastUsedAt` in
key data) — compare with `new Date(value)`, not `instanceof Date`. The
in-memory store serializes too (same behavior, zero surprises when swapping).

**10.7 ⚠ API-key mode's decorator bundle is a no-op.**
`enableAuth({ strategy: 'api-key' })` registers
`authenticate: async () => undefined` — `@UseAuth()` will not validate API
keys (each request needs a storage lookup, which the stateless middleware
can't do). Call `authManager.validate(key, ctx)` per route, or wrap it in
your own middleware.

**10.8 ⚠ `authenticate()` on `ApiKeyStrategy` CREATES keys.**
It expects `{ userId, name }` in the body — treat it as an admin "issue key"
endpoint, not a login. Never expose it unauthenticated.

**10.9 ⚠ `AuthManager` sessions are append-only.**
On successful auth/refresh it stores `session:<userId>:<timestamp>` entries;
`cleanupSessionData()` is a stub that only logs. Sessions accumulate until
their TTL and there is no "list my sessions" API yet. Pass no `tokenStorage`
to the `AuthManager` config to disable session tracking entirely.

**10.10 ⚠ Errors are values, not exceptions (mostly).**
Strategies return `{ success: false, error, metadata.code }` instead of
throwing; only `initialize()` misconfiguration throws `AuthError`. Match on
`metadata.code` (`TOKEN_EXPIRED`, `INVALID_TOKEN`, `REFRESH_TOKEN_EXPIRED`,
`INVALID_REFRESH_TOKEN`) to map to HTTP responses.

**10.11 ⚠ Expiry strings are single-unit.**
`'15m'`, `'7d'`, `'30s'`, `'12h'`, `'2w'` — but NOT `'1h30m'` (the parser
matches `^(\d+)([smhdw])$`). For compound values pass plain seconds.

**10.12 ⚠ `request.user` is the token payload, not the `User`.**
`@CurrentUser()` injects the decoded access token (`sub`, `email`, `roles`,
`permissions`, …). If you need the fresh domain user, resolve it in the
handler (or lean on `validate()`'s `result.user` in manual flows).

**10.13 ⚠ Custom claims go stale until the next token mint.**
`payloadBuilder` output is written at login/refresh — a token in the wild
keeps its claims (tenant, plan, device…) until it expires. Role/plan changes
do NOT propagate to existing access tokens: pair short access expiries with
refresh rotation, or use `userProvider` freshness (§8.2a) for per-request
data. The refresh token never carries custom claims (deliberately minimal —
it's a storage-anchored rotation credential).

**FAQ**

- *Where do the secrets come from?* Explicit options win; otherwise
  `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` env vars; otherwise
  `ConfigValidationError` at **build** time.
- *How do I change token lifetimes?* `enableAuth({ accessTokenExpiry: '5m',
  refreshTokenExpiry: '30d' })`.
- *Can I run JWT and API-key together?* Yes — with the manual `AuthManager`
  wiring register both strategies; `detectStrategy` picks per request
  (`x-api-key` header → api-key, `Bearer` → jwt).
- *Is there a /login endpoint?* No — you write the route and call
  `authManager.authenticate()` (§2.3). This keeps the credential surface
  (route path, response shape, rate limiting) entirely yours.
- *How do I log out everywhere?* Index refresh tokens per user in your
  storage and delete them; framework-wide "revoke all" is not built in yet.

---

## 11. API reference

| Export | Kind | Purpose |
|---|---|---|
| `AuthManager` | class | Strategy registry + selection + session persistence |
| `AuthStrategy` | interface | The extension contract (`authenticate`/`validate`/`refresh?`/`revoke?`/`initialize`) |
| `JwtStrategy` / `JwtStrategyConfig` | class / type | Access+refresh JWT lifecycle (`JwtStrategyConfig.payloadBuilder`: custom access-token claims) |
| `ApiKeyStrategy` / `ApiKeyStrategyConfig` | class / type | Hashed API keys with scopes and rotation |
| `AuthSetup` | class | Manual wiring helpers (`createJwtAuth`, `createApiKeyAuth`, `createBasicAuth`) |
| `setupAuth` / `EnableAuthOptions` / `AuthHandle` | fn / types | The engine behind `enableAuth()` |
| `compileAuthRules` / `matchAuthRule` / `AuthRouteRule` / `CompiledAuthRules` | fn / types | Build-time rule validation + first-match-wins evaluation |
| `TokenStorage` | interface | Persistence contract (`store/get/delete/exists`) |
| `InMemoryTokenStorage` | class | Default storage (Map + TTL, per-process) |
| `RedisTokenStorage` / `RedisClient` | class / interface | Redis storage over an injectable client |
| `User` / `TokenPair` / `AuthResult` / `AuthContext` / `AuthConfig` / `SessionData` / `RefreshTokenData` / `ApiKeyData` | types | Domain shapes |
| `AuthError` / `TokenExpiredError` / `InvalidTokenError` / `UnauthorizedError` / `ForbiddenError` | errors | Typed failure hierarchy (`code` + `statusCode`) |
| `AuthStrategyType` | enum | `JWT`, `API_KEY`, `OAUTH2`, `SAML`, `LDAP` |
| `createAuthMiddleware` / `authenticate` / `TokenCache` | fn / class | Fastify preHandler (Bearer verify + cache) — `src/middleware/auth.middleware.ts` |
| `authorize` / `isUserAuthorized` / `requireAdmin` / `requireManager` / `requireUser` / `requireHR` | fn | Role gates — `src/middleware/authorization.middleware.ts` |
| `@UseAuth` / `@Public` / `@Roles` / `@CurrentUser` | decorators | Route-level declarative protection — `src/core/decorators.ts` |
| `AUTH_MIDDLEWARE_TOKEN` | symbol | DI token for the `{ authenticate, authorize }` bundle |

Source map: `src/auth/{types, AuthManager, builder}.ts`,
`src/auth/strategies/*`, `src/auth/storage/*`,
`src/middleware/auth{,orization}.middleware.ts`, wiring in
`src/BootifyApp.ts` (`enableAuth`, global hook) and `src/core/router.ts`
(metadata → preHandler pipeline).
Tests: `tests/unit/auth/auth-manager.test.ts`,
`tests/unit/auth/jwt-strategy.test.ts`,
`tests/unit/auth/jwt-payload-builder.test.ts`,
`tests/unit/middleware/{auth-middleware,authorization}.test.ts`,
`tests/integration/auth-rules.test.ts`, `tests/integration/auth-payload.test.ts`.

---

## 12. Design decisions & roadmap (the "why")

| Decision | Rationale |
|---|---|
| Callbacks instead of a `UserRepository` interface | `credentialValidator`/`userProvider` are two functions — no base class to implement, no ORM to adopt; the auth core stays dependency-free |
| Tokens issued inside the strategy, not the manager | Each strategy owns its credential format; the manager stays a pure orchestrator |
| Refresh rotation by default | Stolen refresh tokens become single-use; the default storage makes it work out of the box |
| You write `/login` | The credential surface (paths, response shape, rate limiting, MFA steps) is app-specific; an auto-route would be the wrong 80% |
| Fail-fast at build | Missing secrets/misconfigured rules are startup errors, never per-request surprises |
| Deny-by-default global mode | Matches the NestJS global-guard mental model; `@Public` + rules give precise opt-outs |
| `AuthManager` is a plain class | Extensible (§8.3) and trivially testable — no decorators, no global state |
| Storage behind a 4-method interface | Redis, memory, or a 20-line custom backend; strategies never know which |

**Known gaps / roadmap candidates** (do not rely on these today):

- Access-token blacklist enforcement in `validate()` (today: short expiry +
  rotation; see §10.1).
- First-class auth event hooks (`onLogin`/`onRefresh`/`onRevoke`) wired to
  the event bus (today: wrap the callbacks or extend `AuthManager`).
- Session listing/revocation API (`AuthManager` session tracking is
  append-only).
- API-key validation wired into the decorator bundle (today: per-route
  `authManager.validate`, §10.7).
