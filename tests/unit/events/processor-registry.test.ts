import { describe, expect, it, vi } from 'vitest'
import { removeProcessor, defineProcessor, getProcessor, hasProcessor, getRegisteredEventTypes } from '../../../src/events/worker/processor-registry'

describe('processor-registry', () => {
  it('registers and resolves handler factories by event type', () => {
    const handler = { handle: vi.fn() }
    defineProcessor('unit.test', () => handler)

    expect(hasProcessor('unit.test')).toBe(true)
    expect(getProcessor('unit.test')).toBe(handler)
    expect(getRegisteredEventTypes()).toContain('unit.test')

    removeProcessor('unit.test')
    expect(hasProcessor('unit.test')).toBe(false)
  })

  it('invokes the factory each resolution (fresh handler per use)', () => {
    const handle = vi.fn().mockResolvedValue(undefined)
    defineProcessor('factory.test', () => ({ handle }))

    const a = getProcessor('factory.test')
    const b = getProcessor('factory.test')
    expect(a).not.toBe(b)

    removeProcessor('factory.test')
  })
})
