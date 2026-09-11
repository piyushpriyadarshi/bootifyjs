import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { Controller, Get, Post, Body, Schema, UseAuth, Roles, CurrentUser } from '../../src/core/decorators'
import { CACHE_STORE_TOKEN } from '../../src/cache/cache.types'
import { createTestApp } from '../../src/testing'
import type { CreateTestAppOptions } from '../../src/testing'
import { z } from 'zod'

const cleanup: Array<() => Promise<void> | void> = []
const envSnapshots: Array<() => void> = []

function withEnv(vars: Record<string, string | undefined>) {
  const snapshot = new Map<string, string | undefined>()
  for (const [k, v] of Object.entries(vars)) {
    snapshot.set(k, process.env[k])
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  envSnapshots.push(() => {
    for (const [k, v] of snapshot) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
}

afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn()
  cleanup.length = 0
  for (const fn of envSnapshots.reverse()) fn()
  envSnapshots.length = 0
})

// ---- fixtures ----

@Controller('/features')
class FeatureController {
  @Get('/open')
  open() {
    return { open: true }
  }

  @Post('/items')
  @Schema({ body: z.object({ name: z.string() }) })
  create(@Body() body: any) {
    return { created: body.name }
  }
}

@Controller('/protected')
class ProtectedController {
  @UseAuth()
  @Get('/me')
  me(@CurrentUser() user: any) {
    return { userId: user?.sub ?? null }
  }
}

@Controller('/admin')
class AdminOnlyController {
  @Roles('admin')
  @Get('/only')
  adminOnly() {
    return { admin: true }
  }
}

@UseAuth()
@Controller('/secure-zone')
class SecureZoneController {
  @Get('/data')
  data() {
    return { secret: 42 }
  }
}

async function makeApp(
  setup?: CreateTestAppOptions['setup'],
  controllers: any[] = [FeatureController]
) {
  const app = await createTestApp({ controllers, setup })
  cleanup.push(() => app.close())
  return app
}

describe('health check feature (default ON)', () => {
  it('serves /health with the standard payload', async () => {
    const app = await makeApp()
    const res = await app.inject({ method: 'GET', url: '/health' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe('ok')
    expect(body.version).toBeDefined()
    expect(typeof body.uptime).toBe('number')
    expect(body.timestamp).toBeDefined()
  })

  it('supports a custom path and a readiness endpoint with cache probe', async () => {
    const app = await makeApp((a, container) => {
      a.enableHealthCheck({ path: '/livez', readinessPath: '/readyz', includeCache: true })
      container.register(CACHE_STORE_TOKEN, {
        useFactory: () => ({ get: async () => undefined, set: async () => undefined, del: async () => undefined, healthCheck: async () => true }),
        override: true,
      })
    })

    expect((await app.inject({ method: 'GET', url: '/livez' })).statusCode).toBe(200)
    const ready = await app.inject({ method: 'GET', url: '/readyz' })
    expect(ready.statusCode).toBe(200)
    expect(ready.json().checks).toEqual({ cache: true })
  })

  it('readiness returns 503 degraded when the cache probe fails', async () => {
    const app = await makeApp((a, container) => {
      a.enableHealthCheck({ readinessPath: '/readyz', includeCache: true })
      container.register(CACHE_STORE_TOKEN, {
        useFactory: () => ({ get: async () => undefined, set: async () => undefined, del: async () => undefined, healthCheck: async () => false }),
        override: true,
      })
    })

    const res = await app.inject({ method: 'GET', url: '/readyz' })
    expect(res.statusCode).toBe(503)
    expect(res.json().status).toBe('degraded')
    expect(res.json().checks.cache).toBe(false)
  })

  it('disableHealthCheck() removes the endpoint', async () => {
    const app = await makeApp((a) => a.disableHealthCheck())
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(404)
  })
})

describe('cors feature (default ON, dev-safe)', () => {
  it('answers preflight requests with CORS headers', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/features/open',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
    })

    expect(res.statusCode).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('warns in production when reflecting any origin', async () => {
    withEnv({ NODE_ENV: 'production' })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await makeApp()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PRODUCTION'))
    warnSpy.mockRestore()
  })

  it('disableCors() removes CORS handling', async () => {
    const app = await makeApp((a) => a.disableCors())
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/features/open',
      headers: { origin: 'http://x.com', 'access-control-request-method': 'GET' },
    })
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('request tracing (default ON)', () => {
  it('stamps responses with x-request-id', async () => {
    const app = await makeApp()
    const res = await app.inject({ method: 'GET', url: '/features/open' })
    expect(res.headers['x-request-id']).toBeDefined()
  })

  it('reuses an incoming x-request-id for trace propagation', async () => {
    const app = await makeApp()
    const res = await app.inject({
      method: 'GET',
      url: '/features/open',
      headers: { 'x-request-id': 'trace-123' },
    })
    expect(res.headers['x-request-id']).toBe('trace-123')
  })

  it('disableRequestContext() opts out entirely', async () => {
    const app = await makeApp((a) => a.disableRequestContext())
    const res = await app.inject({ method: 'GET', url: '/features/open' })
    expect(res.headers['x-request-id']).toBeUndefined()
  })
})

describe('swagger feature (opt-in, zero-config)', () => {
  it('serves docs titled from the service name with registered paths', async () => {
    const app = await makeApp((a) => a.enableSwagger())

    const ui = await app.inject({ method: 'GET', url: '/docs' })
    expect(ui.statusCode).toBe(200)

    const spec = await app.inject({ method: 'GET', url: '/docs/json' })
    expect(spec.statusCode).toBe(200)
    const json = spec.json()
    expect(json.info.title).toBe('bootify-test API')
    expect(Object.keys(json.paths).some((p) => p.includes('/features/open'))).toBe(true)
  })

  it('adds bearerAuth security when auth is enabled', async () => {
    withEnv({ JWT_ACCESS_SECRET: 'access-secret', JWT_REFRESH_SECRET: 'refresh-secret' })
    const app = await makeApp((a) => {
      a.enableSwagger()
      a.enableAuth({
        accessTokenSecret: 'access-secret',
        refreshTokenSecret: 'refresh-secret',
        userProvider: async () => null,
      })
    })

    const spec = (await app.inject({ method: 'GET', url: '/docs/json' })).json()
    expect(spec.components.securitySchemes.bearerAuth.bearerFormat).toBe('JWT')
  })

  it('supports a custom path', async () => {
    const app = await makeApp((a) => a.enableSwagger({ path: '/api-docs' }))
    expect((await app.inject({ method: 'GET', url: '/api-docs' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api-docs/json' })).statusCode).toBe(200)
  })
})

describe('auth feature (opt-in) + decorators', () => {
  const USER = { id: 'u1', sub: 'u1', roles: ['admin'], permissions: [] }

  async function makeAuthedApp() {
    return makeApp(
      (a) =>
        a.enableAuth({
          accessTokenSecret: 'test-access-secret',
          refreshTokenSecret: 'test-refresh-secret',
          userProvider: async () => USER as any,
        }),
      [FeatureController, ProtectedController, AdminOnlyController, SecureZoneController]
    )
  }

  function token(payload: any = { sub: 'u1', roles: ['admin'] }) {
    return jwt.sign(payload, 'test-access-secret', { expiresIn: 60 })
  }

  it('rejects @UseAuth routes without a token (401) and accepts valid tokens', async () => {
    const app = await makeAuthedApp()

    const denied = await app.inject({ method: 'GET', url: '/protected/me' })
    expect(denied.statusCode).toBe(401)

    const allowed = await app.inject({
      method: 'GET',
      url: '/protected/me',
      headers: { authorization: `Bearer ${token()}` },
    })
    expect(allowed.statusCode).toBe(200)
    expect(allowed.json()).toEqual({ userId: 'u1' })
  })

  it('returns 403 when roles do not overlap', async () => {
    const app = await makeAuthedApp()

    const res = await app.inject({
      method: 'GET',
      url: '/admin/only',
      headers: { authorization: `Bearer ${token({ sub: 'u1', roles: ['user'] })}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('class-level @UseAuth protects every route in the controller', async () => {
    const app = await makeAuthedApp()

    const denied = await app.inject({ method: 'GET', url: '/secure-zone/data' })
    expect(denied.statusCode).toBe(401)

    const allowed = await app.inject({
      method: 'GET',
      url: '/secure-zone/data',
      headers: { authorization: `Bearer ${token()}` },
    })
    expect(allowed.statusCode).toBe(200)
    expect(allowed.json()).toEqual({ secret: 42 })
  })

  it('throws an actionable error at build when @UseAuth runs without enableAuth', async () => {
    await expect(
      makeApp(undefined, [ProtectedController]) // no enableAuth
    ).rejects.toThrow(/enableAuth/)
  })

  it('exposes the auth handle on the app (app.auth)', async () => {
    withEnv({ JWT_ACCESS_SECRET: 'access-secret', JWT_REFRESH_SECRET: 'refresh-secret' })
    const app = await makeApp((a) => a.enableAuth({ userProvider: async () => null }))
    expect(app.app.auth?.authManager.getRegisteredStrategies()).toEqual(['jwt'])
  })
})

describe('validation still flows through the default error handler', () => {
  it('zod failures return 400 with issues', async () => {
    const app = await makeApp((a) => a.disableHealthCheck())
    const res = await app.inject({ method: 'POST', url: '/features/items', payload: {} })
    expect(res.statusCode).toBe(400)
    expect(JSON.stringify(res.json().issues)).toContain('name')
  })
})
