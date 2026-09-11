import { describe, expect, it, vi } from 'vitest'
import {
  createLogger,
  getLogger,
  isLoggerInitialized,
  LOGGER_TOKEN,
  resetLogger,
} from '../../../src/logging/core/logger-builder'
import { BaseLogger } from '../../../src/logging/core/base-logger'
import { container } from '../../../src/core/di-container'
import { FakeTransport } from '../../helpers/fakes'

describe('LoggerBuilder', () => {
  it('builds a BaseLogger that dispatches to configured transports', () => {
    const transport = new FakeTransport()
    const logger = createLogger()
      .setLevel('info')
      .setServiceName('test-svc')
      .disableConsole()
      .addTransport(transport)
      .build()

    logger.info('built', { k: 1 })
    expect(transport.entries[0].message).toBe('built')
    expect(transport.entries[0].context?.service).toBe('test-svc')
    expect(logger).toBeInstanceOf(BaseLogger)
  })

  it('registers the built logger into the container (getLogger works)', () => {
    const transport = new FakeTransport()
    createLogger().disableConsole().addTransport(transport).build()

    expect(isLoggerInitialized()).toBe(true)
    expect(getLogger()).toBeDefined()

    getLogger().warn('from-container')
    expect(transport.entries[0].message).toBe('from-container')
    expect(container.isRegistered(LOGGER_TOKEN)).toBe(true)
  })

  it('use() accepts a custom ILogger implementation', () => {
    const custom = {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
    }
    const logger = createLogger().use(custom as any).build()

    logger.info('custom path')
    expect(custom.info).toHaveBeenCalledWith('custom path')
  })

  it('useFactory() creates the custom logger eagerly', () => {
    const factory = vi.fn().mockReturnValue({
      trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(),
      error: vi.fn(), fatal: vi.fn(), child: vi.fn(),
    })
    createLogger().useFactory(factory).build()
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('resetLogger() clears the flag AND the container bindings', () => {
    const transport = new FakeTransport()
    createLogger().disableConsole().addTransport(transport).build()
    expect(isLoggerInitialized()).toBe(true)

    resetLogger()

    expect(isLoggerInitialized()).toBe(false)
    expect(container.isRegistered(LOGGER_TOKEN)).toBe(false)

    // a fresh build re-registers cleanly
    createLogger().disableConsole().addTransport(transport).build()
    expect(isLoggerInitialized()).toBe(true)
  })
})
