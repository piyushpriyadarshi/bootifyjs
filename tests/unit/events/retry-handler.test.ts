import { afterEach, describe, expect, it, vi } from 'vitest'
import { RetryHandler } from '../../../src/events/retry/retry-handler'
import { defaultBufferedEventConfig } from '../../../src/events/config/buffered-event-config'
import type { PriorityEvent } from '../../../src/events/shared-buffer'

function event(n = 1): PriorityEvent {
  return { type: 'test.event', payload: { n }, retryCount: 0 }
}

function makeHandler(delays = [10, 10, 10]) {
  return new RetryHandler({
    ...defaultBufferedEventConfig,
    retryAttempts: 2,
    retryDelays: delays,
  })
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RetryHandler', () => {
  it('resolves immediately when the handler succeeds on the first attempt', async () => {
    const handler = makeHandler()
    const handle = vi.fn().mockResolvedValue(undefined)

    await handler.handleWithRetry(event(), { handle })

    expect(handle).toHaveBeenCalledTimes(1)
    expect(handler.getRetryStats().totalRetries).toBe(0)
    expect(handler.getDeadLetterQueue()).toHaveLength(0)
  })

  it('retries with backoff and records successful retries', async () => {
    vi.useFakeTimers()
    const handler = makeHandler()
    let calls = 0
    const handle = vi.fn().mockImplementation(async () => {
      calls++
      if (calls < 3) throw new Error('flaky')
    })

    const promise = handler.handleWithRetry(event(), { handle })
    // flush retry delays (calculateRetryDelay clamps to >= 100ms)
    await vi.advanceTimersByTimeAsync(200)
    await vi.advanceTimersByTimeAsync(200)
    await promise

    expect(handle).toHaveBeenCalledTimes(3)
    expect(handler.getRetryStats().successfulRetries).toBe(1)
    expect(handler.getRetryStats().totalRetries).toBe(2)
  })

  it('moves to DLQ after exhausting attempts and throws', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const handler = makeHandler()
    const handle = vi.fn().mockRejectedValue(new Error('always fails'))

    const settled = handler.handleWithRetry(event(9), { handle })
    const expectation = expect(settled).rejects.toThrow(/failed after/)
    await vi.advanceTimersByTimeAsync(500)
    await expectation

    const dlq = handler.getDeadLetterQueue()
    expect(dlq).toHaveLength(1)
    expect(dlq[0].event.type).toBe('test.event')
    expect(dlq[0].totalAttempts).toBe(3) // initial + 2 retries
    expect(dlq[0].finalError.message).toBe('always fails')
    expect(handler.getRetryStats().deadLetterCount).toBe(1)

    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('applies backoff delays between attempts', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const handler = makeHandler([100, 200])
    let calls = 0
    const handle = vi.fn().mockImplementation(async () => {
      calls++
      if (calls < 3) throw new Error('fail')
    })

    const promise = handler.handleWithRetry(event(), { handle })
    await vi.advanceTimersByTimeAsync(50)
    expect(calls).toBe(1) // still waiting out the first delay
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(250)
    await promise

    expect(calls).toBe(3)
    warnSpy.mockRestore()
  })

  it('clearDeadLetterQueue and resetStats reset observability state', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const handler = makeHandler()
    const handle = vi.fn().mockRejectedValue(new Error('x'))

    const settled = handler.handleWithRetry(event(), { handle }).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(500)
    await settled

    expect(handler.getDeadLetterQueue()).toHaveLength(1)
    handler.clearDeadLetterQueue()
    expect(handler.getDeadLetterQueue()).toHaveLength(0)

    handler.resetStats()
    expect(handler.getRetryStats().deadLetterCount).toBe(0)

    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('reprocessDeadLetterQueue replays failed events', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const handler = makeHandler()
    const handle = vi.fn().mockRejectedValue(new Error('temp'))
    // Event exhausts retries into the DLQ; reprocess with a handler that succeeds

    const settled = handler.handleWithRetry(event(1), { handle }).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(500)
    await settled
    expect(handler.getDeadLetterQueue()).toHaveLength(1)

    const succeeding = { handle: vi.fn().mockResolvedValue(undefined) }
    const result = await handler.reprocessDeadLetterQueue(succeeding as any)

    expect(result.processed).toBe(1)
    expect(result.failed).toBe(0)
    expect(handler.getDeadLetterQueue()).toHaveLength(0)
    expect(succeeding.handle).toHaveBeenCalledTimes(1)

    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
