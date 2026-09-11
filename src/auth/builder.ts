import { AuthManager } from './AuthManager'
import { InMemoryTokenStorage } from './storage/in-memory-token-storage'
import { JwtStrategy, type JwtStrategyConfig } from './strategies/JwtStrategy'
import { ApiKeyStrategy } from './strategies/ApiKeyStrategy'
import type { TokenStorage, User } from './types'
import { createAuthMiddleware } from '../middleware/auth.middleware'
import { authorize } from '../middleware/authorization.middleware'
import { AUTH_MIDDLEWARE_TOKEN } from '../constants'
import type { AuthMiddlewareBundle } from '../constants'
import { ConfigValidationError } from '../config/errors'
import type { Container } from '../core/di-container'
import { matchesPath } from '../commons/path-match'
import type { ZodIssue } from 'zod'
import type { FastifyRequest } from 'fastify'

export type AuthDecision = 'public' | 'required'

export interface AuthRouteRule {
  /** Fastify route pattern (e.g. '/users/:id') or RegExp. Glob: '*' = one
   *  segment, '**' = all remaining segments. */
  path: string | RegExp
  /** Restrict the rule to these methods (default: any method). */
  methods?: string[]
  /** 'public' skips authentication; 'required' authenticates (default). */
  auth?: AuthDecision
  /** Path-level role gate — implies authentication + role check. */
  roles?: string[]
}

export interface EnableAuthOptions {
  strategy?: 'jwt' | 'api-key'
  accessTokenSecret?: string
  refreshTokenSecret?: string
  accessTokenExpiry?: string
  refreshTokenExpiry?: string
  userProvider?: (userId: string) => Promise<User | null>
  credentialValidator?: (credentials: any) => Promise<User | null>
  tokenStorage?: TokenStorage
  /** Authenticate every route (default: false — use @UseAuth() per route).
   *  `@Public()` routes, OPTIONS preflights, and matching `routes` rules are
   *  exempt; unmatched routes authenticate. */
  global?: boolean
  /** Global-mode only. Ordered path rules — FIRST MATCH WINS, evaluated
   *  against the Fastify route pattern + method. */
  routes?: AuthRouteRule[]
  /** Full override for token extraction (default: Bearer header). */
  tokenExtractor?: (request: FastifyRequest) => string | undefined
  /** Sugar: fall back to this cookie when the header is absent. */
  cookieName?: string
  /** Forwarded to JwtStrategyConfig. Custom claims for the access token. */
  payloadBuilder?: JwtStrategyConfig['payloadBuilder']
}

export interface AuthHandle {
  authManager: AuthManager
  strategy: JwtStrategy | ApiKeyStrategy
  /** Fastify preHandler — attach manually when wiring outside decorators. */
  authenticate: ReturnType<typeof createAuthMiddleware>
  requireRoles: typeof authorize
  /** Validated, first-match-wins route rules (empty when none configured). */
  compiledRules: CompiledAuthRules[]
}

/**
 * Opinionated auth wiring for `createBootifyApp().enableAuth()`.
 *
 * Zero-config when `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` env vars exist.
 * Secrets are validated at build time with an actionable error — never at
 * request time.
 */
export interface CompiledAuthRules {
  path: string | RegExp
  methods?: string[]
  auth: AuthDecision
  roles?: string[]
}

/** Validate + normalize route rules at build time (fail-fast). */
export function compileAuthRules(rules: AuthRouteRule[] | undefined): CompiledAuthRules[] {
  if (!rules || rules.length === 0) return []

  return rules.map((rule) => {
    if (!rule.path || (typeof rule.path === 'string' && rule.path.trim().length === 0)) {
      throw new ConfigValidationError('enableAuth(): route rule is missing `path`.')
    }
    if (rule.path instanceof RegExp) {
      try {
        rule.path.test('')
      } catch {
        throw new ConfigValidationError(`enableAuth(): invalid RegExp in route rule.`)
      }
    }
    const auth: AuthDecision = rule.auth ?? 'required'
    if (auth !== 'public' && auth !== 'required') {
      throw new ConfigValidationError(`enableAuth(): rule auth must be 'public' or 'required'.`)
    }
    const methods = rule.methods?.map((m) => m.toUpperCase())
    if (rule.roles && rule.roles.length > 0 && auth === 'public') {
      throw new ConfigValidationError(
        `enableAuth(): a route rule cannot be both 'public' and carry roles.`)
    }
    return { path: rule.path, methods, auth, roles: rule.roles }
  })
}

/** First-match-wins evaluation against the route pattern + method. */
export function matchAuthRule(
  rules: CompiledAuthRules[],
  request: FastifyRequest
): CompiledAuthRules | undefined {
  const routeOptions = (request as any).routeOptions
  const routeUrl: string = routeOptions?.url ?? request.url.split('?')[0]
  const method: string = String(routeOptions?.method ?? request.method).toUpperCase()

  for (const rule of rules) {
    if (!matchesPath(rule.path, routeUrl)) continue
    if (rule.methods && !rule.methods.includes(method)) continue
    return rule
  }
  return undefined
}

export async function setupAuth(
  container: Container,
  options: EnableAuthOptions = {}
): Promise<AuthHandle> {
  // Fail-fast rule validation at build time
  compileAuthRules(options.routes)

  const strategy = options.strategy ?? 'jwt'

  if (strategy === 'api-key') {
    if (!options.tokenStorage) {
      throw new ConfigValidationError(
        'enableAuth({ strategy: "api-key" }) requires a tokenStorage (use FakeTokenStorage in tests, RedisTokenStorage in production).'
      )
    }
    if (!options.userProvider) {
      throwMissing(['userProvider'])
    }

    const apiKeyStrategy = new ApiKeyStrategy()
    const authManager = new AuthManager({ defaultStrategy: 'api-key' })
    await authManager.registerStrategy(apiKeyStrategy, {
      strategy: 'api-key',
      options: {
        tokenStorage: options.tokenStorage,
        userProvider: options.userProvider,
      },
    })

    const handle: AuthHandle = {
      authManager,
      strategy: apiKeyStrategy,
      authenticate: async () => undefined, // api-key validation happens per-route via strategy
      requireRoles: authorize,
      compiledRules: compileAuthRules(options.routes),
    }
    registerBundle(container, handle)
    return handle
  }

  // JWT strategy
  const accessTokenSecret = options.accessTokenSecret ?? process.env.JWT_ACCESS_SECRET
  const refreshTokenSecret = options.refreshTokenSecret ?? process.env.JWT_REFRESH_SECRET

  const missing: string[] = []
  if (!accessTokenSecret) missing.push('accessTokenSecret (or env JWT_ACCESS_SECRET)')
  if (!refreshTokenSecret) missing.push('refreshTokenSecret (or env JWT_REFRESH_SECRET)')
  if (missing.length > 0) {
    throw new ConfigValidationError(
      `enableAuth() is missing required secrets: ${missing.join(', ')}. ` +
        `Provide them via .enableAuth({...}) or environment variables.`
    )
  }

  const jwtStrategy = new JwtStrategy()
  const authManager = new AuthManager({ defaultStrategy: 'jwt' })
  await authManager.registerStrategy(jwtStrategy, {
    strategy: 'jwt',
    options: {
      accessTokenSecret,
      refreshTokenSecret,
      accessTokenExpiry: options.accessTokenExpiry ?? '15m',
      refreshTokenExpiry: options.refreshTokenExpiry ?? '7d',
      userProvider: options.userProvider ?? (async () => null),
      credentialValidator: options.credentialValidator,
      payloadBuilder: options.payloadBuilder,
      // Default storage enables refresh rotation out of the box; swap for
      // RedisTokenStorage in multi-instance production.
      tokenStorage: options.tokenStorage ?? new InMemoryTokenStorage(),
    },
  })

  const handle: AuthHandle = {
    authManager,
    strategy: jwtStrategy,
    authenticate: createAuthMiddleware({
      secret: accessTokenSecret!,
      tokenExtractor: options.tokenExtractor,
      cookieName: options.cookieName,
    }),
    requireRoles: authorize,
    compiledRules: compileAuthRules(options.routes),
  }
  registerBundle(container, handle)
  return handle
}

function registerBundle(container: Container, handle: AuthHandle): void {
  const bundle: AuthMiddlewareBundle = {
    authenticate: handle.authenticate as any,
    authorize: handle.requireRoles as any,
  }
  container.register(AUTH_MIDDLEWARE_TOKEN, { useFactory: () => bundle, override: true })
  container.register(AuthManager, { useFactory: () => handle.authManager, override: true })
}

function throwMissing(fields: string[]): never {
  const issues: ZodIssue[] = []
  throw new ConfigValidationError(
    `enableAuth() is missing required options: ${fields.join(', ')}.`,
    issues
  )
}
