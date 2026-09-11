import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BufferedEventBusService } from '../../../src/events/buffered-event-bus.service'
import type { IEventHandler } from '../../../src/events/event.types'

describe('BufferedEventBusService — sync fallback mode', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function makeBus(handlers: Record<string, IEventHandler>) {
    const bus = new BufferedEventBusService({
      config: { enabled: false }, // never initializes workers
      fallbackToSync: true,
    })
    for (const [type, handler] of Object.entries(handlers)) {
      bus.registerHandler(type, handler)
    }
    return bus
  }

  it('processes events synchronously when uninitialized (fallback)', async () => {
    const handle = vi.fn().mockResolvedValue(undefined)
    const bus = makeBus({ 'todo.created': { handle } })

    const result = await bus.emitEvent('todo.created', { id: 1 })

    expect(result.success).toBe(true)
    expect(result.eventId).toMatch(/^evt_/)
    expect(typeof result.processingTime).toBe('number')
    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle.mock.calls[0][0].payload).toEqual({ id: 1 })
  })

  it('reports failures from the sync handler', async () => {
    const bus = makeBus({
      'failing.event': { handle: vi.fn().mockRejectedValue(new Error('handler exploded')) },
    })

    const result = await bus.emitEvent('failing.event', {})

    expect(result.success).toBe(false)
    expect(result.error).toBe('handler exploded')
  })

  it('reports a missing handler for unknown event types', async () => {
    const bus = makeBus({})
    const result = await bus.emitEvent('unknown.type', {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/No handler registered/)
  })

  it('throws when sync fallback is disabled and the bus is unavailable', async () => {
    const bus = new BufferedEventBusService({
      config: { enabled: false },
      fallbackToSync: false,
    })

    const result = await bus.emitEvent('any.type', {})
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not available/)
  })

  it('warns when handlers are registered without a processorsModule', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const bus = makeBus({})
    bus.registerHandler('x.y', { handle: vi.fn() })

    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('getConfig reflects defaults merged with overrides', () => {
    const bus = new BufferedEventBusService({
      config: { workerCount: 3 },
    })
    const config = bus.getConfig()
    expect(config.workerCount).toBe(3)
    expect(config.maxQueueSize).toBe(10000)
    expect(config.fallbackToSync).toBe(true)
  })

  it('dispose() shuts down cleanly without timers leaking', async () => {
    const bus = makeBus({})
    expect(bus.isReady()).toBe(false)

    await bus.dispose()

    expect(bus.isReady()).toBe(false)
    // metrics collector is in-process (works without workers)
    expect(bus.getMetrics()).toBeDefined()
  })

  it('throws on invalid configuration at construction', () => {
    expect(
      () =>
        new BufferedEventBusService({
          config: { workerCount: 999 as any },
        })
    ).toThrow(/Invalid buffered event configuration/)
  })
})
