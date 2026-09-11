import { describe, expect, it } from 'vitest'
import { Autowired } from '../../../src/core/decorators'
import {
  Container,
  METADATA_KEYS,
  createContainer,
} from '../../../src/core/di-container'
import {
  CircularDependencyError,
  InterfaceTokenError,
  InvalidRegistrationError,
  ServiceNotFoundError,
} from '../../../src/core/errors'

/**
 * Any class decorator makes tsc emit `design:paramtypes` for the class (the
 * same mechanism `@Service()` relies on in production). Used on plain test
 * classes so constructor injection is exercised without container side effects.
 */
const Tag = (): ClassDecorator => (target: any) => target

describe('Container — scopes', () => {
  it('returns the same instance for singletons (case 1)', () => {
    const c = new Container()
    class Svc {}
    c.register(Svc, { useClass: Svc })
    expect(c.resolve(Svc)).toBe(c.resolve(Svc))
  })

  it('returns a fresh instance per resolve for transients (case 2)', () => {
    const c = new Container()
    class Svc {}
    c.register(Svc, { useClass: Svc, scope: 'transient' })
    expect(c.resolve(Svc)).not.toBe(c.resolve(Svc))
  })

  it('caches factory results for singleton scope (case 3)', () => {
    const c = new Container()
    let count = 0
    c.register('fac', { useFactory: () => ({ n: ++count }) })
    expect(c.resolve('fac')).toBe(c.resolve('fac'))
  })

  it('creates a fresh factory result per resolve for transient scope (case 3)', () => {
    const c = new Container()
    let count = 0
    c.register('fac', { useFactory: () => ({ n: ++count }), scope: 'transient' })
    expect(c.resolve('fac')).not.toEqual(c.resolve('fac'))
  })
})

describe('Container — constructor injection', () => {
  it('resolves a 2-level chain via design:paramtypes (case 5)', () => {
    const c = new Container()
    @Tag()
    class Repo {
      value = 'repo'
    }
    @Tag()
    class Svc {
      constructor(public repo: Repo) {}
    }
    c.register(Repo, { useClass: Repo })
    c.register(Svc, { useClass: Svc })

    const svc = c.resolve<Svc>(Svc)
    expect(svc.repo).toBeInstanceOf(Repo)
  })

  it('resolves a 3-level chain (case 5)', () => {
    const c = new Container()
    @Tag()
    class A {
      marker = 'A'
    }
    @Tag()
    class B {
      constructor(public a: A) {}
    }
    @Tag()
    class C {
      constructor(public b: B) {}
    }
    c.register(A, { useClass: A })
    c.register(B, { useClass: B })
    c.register(C, { useClass: C })

    expect(c.resolve<C>(C).b.a.marker).toBe('A')
  })

  it('prefers @Autowired(token) per constructor index (case 6)', () => {
    const c = new Container()
    const TOKEN = Symbol('impl')
    class Impl {
      tag = 'impl'
    }
    class Fallback {
      tag = 'fallback'
    }
    @Tag()
    class Svc {
      constructor(@Autowired(TOKEN) public dep: Fallback) {}
    }

    c.register(TOKEN, { useClass: Impl })
    c.register(Fallback, { useClass: Fallback })
    c.register(Svc, { useClass: Svc })

    expect(c.resolve<Svc>(Svc).dep.tag).toBe('impl')
  })

  it('resolves primitive params as undefined (case 10)', () => {
    const c = new Container()
    class Svc {
      constructor(
        public name: string,
        public age: number,
        public flag: boolean
      ) {}
    }
    c.register(Svc, { useClass: Svc })
    const svc = c.resolve<Svc>(Svc)
    expect(svc.name).toBeUndefined()
    expect(svc.age).toBeUndefined()
    expect(svc.flag).toBeUndefined()
  })

  it('throws InterfaceTokenError for interface-typed params instead of silent undefined (case 9)', () => {
    const c = new Container()
    interface Shape {
      area(): number
    }
    @Tag()
    class Svc {
      constructor(public shape: Shape) {}
    }
    c.register(Svc, { useClass: Svc })

    // tsc emitDecoratorMetadata emits Object for interface-typed params
    expect(() => c.resolve(Svc)).toThrow(InterfaceTokenError)
    expect(() => c.resolve(Svc)).toThrow(/@Autowired/)
  })
})

describe('Container — property injection', () => {
  it('injects @Autowired properties on useClass instances', () => {
    const c = new Container()
    class Repo {}
    class Svc {
      @Autowired(Repo)
      repo!: Repo
    }
    c.register(Repo, { useClass: Repo })
    c.register(Svc, { useClass: Svc })

    expect(c.resolve<Svc>(Svc).repo).toBeInstanceOf(Repo)
  })

  it('injects @Autowired properties on factory-created instances (case 4)', () => {
    const c = new Container()
    class Repo {}
    class Svc {
      @Autowired(Repo)
      repo!: Repo
    }
    c.register(Repo, { useClass: Repo })
    c.register('fac', { useFactory: () => new Svc() })

    expect(c.resolve<Svc>('fac').repo).toBeInstanceOf(Repo)
  })

  it('propagates a circular property-injection chain (case 8)', () => {
    const c = new Container()
    const TOKEN_A = Symbol('propA')
    const TOKEN_B = Symbol('propB')

    class A {
      @Autowired(TOKEN_B)
      b!: unknown
    }
    class B {
      @Autowired(TOKEN_A)
      a!: unknown
    }
    c.register(TOKEN_A, { useClass: A })
    c.register(TOKEN_B, { useClass: B })

    expect(() => c.resolve(TOKEN_A)).toThrow(CircularDependencyError)
  })
})

describe('Container — circular constructor dependencies', () => {
  it('throws CircularDependencyError (case 7)', () => {
    const c = new Container()
    class CycleA {}
    class CycleB {}
    Reflect.defineMetadata('design:paramtypes', [CycleB], CycleA)
    Reflect.defineMetadata('design:paramtypes', [CycleA], CycleB)
    c.register(CycleA, { useClass: CycleA })
    c.register(CycleB, { useClass: CycleB })

    expect(() => c.resolve(CycleA)).toThrow(CircularDependencyError)
  })
})

describe('Container — registration contract', () => {
  it('throws on duplicate registration without override; replaces with override (case 11)', () => {
    const c = new Container()
    c.register('t', { useFactory: () => ({ v: 1 }) })
    expect(() => c.register('t', { useFactory: () => ({ v: 2 }) })).toThrow(
      InvalidRegistrationError
    )

    c.register('t', { useFactory: () => ({ v: 3 }), override: true })
    const inst = c.resolve<{ v: number }>('t')
    expect(inst.v).toBe(3)
    expect(c.resolve('t')).toBe(inst) // old cached instance discarded
  })

  it('throws ServiceNotFoundError for unknown tokens (case 12)', () => {
    const c = new Container()
    expect(() => c.resolve('nope')).toThrow(ServiceNotFoundError)
  })

  it('throws InvalidRegistrationError when no provider is given (case 13)', () => {
    const c = new Container()
    expect(() => c.register('bad', {})).toThrow(InvalidRegistrationError)
    expect(() => c.register('bad', {})).toThrow(/useClass.*useFactory/)
  })

  it('never caches a partial singleton after a failed resolution (case 14)', () => {
    const c = new Container()
    class Missing {}
    @Tag()
    class NeedsDep {
      constructor(public dep: Missing) {}
    }
    c.register(NeedsDep, { useClass: NeedsDep })

    expect(() => c.resolve(NeedsDep)).toThrow(ServiceNotFoundError)

    c.register(Missing, { useClass: Missing })
    const svc = c.resolve<NeedsDep>(NeedsDep)
    expect(svc.dep).toBeInstanceOf(Missing)
    expect(c.resolve(NeedsDep)).toBe(svc)
  })
})

describe('Container — lifecycle', () => {
  it('clear() removes registrations and cached instances (case 15)', () => {
    const c = new Container()
    class Svc {}
    c.register(Svc, { useClass: Svc })
    const first = c.resolve(Svc)

    c.clear()

    expect(c.isRegistered(Svc)).toBe(false)
    expect(() => c.resolve(Svc)).toThrow(ServiceNotFoundError)
    expect(c.getRegisteredComponents()).toEqual([])
    expect(first).toBeDefined()
  })

  it('eagerInit() resolves eager tokens once and leaves others untouched (case 16)', async () => {
    const c = new Container()
    let eagerCount = 0
    let lazyCount = 0
    c.register('eager', { useFactory: () => ({ n: ++eagerCount }), eager: true })
    c.register('lazy', { useFactory: () => ({ n: ++lazyCount }) })

    await c.eagerInit()
    expect(eagerCount).toBe(1)
    expect(lazyCount).toBe(0)

    await c.eagerInit()
    expect(eagerCount).toBe(1) // cached singleton, not re-created
    expect(c.isRegistered('lazy')).toBe(true)
  })

  it('eagerInit() surfaces resolution errors (fail-fast)', async () => {
    const c = new Container()
    c.register('broken', { useFactory: () => { throw new Error('boom') }, eager: true })
    await expect(c.eagerInit()).rejects.toThrow('boom')
  })
})

describe('Container — tokens and factories', () => {
  it('dedupes getRegisteredComponents across aliased tokens (case 17)', () => {
    const c = new Container()
    class Svc {}
    c.register(Svc, { useClass: Svc })
    c.register('alias1', { useClass: Svc })
    c.register('alias2', { useClass: Svc })

    expect(c.getRegisteredComponents()).toEqual([Svc])
  })

  it('resolves string, symbol and class tokens (case 18)', () => {
    const c = new Container()
    const sym = Symbol('sym')
    class Svc {
      ok = true
    }
    c.register('str', { useClass: Svc })
    c.register(sym, { useClass: Svc })
    c.register(Svc, { useClass: Svc })

    expect(c.resolve<Svc>('str').ok).toBe(true)
    expect(c.resolve<Svc>(sym).ok).toBe(true)
    expect(c.resolve<Svc>(Svc).ok).toBe(true)
  })

  it('createContainer() returns isolated instances (case 19)', () => {
    const a = createContainer()
    const b = createContainer()
    class Svc {}
    a.register(Svc, { useClass: Svc })

    expect(a.isRegistered(Svc)).toBe(true)
    expect(b.isRegistered(Svc)).toBe(false)
  })
})
