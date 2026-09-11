import { describe, expect, it } from 'vitest'
import { RequestContextProvider } from '../../../src/logging/core/context-providers/request-context.provider'
import { BaseLogger } from '../../../src/logging/core/base-logger'
import { RequestContextService } from '../../../src/core/request-context.service'
import { DefaultSystemInfoProvider } from '../../../src/logging/core/system-info'
import { FakeTransport } from '../../helpers/fakes'

describe('RequestContextProvider', () => {
  it('pulls the ALS request context into log entries', () => {
    const transport = new FakeTransport()
    const logger = new BaseLogger({
      level: 'info',
      transports: [transport],
      contextProviders: [new RequestContextProvider()],
    })

    RequestContextService.run(() => {
      const svc = new RequestContextService()
      svc.set('requestId', 'req-1')
      svc.set('userId', 'u-1')
      logger.info('with context')
    })

    logger.info('without context')

    expect(transport.entries[0].context).toMatchObject({ requestId: 'req-1', userId: 'u-1' })
    expect(transport.entries[1].context).not.toHaveProperty('requestId')
  })
})

describe('DefaultSystemInfoProvider', () => {
  it('returns a complete SystemInfo snapshot', () => {
    const info = new DefaultSystemInfoProvider().get()

    expect(info.hostname.length).toBeGreaterThan(0)
    expect(typeof info.username).toBe('string')
    expect(info.cpuCount).toBeGreaterThan(0)
    expect(info.totalMemoryBytes).toBeGreaterThan(0)
    expect(info.platform.length).toBeGreaterThan(0)
    expect(info.arch.length).toBeGreaterThan(0)
    expect(info.cwd).toBe(process.cwd())
  })
})
