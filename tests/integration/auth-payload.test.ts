import { afterEach, describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { createTestApp } from '../../src/testing'
import type { CreateTestAppOptions } from '../../src/testing'
import type { AuthContext } from '../../src/auth'

const cleanup: Array<() => Promise<void> | void> = []

afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn()
  cleanup.length = 0
})

const USER = {
  id: 'u1',
  email: 'admin@example.com',
  roles: ['admin'],
  permissions: ['read:reports'],
}

async function makeApp(
  setup?: CreateTestAppOptions['setup']
) {
  const app = await createTestApp({ setup })
  cleanup.push(() => app.close())
  return app
}

function loginContext(): AuthContext {
  return {
    type: 'login',
    strategy: 'jwt',
    request: {},
    headers: {},
    body: { email: 'admin@example.com', password: 'pw' },
  }
}

describe('enableAuth payloadBuilder passthrough', () => {
  it('mints custom claims on access tokens end-to-end', async () => {
    const app = await makeApp((a) =>
      a.enableAuth({
        accessTokenSecret: 'payload-access-secret',
        refreshTokenSecret: 'payload-refresh-secret',
        userProvider: async () => USER as any,
        credentialValidator: async () => USER as any,
        payloadBuilder: (user) => ({ tenant: 'acme', goalsPlan: 'pro' }),
      })
    )

    const handle = app.app.auth!
    const result = await handle.authManager.authenticate(loginContext())

    expect(result.success).toBe(true)
    const payload = jwt.decode(result.tokens!.accessToken) as any
    expect(payload.tenant).toBe('acme')
    expect(payload.goalsPlan).toBe('pro')
    expect(payload.sub).toBe('u1')

    // refresh stays minimal
    const refreshPayload = jwt.decode(result.tokens!.refreshToken) as any
    expect(refreshPayload.tenant).toBeUndefined()
  })

  it('rejects reserved claims from the builder with success: false', async () => {
    const app = await makeApp((a) =>
      a.enableAuth({
        accessTokenSecret: 'payload-access-secret',
        refreshTokenSecret: 'payload-refresh-secret',
        userProvider: async () => USER as any,
        credentialValidator: async () => USER as any,
        payloadBuilder: () => ({ jti: 'stolen' } as any),
      })
    )

    const handle = app.app.auth!
    const result = await handle.authManager.authenticate(loginContext())

    expect(result.success).toBe(false)
    expect(result.error).toContain('payloadBuilder cannot set reserved claims: jti')
    expect(result.tokens).toBeUndefined()
  })
})
