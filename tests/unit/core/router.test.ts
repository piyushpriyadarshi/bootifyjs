import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Body, Controller, Get, Head, Options, Param, Query } from '../../../src/core/decorators'
import {
  createContainer,
} from '../../../src/core/di-container'
import {
  buildFastifySchema,
  joinPaths,
  mergeSwaggerMetadata,
  normalizePrefix,
  registerControllers,
} from '../../../src/core/router'

function createFakeFastify() {
  const routes: any[] = []
  return {
    routes,
    route: (options: any) => routes.push(options),
  }
}

describe('path utilities', () => {
  it('normalizePrefix adds leading and strips trailing slashes', () => {
    expect(normalizePrefix('')).toBe('')
    expect(normalizePrefix('api')).toBe('/api')
    expect(normalizePrefix('/api/')).toBe('/api')
    expect(normalizePrefix('api/')).toBe('/api')
  })

  it('joinPaths joins segments and collapses duplicate slashes', () => {
    expect(joinPaths('/api', '/users', '/:id')).toBe('/api/users/:id')
    expect(joinPaths('/api/', '', '/users')).toBe('/api/users')
    expect(joinPaths('', '')).toBe('/')
  })
})

describe('mergeSwaggerMetadata', () => {
  it('returns method metadata when no controller metadata exists', () => {
    expect(mergeSwaggerMetadata(undefined, { summary: 'S' })).toEqual({ summary: 'S' })
    expect(mergeSwaggerMetadata(undefined, undefined)).toEqual({})
    expect(mergeSwaggerMetadata({ summary: 'C' }, undefined)).toEqual({ summary: 'C' })
  })

  it('method values override controller values, tags merge uniquely', () => {
    const merged = mergeSwaggerMetadata(
      { summary: 'controller', tags: ['a', 'b'], description: 'desc' },
      { summary: 'method', tags: ['b', 'c'] }
    )
    expect(merged).toEqual({
      summary: 'method',
      description: 'desc',
      tags: ['a', 'b', 'c'],
    })
  })

  it('omits tags when the merge is empty', () => {
    const merged = mergeSwaggerMetadata({}, {})
    expect(merged.tags).toBeUndefined()
  })
})

describe('buildFastifySchema', () => {
  it('maps zod schemas onto the Fastify schema shape', () => {
    const schema = buildFastifySchema({
      body: z.object({ name: z.string() }),
      query: z.object({ full: z.boolean() }),
      params: z.object({ id: z.string() }),
    })

    expect(schema.body.properties.name.type).toBe('string')
    expect(schema.querystring.properties.full.type).toBe('boolean')
    expect(schema.params.properties.id.type).toBe('string')
  })

  it('maps response schemas by status code', () => {
    const schema = buildFastifySchema({
      responses: {
        200: z.object({ ok: z.boolean() }),
      },
    })
    expect(schema.response['200'].properties.ok.type).toBe('boolean')
  })
})

describe('registerControllers', () => {
  @Controller('/users')
  class UsersController {
    @Get('/:id')
    get(
      @Param('id') id: string,
      @Query('full') full: string,
      @Body() body: unknown
    ) {
      return { id, full, body }
    }

    @Head('/ping')
    ping() {}

    @Options('/ping')
    options() {}
  }

  it('resolves basePrefix + controllerPrefix + method path and registers verbs', () => {
    const fake = createFakeFastify()
    registerControllers(fake as any, [UsersController], '/api/v1', { silent: true })

    expect(fake.routes).toHaveLength(3)
    const get = fake.routes.find((r) => r.method === 'GET')
    expect(get.url).toBe('/api/v1/users/:id')
    expect(fake.routes.some((r) => r.method === 'HEAD' && r.url === '/api/v1/users/ping')).toBe(true)
    expect(fake.routes.some((r) => r.method === 'OPTIONS' && r.url === '/api/v1/users/ping')).toBe(true)
  })

  it('invokes the handler with index-resolved parameters', async () => {
    const fake = createFakeFastify()
    registerControllers(fake as any, [UsersController], '', { silent: true })

    const get = fake.routes.find((r) => r.method === 'GET')!
    const result = await get.handler(
      { params: { id: '7' }, query: { full: 'yes' }, body: { x: 1 } },
      { sent: false }
    )

    expect(result).toEqual({ id: '7', full: 'yes', body: { x: 1 } })
  })

  it('uses an injected container to resolve controller instances', async () => {
    class Svc {
      value = 'from-custom-container'
    }

    @Controller('/things')
    class ThingsController {
      constructor(public svc: Svc) {}

      @Get('/')
      list() {
        return this.svc.value
      }
    }

    const custom = createContainer()
    custom.register(Svc, { useClass: Svc })
    custom.register(ThingsController, { useClass: ThingsController, override: true })

    const fake = createFakeFastify()
    registerControllers(fake as any, [ThingsController], '', {
      container: custom,
      silent: true,
    })

    const get = fake.routes.find((r) => r.method === 'GET')!
    await expect(get.handler({}, { sent: false })).resolves.toBe(
      'from-custom-container'
    )
  })
})
