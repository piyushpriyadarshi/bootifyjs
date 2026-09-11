# LLD — JWT `payloadBuilder`: custom claims in access tokens

> Status: APPROVED. Lets apps embed arbitrary claims (tenant, goals, plan,
> device…) in the JWT access token without copying `JwtStrategy`.
>
> Scope (locked with user): **`payloadBuilder` only** — no changes to
> `request.user` semantics, no fresh-user resolution in the middleware.
>
> Direction: framework defaults stay; custom claims spread LAST (override
> `email`/`roles`/`permissions` allowed) — reserved claims (`sub`, `type`,
> `iat`, `jti`) fail fast with `JWT_PAYLOAD_CLAIM_RESERVED`.

## 0. Locked decisions

| ⚖️ | Decision |
|---|---|
| 1 | `payloadBuilder?: (user: User, context: AuthContext) => Record<string, unknown>` on `JwtStrategyConfig` — optional, no behavior change when absent |
| 2 | **Access token only.** Refresh token payload stays minimal (`{ sub, type, iat, jti }`) — refresh is a storage-anchored rotation credential, not a claims carrier |
| 3 | **Reserved claims are protected, fail-fast**: builder output containing `sub`, `type`, `iat`, or `jti` → `AuthError('JWT_PAYLOAD_CLAIM_RESERVED', 500)` thrown at token-generation time (surfaces as `{ success: false, error }` per existing strategy error semantics) |
| 4 | **Framework defaults (`email`, `roles`, `permissions`) MAY be overridden** by builder output (spread last) — enables intentionally stripping/reshaping them; documented |
| 5 | `initialize()` validates *shape* (`payloadBuilder` must be a function if provided) → `AuthError('INVALID_CONFIG', 500)` at registration; output is validated *per call* (⚖️3) since it's produced by user code |
| 6 | Passthrough on `EnableAuthOptions` (`src/auth/builder.ts`) so `createBootifyApp().enableAuth({ payloadBuilder })` works; `AuthSetup.createJwtAuth/createBasicAuth` get it free via their existing config spread |
| 7 | Builder receives `(user, context)` — context enables request-derived claims (e.g., `aud` per client, device fingerprint) |
| 8 | Builder throwing → existing catch in `authenticate`/`refresh` converts to `{ success: false, error: 'Authentication failed: <msg>' }` — no new error path |

## 1. Contract

```ts
// src/auth/strategies/JwtStrategy.ts
export interface JwtStrategyConfig {
  // ...existing fields unchanged...
  /** Build extra/custom claims for the ACCESS token. Merged AFTER the
   *  framework defaults (so you may override email/roles/permissions).
   *  Reserved claims (sub, type, iat, jti) are rejected — the strategy
   *  owns them. Applied on login AND refresh (both mint new pairs). */
  payloadBuilder?: (user: User, context: AuthContext) => Record<string, unknown>
}

// src/auth/builder.ts
export interface EnableAuthOptions {
  // ...existing fields unchanged...
  /** Forwarded to JwtStrategyConfig. Custom claims for the access token. */
  payloadBuilder?: JwtStrategyConfig['payloadBuilder']
}
```

## 2. Payload assembly order (the core rule)

```ts
// generateTokenPair — internal order:
const accessPayload = {
  // 1. framework defaults
  sub: user.id,
  email: user.email,
  roles: user.roles,
  permissions: user.permissions,
  type: 'access',
  iat: now,
  jti: tokenId,
  // 2. custom claims LAST — may override defaults (⚖️4),
  //    but reserved keys are rejected before signing (⚖️3)
  ...this.buildCustomClaims(user, context),
}
```

```ts
// private helper on JwtStrategy:
private static readonly RESERVED_CLAIMS = ['sub', 'type', 'iat', 'jti'] as const

private buildCustomClaims(user: User, context: AuthContext): Record<string, unknown> {
  if (!this.config.payloadBuilder) return {}
  const claims = this.config.payloadBuilder(user, context) ?? {}
  const reserved = Object.keys(claims).filter(
    (k) => (JwtStrategy.RESERVED_CLAIMS as readonly string[]).includes(k)
  )
  if (reserved.length > 0) {
    throw new AuthError(
      `payloadBuilder cannot set reserved claims: ${reserved.join(', ')}`,
      'JWT_PAYLOAD_CLAIM_RESERVED',
      500
    )
  }
  return claims
}
```

`generateTokenPair(user, context)` — both call sites (`authenticate`,
`refresh`) pass their existing `context`. JWT-standard `exp`/`iss`/`aud` are
set via `jwt.sign` options and remain untouchable by the builder by
construction.

## 3. File-by-file changes

### 3.1 `src/auth/strategies/JwtStrategy.ts` (core)
- `payloadBuilder?` on `JwtStrategyConfig` (§1).
- `RESERVED_CLAIMS` + `buildCustomClaims()` (§2).
- `generateTokenPair(user, context)`: custom claims spread last into
  `accessPayload` only. Refresh payload untouched.
- `initialize()`: non-function `payloadBuilder` →
  `AuthError('payloadBuilder must be a function', 'INVALID_CONFIG', 500)`.

### 3.2 `src/auth/builder.ts` (passthrough)
- `EnableAuthOptions.payloadBuilder?: JwtStrategyConfig['payloadBuilder']`.
- In `setupAuth()` JWT branch, forward into the strategy options:
  `payloadBuilder: options.payloadBuilder`.
- API-key branch: ignore (n/a).

### 3.3 `src/auth/index.ts`
- `JwtStrategyConfig` / `EnableAuthOptions` already re-exported as types.
- Bonus for ⚖️6: `payloadBuilder?: JwtStrategyConfig['payloadBuilder']` added
  to the inline config types of `AuthSetup.createJwtAuth` /
  `createBasicAuth.jwtConfig` (spread passthrough is free once typed).

### 3.4 `src/auth/README.md` (docs)
- §5.1: config list gains `payloadBuilder?`; token-payload snippet shows the
  custom spread; note claims re-mint on refresh.
- §8.2: `payloadBuilder` becomes the recommended "embed claims" path (was:
  "copy `JwtStrategy`" workaround); keeps §8.2a freshness guidance and the
  reserved-claims warning; new example + `(user, context)` note.
- §10: new gotcha 10.13 — custom claims go stale until the next token mint.
- §11: `payloadBuilder` noted on the `JwtStrategyConfig` row + new test files
  in the source map.
- §12: `payloadBuilder` roadmap bullet removed.

## 4. Tests (vitest, existing patterns)

New file `tests/unit/auth/jwt-payload-builder.test.ts`:

1. custom claims land in the access token alongside unchanged
   `sub`/`email`/`roles`/`permissions`/`jti`;
2. refresh token unchanged (no custom claims, ⚖️2);
3. builder receives `(user, context)` — `vi.fn`, both args asserted;
4. reserved claim rejected → `{ success: false }` with
   `payloadBuilder cannot set reserved claims: …` (⚖️3, no token minted);
5. defaults overridable — `payloadBuilder: () => ({ permissions: [] })`
   (⚖️4);
6. no builder → payload keys exactly the framework set (regression guard);
7. throwing builder → `{ success: false, error: 'Authentication failed: …' }`,
   no throw escape (⚖️8);
8. non-function builder rejected at `initialize` (`INVALID_CONFIG`, ⚖️5);
9. custom claims re-minted on refresh (new pair).

New file `tests/integration/auth-payload.test.ts`:

10. `setupAuth` passthrough — `enableAuth({ payloadBuilder })`, authenticate
    via the registered `AuthManager`, decode custom claims end-to-end;
11. reserved claims rejected through the same wiring (`success: false`).

## 5. Verification

1. `npx vitest run tests/unit/auth/jwt-payload-builder.test.ts
   tests/integration/auth-payload.test.ts`
2. `npm run typecheck` + full `npm test` in bootifyjs.
3. `npm run build` (goal-setter consumes `dist/` via `file:` symlink, when
   applicable).

## 6. Out of scope (explicitly)

- Fresh `User` on `request.user` / `request.authUser` (deferred).
- Refresh-token custom claims (⚖️2).
- Claim schema validation (zod) for builder output — reserved-key check only.
- API-key strategy changes.
