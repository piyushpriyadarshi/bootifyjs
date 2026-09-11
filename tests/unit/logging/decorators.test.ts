import { describe, expect, it, vi } from 'vitest'
import { Audit, Loggable } from '../../../src/logging/core/decorators'
import {
  createLogger,
  getLogger,
  resetLogger,
} from '../../../src/logging/core/logger-builder'
import { FakeTransport } from '../../helpers/fakes'
import { RequestContextService } from '../../../src/core/request-context.service'

describe('@Audit', () => {
  it('logs a structured audit entry after successful execution', async () => {
    const transport = new FakeTransport()
    createLogger().disableConsole().addTransport(transport).build()

    class UserService {
      @Audit({ action: 'delete', resource: 'todo', resourceIdPath: 'args.0.id' })
      async deleteTodo(input: { id: string }) {
        return { deleted: true, id: input.id }
      }
    }

    const svc = new UserService()
    const result = await svc.deleteTodo({ id: 't-7' })

    expect(result.deleted).toBe(true)
    expect(transport.entries).toHaveLength(1)
    const ctx = transport.entries[0].context as any
    expect(ctx.logType).toBe('audit')
    expect(ctx.action).toBe('delete')
    expect(ctx.resource).toBe('todo')
    expect(ctx.resourceId).toBe('t-7')
  })

  it('captures the request context as the actor', async () => {
    const transport = new FakeTransport()
    createLogger().disableConsole().addTransport(transport).build()

    class AdminService {
      @Audit({ action: 'purge', resource: 'cache' })
      async purge() {
        return 'ok'
      }
    }

    await RequestContextService.run(() => {
      new RequestContextService().set('userId', 'admin-1')
      return new AdminService().purge()
    })

    const ctx = transport.entries[0].context as any
    expect(ctx.actor).toMatchObject({ userId: 'admin-1' })
  })

  it('skips the audit log (method still runs) when logger is uninitialized', async () => {
    resetLogger()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    class QuietService {
      @Audit({ action: 'do', resource: 'thing' })
      async doThing() {
        return 'ran-anyway'
      }
    }

    const result = await new QuietService().doThing()
    expect(result).toBe('ran-anyway')
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('does not audit when the method throws', async () => {
    const transport = new FakeTransport()
    createLogger().disableConsole().addTransport(transport).build()

    class FailingService {
      @Audit({ action: 'x', resource: 'y' })
      async boom() {
        throw new Error('nope')
      }
    }

    await expect(new FailingService().boom()).rejects.toThrow('nope')
    expect(transport.entries).toHaveLength(0)
  })
})

describe('@Loggable', () => {
  it('injects a child logger namespaced with the class name', () => {
    const transport = new FakeTransport()
    createLogger().disableConsole().addTransport(transport).build()

    @Loggable()
    class ComponentService {
      doWork() {
        return (this as any).logger.info('working')
      }
    }

    new ComponentService().doWork()
    expect(transport.entries[0].message).toBe('working')
    expect(transport.entries[0].context?.component).toBe('ComponentService')
  })

  it('falls back to a no-op logger when uninitialized (no crash)', () => {
    resetLogger()

    @Loggable()
    class UninitializedService {
      doWork() {
        return (this as any).logger.info('silently ignored')
      }
    }

    expect(new UninitializedService().doWork()).toBeUndefined()
    expect(vi.isMockFunction(getLogger)).toBe(false)
  })
})
