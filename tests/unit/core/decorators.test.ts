import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  Autowired,
  Body,
  Controller,
  Component,
  Delete,
  Get,
  Head,
  Options,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  Schema,
  Swagger,
  UseMiddleware,
} from '../../../src/core/decorators'
import { METADATA_KEYS, container } from '../../../src/core/di-container'

const noop: any = () => undefined

describe('route decorators', () => {
  it('store route definitions on the class constructor for all 7 verbs', () => {
    @Component()
    class RoutesController {
      @Get('/a')
      getA() {}

      @Post('/b')
      postB() {}

      @Put('/c')
      putC() {}

      @Delete('/d')
      deleteD() {}

      @Patch('/e')
      patchE() {}

      @Head('/f')
      headF() {}

      @Options('/g')
      optionsG() {}
    }

    const routes = Reflect.getMetadata(
      METADATA_KEYS.routes,
      RoutesController
    ) as Array<{ method: string; path: string; handlerName: string }>

    const byMethod = Object.fromEntries(routes.map((r) => [r.method, r]))
    expect(routes).toHaveLength(7)
    expect(byMethod.GET).toMatchObject({ path: '/a', handlerName: 'getA' })
    expect(byMethod.POST).toMatchObject({ path: '/b', handlerName: 'postB' })
    expect(byMethod.PUT).toMatchObject({ path: '/c', handlerName: 'putC' })
    expect(byMethod.DELETE).toMatchObject({ path: '/d', handlerName: 'deleteD' })
    expect(byMethod.PATCH).toMatchObject({ path: '/e', handlerName: 'patchE' })
    expect(byMethod.HEAD).toMatchObject({ path: '/f', handlerName: 'headF' })
    expect(byMethod.OPTIONS).toMatchObject({ path: '/g', handlerName: 'optionsG' })
  })

  it('defaults the path to /', () => {
    @Component()
    class RootController {
      @Get()
      root() {}
    }
    const routes = Reflect.getMetadata(METADATA_KEYS.routes, RootController) as any[]
    expect(routes[0]).toMatchObject({ method: 'GET', path: '/' })
  })
})

describe('parameter decorators', () => {
  it('store { type, name, index } on the class constructor (not the prototype)', () => {
    @Component()
    class ParamsController {
      @Get('/p')
      handler(
        @Param('id') id: string,
        @Query('full') full: string,
        @Body() body: unknown,
        @Req() req: unknown,
        @Res() res: unknown
      ) {}
    }

    const params = Reflect.getMetadata(
      METADATA_KEYS.paramTypes,
      ParamsController,
      'handler'
    ) as any[]

    expect(params[0]).toEqual({ type: 'param', name: 'id', index: 0 })
    expect(params[1]).toEqual({ type: 'query', name: 'full', index: 1 })
    expect(params[2]).toEqual({ type: 'body', name: undefined, index: 2 })
    expect(params[3]).toEqual({ type: 'request', name: undefined, index: 3 })
    expect(params[4]).toEqual({ type: 'reply', name: undefined, index: 4 })

    // nothing stored on the prototype
    expect(
      Reflect.getMetadata(METADATA_KEYS.paramTypes, ParamsController.prototype, 'handler')
    ).toBeUndefined()
  })

  it('record the index for sparse parameter layouts', () => {
    @Component()
    class SparseController {
      @Get('/sparse')
      handler(undecorated: string, @Body() body: unknown) {}
    }

    const params = Reflect.getMetadata(
      METADATA_KEYS.paramTypes,
      SparseController,
      'handler'
    ) as any[]

    expect(params.length).toBe(2)
    expect(params[0]).toBeUndefined()
    expect(params[1]).toEqual({ type: 'body', name: undefined, index: 1 })
  })
})

describe('metadata decorators', () => {
  it('Schema stores the validation descriptor on the method', () => {
    const schema = { body: z.object({ name: z.string() }) }
    const validate = vi.fn()

    @Component()
    class ValidatedController {
      @Schema(schema)
      @UseMiddleware(validate)
      create() {}
    }

    expect(
      Reflect.getMetadata(METADATA_KEYS.validationSchema, ValidatedController.prototype, 'create')
    ).toBe(schema)
    const mws = Reflect.getMetadata(
      METADATA_KEYS.middleware,
      ValidatedController.prototype,
      'create'
    ) as any[]
    expect(mws).toEqual([validate])
  })

  it('Swagger stores class-level and method-level metadata independently', () => {
    @Swagger({ tags: ['Users'] })
    @Component()
    class SwaggerController {
      @Swagger({ summary: 'Get one' })
      @Get('/one')
      one() {}
    }

    expect(Reflect.getMetadata(METADATA_KEYS.swaggerMetadata, SwaggerController)).toEqual({
      tags: ['Users'],
    })
    expect(
      Reflect.getMetadata(METADATA_KEYS.swaggerMetadata, SwaggerController.prototype, 'one')
    ).toEqual({ summary: 'Get one' })
  })

  it('UseMiddleware stores class-level middleware on the constructor', () => {
    const mw = vi.fn()

    @UseMiddleware(mw)
    @Component()
    class MiddlewareController {}

    expect(
      Reflect.getMetadata(METADATA_KEYS.middleware, MiddlewareController)
    ).toEqual([mw])
  })
})

describe('Component decorators', () => {
  it('register into the container with bindTo aliases and transient scope', () => {
    const TOKEN = Symbol('ComponentControllerToken')

    @Component({ scope: 'transient', bindTo: [TOKEN] })
    class TransientSvc {}

    expect(container.isRegistered(TransientSvc)).toBe(true)
    expect(container.isRegistered(TOKEN)).toBe(true)
    expect(container.resolve(TransientSvc)).not.toBe(container.resolve(TransientSvc))
    expect(container.resolve<TransientSvc>(TOKEN)).toBeInstanceOf(TransientSvc)
  })

  it('do not throw when a decorated class is re-evaluated (idempotent override)', () => {
    class TwiceSvc {}

    expect(() => {
      Component()(TwiceSvc)
      Component()(TwiceSvc)
    }).not.toThrow()
  })
})

describe('Controller decorator', () => {
  it('stores the prefix, registers into the container, honors scope options', () => {
    @Controller('/notes', { scope: 'transient' })
    class NotesController {}

    expect(
      Reflect.getMetadata(METADATA_KEYS.controllerPrefix, NotesController)
    ).toBe('/notes')
    expect(container.isRegistered(NotesController)).toBe(true)
    expect(container.resolve(NotesController)).not.toBe(
      container.resolve(NotesController)
    )
  })

  it('defaults scope to singleton', () => {
    @Controller('/default-scope')
    class SingletonController {}

    expect(container.resolve(SingletonController)).toBe(
      container.resolve(SingletonController)
    )
  })
})

describe('Autowired decorator', () => {
  it('requires a token for constructor parameter injection', () => {
    expect(() => {
      class Broken {
        constructor(public dep: unknown) {}
      }
      Reflect.defineMetadata('design:paramtypes', [Object], Broken)
      const decorator = Autowired()
      decorator(Broken, undefined, 0)
    }).toThrow(/token is required/)
  })

  it('records property injection metadata with an explicit token', () => {
    const TOKEN = Symbol('PropToken')

    class WithProps {
      @Autowired(TOKEN)
      private dep!: unknown
    }

    const props = Reflect.getMetadata(
      METADATA_KEYS.autowiredProperties,
      WithProps
    ) as Array<{ propertyKey: string | symbol; token: any }>

    expect(props).toHaveLength(1)
    expect(props[0].token).toBe(TOKEN)
    expect(props[0].propertyKey).toBe('dep')
  })

  it('cannot resolve a token when design:type is unavailable', () => {
    class Untyped {}

    expect(() => Autowired()(Untyped.prototype as any, 'missingProp')).toThrow(
      /Could not resolve type/
    )
  })
})
