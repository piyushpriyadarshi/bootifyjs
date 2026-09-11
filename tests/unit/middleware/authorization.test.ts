import { describe, expect, it, vi } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  authorize,
  isUserAuthorized,
  requireAdmin,
  requireManager,
  requireUser,
  requireHR,
} from '../../../src/middleware/authorization.middleware'

function fakeReply() {
  const reply: any = {
    statusCode: undefined,
    payload: undefined,
    status(code: number) {
      this.statusCode = code
      return this
    },
    send(payload: unknown) {
      this.payload = payload
      return this
    },
  }
  return reply
}

function requestWith(user: any, authenticated = true): FastifyRequest {
  return { user, authenticated } as unknown as FastifyRequest
}

describe('isUserAuthorized', () => {
  it('allows everything when no roles are required', () => {
    expect(isUserAuthorized([], ['user'])).toBe(true)
    expect(isUserAuthorized([], [])).toBe(true)
  })

  it('denies users without roles', () => {
    expect(isUserAuthorized(['admin'], [])).toBe(false)
  })

  it('grants access on any role overlap', () => {
    expect(isUserAuthorized(['admin', 'manager'], ['user', 'manager'])).toBe(true)
    expect(isUserAuthorized(['admin'], ['user', 'manager'])).toBe(false)
  })
})

describe('authorize middleware', () => {
  const authorizeFn = authorize(['admin', 'manager'])

  it('returns 401 for unauthenticated requests', async () => {
    const reply = fakeReply()
    await authorizeFn(requestWith({ roles: ['admin'] }, false), reply)

    expect(reply.statusCode).toBe(401)
    expect(reply.payload).toMatchObject({ message: 'Unauthorized' })
  })

  it('returns 401 when user is missing entirely', async () => {
    const reply = fakeReply()
    await authorizeFn(requestWith(null, true), reply)
    expect(reply.statusCode).toBe(401)
  })

  it('returns 403 when roles do not overlap', async () => {
    const reply = fakeReply()
    await authorizeFn(requestWith({ roles: ['user'] }), reply)

    expect(reply.statusCode).toBe(403)
    expect(reply.payload.message).toContain('Access Denied')
  })

  it('returns 403 when the user has no roles at all', async () => {
    const reply = fakeReply()
    await authorizeFn(requestWith({ roles: [] }), reply)
    expect(reply.statusCode).toBe(403)
  })

  it('lets requests through for authorized roles', async () => {
    const reply = fakeReply()
    await authorizeFn(requestWith({ roles: ['manager'] }), reply)

    expect(reply.statusCode).toBeUndefined()
    expect(reply.payload).toBeUndefined()
  })

  it('treats a string roles field as empty (no crash)', async () => {
    const reply = fakeReply()
    await authorizeFn(requestWith({ roles: undefined }), reply)
    expect(reply.statusCode).toBe(403)
  })
})

describe('prebuilt role middleware', () => {
  const cases: Array<[any, string[], number | undefined]> = [
    [requireAdmin, ['admin'], undefined],
    [requireAdmin, ['user'], 403],
    [requireManager, ['manager'], undefined],
    [requireManager, ['user'], 403],
    [requireUser, ['user'], undefined],
    [requireHR, ['hr'], undefined],
    [requireHR, ['manager'], 403],
  ]

  it.each(cases)('%# grants/denies per role matrix', async (middleware, roles, expected) => {
    const reply = fakeReply()
    await middleware(requestWith({ roles }), reply)
    expect(reply.statusCode).toBe(expected)
  })
})
