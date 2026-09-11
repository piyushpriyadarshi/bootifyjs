import { describe, expect, it, vi } from 'vitest'
import { EventBusService } from '../../../src/events/event-bus.service'
import type { IEvent } from '../../../src/events/event.types'
import { RequestContextService } from '../../../src/core/request-context.service'

function event(type: string, payload: any = {}): IEvent {
  return { type, payload }
}

describe('EventBusService', () => {
  it('delivers events to subscribed handlers', async () => {
    const bus = new EventBusService()
    const handle = vi.fn().mockResolvedValue(undefined)
    bus.subscribe('todo.created', { handle })

    bus.emit(event('todo.created', { id: 1 }))
    await new Promise((r) => setImmediate(r))

    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle.mock.calls[0][0].payload).toEqual({ id: 1 })
  })

  it('enriches events with the correlationId from the request context', async () => {
    const bus = new EventBusService()
    let seen: IEvent | undefined
    bus.subscribe('ctx.test', {
      handle: async (e) => {
        seen = e
      },
    })

    RequestContextService.run(() => {
      new RequestContextService().set('requestId', 'corr-42')
      bus.emit(event('ctx.test'))
    })

    await new Promise((r) => setImmediate(r))
    expect(seen?.correlationId).toBe('corr-42')
  })

  it('does not enrich outside of a request context', async () => {
    const bus = new EventBusService()
    let seen: IEvent | undefined
    bus.subscribe('ctx.none', {
      handle: async (e) => {
        seen = e
      },
    })

    bus.emit(event('ctx.none'))
    await new Promise((r) => setImmediate(r))
    expect(seen?.correlationId).toBeUndefined()
  })

  it('retries failed handlers with backoff, then dead-letters', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bus = new EventBusService()
    let attempts = 0
    const handle = vi.fn().mockImplementation(async () => {
      attempts++
      throw new Error('handler boom')
    })
    bus.subscribe('boom.event', { handle })

    bus.emit(event('boom.event'))
    // maxRetries: 3, retryDelayMs: 500 * attempt
    await vi.advanceTimersByTimeAsync(10_000)

    expect(attempts).toBe(3)
    expect(bus.getDeadLetterQueue()).toHaveLength(1)
    expect(bus.getDeadLetterQueue()[0].type).toBe('boom.event')

    errorSpy.mockRestore()
    vi.useRealTimers()
  })

  it('clear() removes subscriptions and the DLQ', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bus = new EventBusService()
    const handle = vi.fn().mockRejectedValue(new Error('x'))
    bus.subscribe('clear.me', { handle })

    bus.emit(event('clear.me'))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(bus.getDeadLetterQueue()).toHaveLength(1)

    bus.clear()

    const second = vi.fn()
    bus.subscribe('clear.me', { handle: second })
    bus.emit(event('clear.me'))
    await vi.advanceTimersByTimeAsync(100)
    expect(second).toHaveBeenCalledTimes(1) // old failed handler no longer attached
    expect(bus.getDeadLetterQueue()).toHaveLength(0)

    errorSpy.mockRestore()
    vi.useRealTimers()
  })
})
