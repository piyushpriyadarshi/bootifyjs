import { describe, expect, it } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { createContextMiddleware, contextMiddleware } from '../../../src/middleware/context.middleware'
import { RequestContextService, requestContextStore } from '../../../src/core/request-context.service'

function fakeRequest(): FastifyRequest {
  return { headers: {} } as unknown as FastifyRequest
}

function fakeReply() {
  const headers = new Map<string, string>()
  const reply = {
    header(name: string, value: string) {
      headers.set(name, value)
      return reply
    },
    getHeader: (name: string) => headers.get(name),
  }
  return reply as unknown as FastifyReply & { getHeader: (n: string) => string }
}

describe('createContextMiddleware', () => {
  it('creates a request-scoped ALS context with a requestId', async () => {
    const hook = createContextMiddleware()
    const req = fakeRequest()
    const reply = fakeReply()

    let sawRequestIdInside: string | undefined
    const customExtractor = () => {
      sawRequestIdInside = new RequestContextService().get('requestId')
      return {}
    }

    await new Promise<void>((resolve) => {
      createContextMiddleware(customExtractor)(req, reply, () => {
        // inside the ALS run — context still alive for downstream handlers
        sawRequestIdInside = new RequestContextService().get('requestId')
        resolve()
      })
    })

    expect(typeof sawRequestIdInside).toBe('string')
    expect(sawRequestIdInside).toHaveLength(36)
    expect((req as any).id).toBe(sawRequestIdInside)
    expect(reply.getHeader('X-Request-Id')).toBe(sawRequestIdInside)

    // after done(), the context is gone (per-request isolation)
    expect(requestContextStore.getStore()).toBeUndefined()
  })

  it('applies the extractor context into the request scope', async () => {
    let captured: Record<string, any> | undefined
    const hook = createContextMiddleware(() => ({ userId: 'u-42', tenant: 'acme' }))

    await new Promise<void>((resolve) => {
      hook(reqWith(), replyWith(), () => {
        const svc = new RequestContextService()
        captured = { userId: svc.get('userId'), tenant: svc.get('tenant') }
        resolve()
      })
    })

    expect(captured).toEqual({ userId: 'u-42', tenant: 'acme' })

    function reqWith(): FastifyRequest {
      return fakeRequest()
    }
    function replyWith() {
      return fakeReply()
    }
  })

  it('generates a distinct requestId per request', async () => {
    const hook = createContextMiddleware()
    const ids: string[] = []

    for (let i = 0; i < 2; i++) {
      const req = fakeRequest()
      await new Promise<void>((resolve) => hook(req, fakeReply(), () => resolve()))
      ids.push((req as any).id)
    }

    expect(ids[0]).not.toBe(ids[1])
  })

  it('the shared default instance stays stateless across requests', async () => {
    const req = fakeRequest()
    await new Promise<void>((resolve) => contextMiddleware(req, fakeReply(), () => resolve()))
    expect(typeof (req as any).id).toBe('string')
  })
})
