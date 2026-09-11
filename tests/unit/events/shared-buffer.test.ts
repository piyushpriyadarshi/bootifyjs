import { describe, expect, it } from 'vitest'
import { SharedEventBuffer } from '../../../src/events/shared-buffer'
import type { PriorityEvent } from '../../../src/events/shared-buffer'

function makeEvent(n: number, extra: Partial<PriorityEvent> = {}): PriorityEvent {
  return { type: `test.${n}`, payload: { n }, ...extra }
}

describe('SharedEventBuffer', () => {
  it('enqueues and dequeues in FIFO order', () => {
    const buffer = new SharedEventBuffer({ maxEvents: 10, maxEventSize: 1024, totalMemoryMB: 1 })

    buffer.enqueue(makeEvent(1))
    buffer.enqueue(makeEvent(2))
    buffer.enqueue(makeEvent(3))

    expect(buffer.size()).toBe(3)
    expect(buffer.dequeue()).toMatchObject({ type: 'test.1' })
    expect(buffer.dequeue()).toMatchObject({ type: 'test.2' })
    expect(buffer.dequeue()).toMatchObject({ type: 'test.3' })
    expect(buffer.isEmpty()).toBe(true)
  })

  it('reports full state and refuses new events at capacity', () => {
    const buffer = new SharedEventBuffer({ maxEvents: 2, maxEventSize: 1024, totalMemoryMB: 1 })

    expect(buffer.enqueue(makeEvent(1))).toBe(true)
    expect(buffer.enqueue(makeEvent(2))).toBe(true)
    expect(buffer.isFull()).toBe(true)
    expect(buffer.enqueue(makeEvent(3))).toBe(false)
    expect(buffer.size()).toBe(2)
  })

  it('throws when an event exceeds maxEventSize', () => {
    const buffer = new SharedEventBuffer({ maxEvents: 10, maxEventSize: 64, totalMemoryMB: 1 })
    const big = makeEvent(1, { payload: { blob: 'x'.repeat(4096) } })

    expect(() => buffer.enqueue(big)).toThrow(/exceeds maximum/)
  })

  it('round-trips the full event payload through serialization', () => {
    const buffer = new SharedEventBuffer({ maxEvents: 10, maxEventSize: 2048, totalMemoryMB: 1 })
    const event = makeEvent(1, {
      payload: { deep: { nested: [1, 2, 3] } },
      priority: 'critical',
      correlationId: 'corr-1',
    })

    buffer.enqueue(event)
    const out = buffer.dequeue()!

    expect(out.payload).toEqual({ deep: { nested: [1, 2, 3] } })
    expect(out.priority).toBe('critical')
    expect(out.correlationId).toBe('corr-1')
    expect(typeof out.timestamp).toBe('number')
    expect(out.retryCount).toBe(0)
  })

  it('wraps the circular buffer (dequeue after wrap still FIFO)', () => {
    const buffer = new SharedEventBuffer({ maxEvents: 3, maxEventSize: 1024, totalMemoryMB: 1 })

    // fill, drain, refill — write index wraps past the end
    for (const n of [1, 2, 3]) buffer.enqueue(makeEvent(n))
    for (let i = 0; i < 3; i++) buffer.dequeue()
    for (const n of [4, 5, 6]) buffer.enqueue(makeEvent(n))
    for (let i = 0; i < 3; i++) buffer.dequeue()

    // second wrap cycle
    for (const n of [10, 11, 12]) buffer.enqueue(makeEvent(n))

    const drained: number[] = []
    let event = buffer.dequeue()
    while (event) {
      drained.push(parseInt(event.type.split('.')[1], 10))
      event = buffer.dequeue()
    }
    expect(drained).toEqual([10, 11, 12])
  })

  it('getStats reports utilization and indices', () => {
    const buffer = new SharedEventBuffer({ maxEvents: 4, maxEventSize: 1024, totalMemoryMB: 1 })
    buffer.enqueue(makeEvent(1))
    buffer.enqueue(makeEvent(2))

    const stats = buffer.getStats()
    expect(stats.size).toBe(2)
    expect(stats.maxEvents).toBe(4)
    expect(stats.utilization).toBe(50)
    expect(stats.isEmpty).toBe(false)
    expect(stats.isFull).toBe(false)
  })

  it('clear() resets the buffer to empty', () => {
    const buffer = new SharedEventBuffer({ maxEvents: 4, maxEventSize: 1024, totalMemoryMB: 1 })
    buffer.enqueue(makeEvent(1))
    buffer.enqueue(makeEvent(2))

    buffer.clear()

    expect(buffer.isEmpty()).toBe(true)
    expect(buffer.dequeue()).toBeNull()
  })

  it('exposes the underlying SharedArrayBuffer', () => {
    const buffer = new SharedEventBuffer({ maxEvents: 4, maxEventSize: 1024, totalMemoryMB: 1 })
    expect(buffer.getSharedBuffer()).toBeInstanceOf(SharedArrayBuffer)
  })
})
