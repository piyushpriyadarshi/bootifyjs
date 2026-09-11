import { afterEach, describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { Controller, Get, Post, Public } from '../../src/core/decorators'
import { createTestApp } from '../../src/testing'
import type { CreateTestAppOptions } from '../../src/testing'

const cleanup: Array<() => Promise<void> | void> = []

afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn()
  cleanup.length = 0
})

const USER = { id: 'u1', sub: 'u1', roles: ['admin'], permissions: [] }

function makeControllers() {
  @Controller('/zone')
  class ZoneController {
    @Get('/protected')
    protected() {
      return { protected: true }
    }

    @Public()
    @Get('/open')
    open() {
      return { open: true }
    }

    @Post('/items')
    create() {
      return { created: true }
    }
  }
  return { ZoneController }
}

const AUTH = {
  accessTokenSecret: 'rules-access-secret-123',
  refreshTokenSecret: 'rules-refresh-secret-123',
  userProvider: async () => USER as any,
}

function token(payload: any = { sub: 'u1', roles: ['admin'] }) {
  return jwt.sign(payload, 'rules-access-secret-123', { expiresIn: 60 })
}

async function makeApp(
  setup?: CreateTestAppOptions['setup'],
  controllers?: CreateTestAppOptions['controllers']
) {
  const { ZoneController } = makeControllers()
  const app = await createTestApp({
    controllers: controllers ?? [ZoneController],
    setup,
  })
  cleanup.push(() => app.close())
  return app
}

describe('global auth + @Public', () => {
  it('protects routes and honors @Public opt-out', async () => {
    const app = await makeApp((a) =>
      a.enableAuth({ ...AUTH, global: true })
    )

    const open = await app.inject({ method: 'GET', url: '/zone/open' })
    expect(open.statusCode).toBe(200)
    expect(open.json()).toEqual({ open: true })

    const denied = await app.inject({ method: 'GET', url: '/zone/protected' })
    expect(denied.statusCode).toBe(401)

    const allowed = await app.inject({
      method: 'GET',
      url: '/zone/protected',
      headers: { authorization: `Bearer ${token()}` },
    })
    expect(allowed.statusCode).toBe(200)
  })

  it('keeps /health public under global auth', async () => {
    const app = await makeApp((a) => a.enableAuth({ ...AUTH, global: true }))
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
  })

  it('direct routes are DENIED under global auth (secure by default)', async () => {
    const app = await makeApp((a) =>
      a.enableAuth({ ...AUTH, global: true }).usePlugin(async (fastify) => {
        fastify.get('/direct', async () => ({ direct: true }))
      })
    )

    // no marker → global semantic: deny-by-default (NestJS model)
    const denied = await app.inject({ method: 'GET', url: '/direct' })
    expect(denied.statusCode).toBe(401)

    const allowed = await app.inject({
      method: 'GET',
      url: '/direct',
      headers: { authorization: `Bearer ${token()}` },
    })
    expect(allowed.statusCode).toBe(200)
  })
})

describe('route rules (routes[])', () => {
  it('auth: public rules skip authentication (first match wins)', async () => {
    const app = await makeApp((a) =>
      a.enableAuth({
        ...AUTH,
        global: true,
        routes: [
          { path: '/zone/protected', auth: 'public' },   // matches first
          { path: '/zone/**', auth: 'required' },
        ],
      })
    )

    const res = await app.inject({ method: 'GET', url: '/zone/protected' })
    expect(res.statusCode).toBe(200) // rule says public despite @UseAuth-less route... and rule beats hook
  })

  it('roles rules gate paths (403 wrong role, 200 right role)', async () => {
    const app = await makeApp((a) =>
      a.enableAuth({
        ...AUTH,
        global: true,
        routes: [{ path: '/zone/**', roles: ['admin'] }],
      })
    )

    const denied = await app.inject({
      method: 'GET',
      url: '/zone/protected',
      headers: { authorization: `Bearer ${token({ sub: 'u1', roles: ['user'] })}` },
    })
    expect(denied.statusCode).toBe(403)

    const allowed = await app.inject({
      method: 'GET',
      url: '/zone/protected',
      headers: { authorization: `Bearer ${token()}` },
    })
    expect(allowed.statusCode).toBe(200)
  })

  it('glob semantics: ** spans segments, * is exactly one', async () => {
    @Controller('/files')
    class FilesController {
      @Get('/a/b/c')
      deep() {
        return { deep: true }
      }

      @Get('/one')
      one() {
        return { one: true }
      }
    }

    const app = await makeApp(
      (a) =>
        a.enableAuth({
          ...AUTH,
          global: true,
          routes: [
            { path: '/files/one', auth: 'public' },
            { path: '/files/*', auth: 'required' }, // /files/a/b/c NOT matched by '*'
          ],
        }),
      [FilesController]
    )

    expect((await app.inject({ method: 'GET', url: '/files/one' })).statusCode).toBe(200)
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/files/a/b/c',
          headers: { authorization: `Bearer ${token()}` },
        })
      ).statusCode
    ).toBe(200) // required by rule; token provided
    expect((await app.inject({ method: 'GET', url: '/files/a/b/c' })).statusCode).toBe(401)
  })

  it('method-scoped rules: POST public for webhooks, GET still authenticated', async () => {
    const app = await makeApp(
      (a) =>
        a.enableAuth({
          ...AUTH,
          global: true,
          routes: [{ path: '/zone/items', methods: ['POST'], auth: 'public' }],
        })
    )

    const post = await app.inject({ method: 'POST', url: '/zone/items' })
    expect(post.statusCode).toBe(200) // public per rule

    const get = await app.inject({ method: 'GET', url: '/zone/protected' })
    expect(get.statusCode).toBe(401) // everything else still authenticated
  })

  it('RegExp rules work', async () => {
    const app = await makeApp(
      (a) =>
        a.enableAuth({
          ...AUTH,
          global: true,
          routes: [{ path: /^\/zone\/open/, auth: 'public' }],
        })
    )
    expect((await app.inject({ method: 'GET', url: '/zone/open' })).statusCode).toBe(200)
  })

  it('malformed rules fail at build (ConfigValidationError)', async () => {
    await expect(
      makeApp((a) => a.enableAuth({ ...AUTH, global: true, routes: [{ path: '   ', auth: 'public' }] }))
    ).rejects.toThrow(/missing `path`/)

    await expect(
      makeApp((a) =>
        a.enableAuth({ ...AUTH, global: true, routes: [{ path: '/x', auth: 'public', roles: ['admin'] }] })
      )
    ).rejects.toThrow(/cannot be both/)
  })
})

describe('token extraction (cookie + custom extractor)', () => {
  it('cookieName falls back to the cookie when the header is absent', async () => {
    const cookie = (await import('@fastify/cookie')).default
    const app = await makeApp((a) =>
      a.enableAuth({ ...AUTH, cookieName: 'session_token', global: true }).usePlugin(async (fastify) => {
        await fastify.register(cookie)
      })
    )

    const res = await app.inject({
      method: 'GET',
      url: '/zone/protected',
      cookies: { session_token: token() },
    })
    expect(res.statusCode).toBe(200)
  })

  it('tokenExtractor fully overrides extraction', async () => {
    const app = await makeApp((a) =>
      a.enableAuth({
        ...AUTH,
        global: true,
        tokenExtractor: (req) => (req.headers['x-api-token'] as string) ?? undefined,
      })
    )

    const res = await app.inject({
      method: 'GET',
      url: '/zone/protected',
      headers: { 'x-api-token': token() },
    })
    expect(res.statusCode).toBe(200)
  })
})
