import { describe, expect, it, vi } from 'vitest'
import { BaseLogger } from '../../../src/logging/core/base-logger'
import type { LogEntry } from '../../../src/logging/core/interfaces'
import { FakeTransport } from '../../helpers/fakes'

function makeLogger(opts: any = {}) {
  const transport = new FakeTransport()
  const logger = new BaseLogger({ level: 'info', ...opts, transports: [transport] })
  return { logger, transport }
}

describe('BaseLogger — level filtering', () => {
  it('filters entries below the configured level', () => {
    const { logger, transport } = makeLogger({ level: 'warn' })

    logger.trace('t')
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')

    expect(transport.messages()).toEqual(['w', 'e'])
  })

  it('does not write when levels match exactly', () => {
    const { logger, transport } = makeLogger({ level: 'info' })
    logger.info('boundary')
    expect(transport.entries).toHaveLength(1)
  })

  it('setLevel changes filtering at runtime', () => {
    const { logger, transport } = makeLogger({ level: 'error' })
    logger.debug('dropped')
    logger.setLevel('debug')
    logger.debug('kept')
    expect(transport.messages()).toEqual(['kept'])
  })
})

describe('BaseLogger — context merging', () => {
  it('merges base < child bindings < providers < call-site', () => {
    const transport = new FakeTransport()
    const logger = new BaseLogger({
      level: 'info',
      baseContext: { base: 'base', service: 'svc' },
      transports: [transport],
    })

    logger.addContextProvider({ getContext: () => ({ fromProvider: 'p' }) })
    const child = logger.child({ child: 'child', base: 'overridden-by-child' })
    child.info('hello', { callSite: 'here', base: 'call-site-wins' })

    const ctx = transport.entries[0].context!
    expect(ctx).toEqual({
      base: 'call-site-wins',
      service: 'svc',
      child: 'child',
      fromProvider: 'p',
      callSite: 'here',
    })
  })

  it('child() keeps receiving provider updates independently', () => {
    let dynamic = 'v1'
    const transport = new FakeTransport()
    const logger = new BaseLogger({
      level: 'info',
      transports: [transport],
      contextProviders: [{ getContext: () => ({ dynamic }) }],
    })

    logger.info('a')
    dynamic = 'v2'
    logger.child({ component: 'X' }).info('b')

    expect(transport.entries[0].context?.dynamic).toBe('v1')
    expect(transport.entries[1].context?.dynamic).toBe('v2')
    expect(transport.entries[1].context?.component).toBe('X')
  })
})

describe('BaseLogger — entries and transports', () => {
  it('includes level, message, timestamp and error', () => {
    const { logger, transport } = makeLogger()
    const err = new Error('boom')
    logger.error('failed', err, { op: 'x' })

    const entry: LogEntry = transport.entries[0]
    expect(entry.level).toBe('error')
    expect(entry.message).toBe('failed')
    expect(entry.timestamp).toBeInstanceOf(Date)
    expect(entry.error).toBe(err)
    expect(entry.context).toMatchObject({ op: 'x' })
  })

  it('flush() and close() fan out to transports that support them', async () => {
    const { logger, transport } = makeLogger()
    await logger.flush()
    await logger.close()
    expect(transport.flushed).toBe(true)
    expect(transport.closed).toBe(true)
  })

  it('survives transport write failures without throwing', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const transport = new FakeTransport()
    transport.failOnWrite = true
    const logger = new BaseLogger({ level: 'info', transports: [transport] })

    expect(() => logger.info('still works')).not.toThrow()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('addTransport/removeTransport manage destinations by name', () => {
    const { logger, transport } = makeLogger()
    const second = new FakeTransport('second')
    logger.addTransport(second)

    logger.info('both')
    expect(transport.entries).toHaveLength(1)
    expect(second.entries).toHaveLength(1)

    logger.removeTransport('second')
    logger.info('only-first')
    expect(second.entries).toHaveLength(1)
  })
})
