import { describe, expect, it } from 'vitest'
import { Container } from '../../../src/core/di-container'
import { BootifyError, BootifyStateError } from '../../../src/core/errors'
import { RequestContextService } from '../../../src/core/request-context.service'
import 'reflect-metadata'

describe('smoke: DI container', () => {
  it('registers and resolves a factory singleton', () => {
    const c = new Container()
    let count = 0
    c.register('svc', { useFactory: () => ({ id: ++count }) })

    const a = c.resolve<{ id: number }>('svc')
    const b = c.resolve<{ id: number }>('svc')

    expect(a).toBe(b)
    expect(a.id).toBe(1)
  })

  it('resolves a class dependency via design:paramtypes metadata', () => {
    class Repo {
      value = 'repo'
    }
    class Svc {
      constructor(public repo: Repo) {}
    }
    Reflect.defineMetadata('design:paramtypes', [Repo], Svc)

    const c = new Container()
    c.register(Repo, { useClass: Repo })
    c.register(Svc, { useClass: Svc })

    expect(c.resolve<Svc>(Svc).repo.value).toBe('repo')
  })

  it('throws on unknown token and duplicate-free registration contract', () => {
    const c = new Container()
    expect(() => c.resolve('nope')).toThrow(/not registered/)
    expect(() => c.register('bad', {})).toThrow(/useClass.*useFactory/)
  })
})

describe('smoke: BootifyError taxonomy', () => {
  it('typed errors are instanceof BootifyError with codes', () => {
    const err = new BootifyStateError('already built')
    expect(err).toBeInstanceOf(BootifyError)
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('BOOTIFY_STATE')
    expect(err.name).toBe('BootifyStateError')
  })
})

describe('smoke: request context (AsyncLocalStorage)', () => {
  it('isolates context within run()', () => {
    const svc = new RequestContextService()

    RequestContextService.run(() => {
      svc.set('requestId', 'abc-123')
      expect(svc.get('requestId')).toBe('abc-123')
    })

    expect(svc.get('requestId')).toBeUndefined()
  })
})
