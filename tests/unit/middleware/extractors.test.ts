import { describe, expect, it } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  authContextExtractor,
  enhancedAuthContextExtractor,
} from '../../../src/middleware/auth-context.extractor'

function request(overrides: Record<string, any> = {}): FastifyRequest {
  return {
    headers: {},
    ip: '127.0.0.1',
    method: 'GET',
    url: '/todos',
    protocol: 'http',
    ...overrides,
  } as unknown as FastifyRequest
}

const reply = {} as FastifyReply

describe('authContextExtractor', () => {
  it('reports unauthenticated requests with request metadata', () => {
    const ctx = authContextExtractor(request(), reply)

    expect(ctx.isAuthenticated).toBe(false)
    expect(ctx.authMethod).toBe('none')
    expect(ctx.userId).toBeNull()
    expect(ctx.requestMethod).toBe('GET')
    expect(ctx.requestUrl).toBe('/todos')
    expect(ctx.clientIp).toBe('127.0.0.1')
    expect(ctx.hasBearerToken).toBe(false)
    expect(ctx.hasApiKey).toBe(false)
    expect(typeof ctx.timestamp).toBe('string')
  })

  it('extracts user info from an authenticated JWT payload', () => {
    const req = request({
      headers: { authorization: 'Bearer tok' },
      authenticated: true,
      user: {
        sub: 'u-9',
        username: 'piyush',
        email: 'p@example.com',
        roles: ['admin', 'user'],
      },
    })

    const ctx = authContextExtractor(req, reply)

    expect(ctx.isAuthenticated).toBe(true)
    expect(ctx.authMethod).toBe('jwt')
    expect(ctx.userId).toBe('u-9')
    expect(ctx.username).toBe('piyush')
    expect(ctx.userEmail).toBe('p@example.com')
    expect(ctx.userRoles).toEqual(['admin', 'user'])
    expect(ctx.hasBearerToken).toBe(true)
  })

  it('flags API-key requests without a verified user', () => {
    const ctx = authContextExtractor(
      request({ headers: { 'x-api-key': 'ak_x.y' } }),
      reply
    )
    expect(ctx.authMethod).toBe('apikey')
    expect(ctx.hasApiKey).toBe(true)
    expect(ctx.isAuthenticated).toBe(false)
  })
})

describe('enhancedAuthContextExtractor', () => {
  it('adds security context on top of the base context', () => {
    const ctx = enhancedAuthContextExtractor(
      request({
        headers: {
          'user-agent': 'Mozilla/5.0 Chrome',
          'content-type': 'application/json',
          'x-custom': '1',
        },
      }),
      reply
    )

    expect(ctx.isFromBrowser).toBe(true)
    expect(ctx.isFromMobileApp).toBe(false)
    expect(ctx.isSecureConnection).toBe(false)
    expect(ctx.hasCustomHeaders).toBe(true)
    expect(ctx.contentType).toBe('application/json')
    expect(typeof ctx.clientFingerprint).toBe('string')
  })

  it('derives a stable client fingerprint from client headers', () => {
    const headers = {
      'user-agent': 'UA-1',
      'accept-language': 'en',
      'accept-encoding': 'gzip',
    }
    const a = enhancedAuthContextExtractor(request({ headers }), reply)
    const b = enhancedAuthContextExtractor(request({ headers }), reply)
    expect(a.clientFingerprint).toBe(b.clientFingerprint)
    expect(a.clientFingerprint).toHaveLength(16)
  })

  it('detects mobile user agents', () => {
    const ctx = enhancedAuthContextExtractor(
      request({ headers: { 'user-agent': 'MyApp Android/14 Mobile' } }),
      reply
    )
    expect(ctx.isFromMobileApp).toBe(true)
    expect(ctx.isFromBrowser).toBe(false)
  })
})
