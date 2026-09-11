import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Controller, Get, Post, Body, Schema, UseMiddleware } from '../../src/core/decorators'
import { HttpError, NotFoundError, UnauthorizedError, BootifyStateError } from '../../src/core/errors'
import { createTestApp } from '../../src/testing'
import type { TestApp } from '../../src/testing'

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn()
  cleanup.length = 0
})

async function makeApp(setup?: Parameters<typeof createTestApp>[0]) {
  const testApp = await createTestApp(setup)
  cleanup.push(() => testApp.close())
  return testApp
}

@Controller('/hello')
class HelloController {
  @Get('/')
  hello() {
    return { message: 'Hello from BootifyJS!' }
  }

  @Get('/error-not-found')
  notFound() {
    throw new NotFoundError('todo 42 does not exist')
  }

  @Get('/error-unauthorized')
  unauthorized() {
    throw new UnauthorizedError()
  }

  @Get('/error-http')
  httpError() {
    throw new HttpError(418, "I'm a teapot")
  }

  @Get('/error-unknown')
  unknownError() {
    throw new Error('internal details leaked?')
  }

  @Post('/echo')
  @Schema({ body: z.object({ name: z.string().min(2) }) })
  echo(@Body() body: any) {
    return { received: body }
  }
}

describe('BootifyApp integration (app.inject, no listen)', () => {
  it('serves a controller route end to end', async () => {
    const app = await makeApp({ controllers: [HelloController] })
    const res = await app.inject({ method: 'GET', url: '/hello' })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ message: 'Hello from BootifyJS!' })
  })

  it('combines group prefix + controller prefix + method path', async () => {
    const app = await createTestApp({ controllers: [HelloController] })
    cleanup.push(() => app.close())

    const bootifyApp = await createTestApp({
      controllers: [HelloController],
      setup: (a) => a.setBasePrefix('/api/v1'),
    })
    cleanup.push(() => bootifyApp.close())

    const res = await bootifyApp.inject({ method: 'GET', url: '/api/v1/hello' })
    expect(res.statusCode).toBe(200)
  })

  it('validates payloads and returns 400 with issue details', async () => {
    const app = await makeApp({ controllers: [HelloController] })

    const bad = await app.inject({
      method: 'POST',
      url: '/hello/echo',
      payload: { name: 'x' }, // too short
    })
    expect(bad.statusCode).toBe(400)
    const body = bad.json()
    expect(body.message).toContain('Validation failed')
    expect(JSON.stringify(body.issues)).toContain('name')

    const good = await app.inject({
      method: 'POST',
      url: '/hello/echo',
      payload: { name: 'Piyush' },
    })
    expect(good.statusCode).toBe(200)
    expect(good.json()).toEqual({ received: { name: 'Piyush' } })
  })

  it('maps typed BootifyErrors to their HTTP status via the default handler', async () => {
    const app = await makeApp({ controllers: [HelloController] })

    const notFound = await app.inject({ method: 'GET', url: '/hello/error-not-found' })
    expect(notFound.statusCode).toBe(404)
    expect(notFound.json()).toMatchObject({ code: 'NOT_FOUND', message: 'todo 42 does not exist' })

    const unauthorized = await app.inject({ method: 'GET', url: '/hello/error-unauthorized' })
    expect(unauthorized.statusCode).toBe(401)

    const teapot = await app.inject({ method: 'GET', url: '/hello/error-http' })
    expect(teapot.statusCode).toBe(418)
  })

  it('hides unknown error details in production, shows them otherwise', async () => {
    const previous = process.env.NODE_ENV

    process.env.NODE_ENV = 'production'
    const prodApp = await makeApp({ controllers: [HelloController] })
    const prodRes = await prodApp.inject({ method: 'GET', url: '/hello/error-unknown' })
    expect(prodRes.statusCode).toBe(500)
    expect(prodRes.json().message).toBe('Internal Server Error')

    process.env.NODE_ENV = 'test'
    const devApp = await makeApp({ controllers: [HelloController] })
    const devRes = await devApp.inject({ method: 'GET', url: '/hello/error-unknown' })
    expect(devRes.json().message).toBe('internal details leaked?')

    process.env.NODE_ENV = previous
  })

  it('supports custom error handlers via useErrorHandler', async () => {
    const app = await makeApp({
      controllers: [HelloController],
      setup: (a) =>
        a.useErrorHandler((error: any, _req, reply) => {
          reply.status(599).send({ custom: true, message: error.message })
        }),
    })

    const res = await app.inject({ method: 'GET', url: '/hello/error-not-found' })
    expect(res.statusCode).toBe(599)
    expect(res.json()).toEqual({ custom: true, message: 'todo 42 does not exist' })
  })

  it('runs global middleware in registration order', async () => {
    const order: string[] = []

    const app = await makeApp({
      controllers: [HelloController],
      setup: (a) => {
        a.useMiddleware(async () => {
          order.push('first')
        })
        a.useMiddleware(async () => {
          order.push('second')
        })
      },
    })

    await app.inject({ method: 'GET', url: '/hello' })
    expect(order).toEqual(['first', 'second'])
  })

  it('resolves controller dependencies from the isolated test container', async () => {
    const greet = vi.fn().mockReturnValue('hi from service')

    class GreetService {
      greet() {
        return greet()
      }
    }

    @Controller('/greeter')
    class GreeterController {
      constructor(public svc: GreetService) {}

      @Get('/')
      greet() {
        return { text: this.svc.greet() }
      }
    }

    const app = await makeApp({
      controllers: [GreeterController],
      setup: (_a, container) => {
        container.register(GreetService, { useClass: GreetService })
      },
    })

    const res = await app.inject({ method: 'GET', url: '/greeter' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ text: 'hi from service' })
  })

  it('provides an isolated container per test app', async () => {
    const a = await makeApp({ controllers: [HelloController] })
    const b = await makeApp({ controllers: [HelloController] })

    expect(a.container).not.toBe(b.container)
    expect(a.handle).not.toBe(b.handle)
  })

  it('app.useConfig pairs with app.config accessor', async () => {
    const app = await makeApp({
      setup: (a) =>
        a.useConfig(
          z.object({
            SERVER_PORT: z.coerce.number().default(1234),
          })
        ),
    })

    expect(app.app.config.get('SERVER_PORT')).toBe(1234)
  })
})

describe('BootifyApp lifecycle guards', () => {
  it('throws BootifyStateError on double build', async () => {
    const { BootifyApp: App, createBootifyApp } = await import('../../src/BootifyApp')
    const application = createBootifyApp({ container: (await import('../../src/core/di-container')).createContainer() })
      .useScheduler(false)
      .useLogger((b) => b.disableConsole())
    process.env.LOG_BANNER = 'false'

    await application.build()
    await expect(application.build()).rejects.toThrow(BootifyStateError)
  })

  it('start() failure throws BootifyStartError (occupied port), never process.exit', async () => {
    const { createBootifyApp } = await import('../../src/BootifyApp')
    const { createContainer } = await import('../../src/core/di-container')

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any)

    const blocker = createBootifyApp({ container: createContainer() })
      .setPort(0) // ephemeral — but two servers on the SAME port collide
      .useScheduler(false)
      .useLogger((b) => b.disableConsole())
    await blocker.build()
    await blocker.start()
    cleanup.push(() => blocker.close())

    const port = (blocker.handle as any).server?.address()?.port
    const second = createBootifyApp({ container: createContainer() })
      .setPort(port)
      .useScheduler(false)
      .useLogger((b) => b.disableConsole())
    await second.build()

    await expect(second.start()).rejects.toThrow(/Failed to start application/)
    expect(exitSpy).not.toHaveBeenCalled()

    exitSpy.mockRestore()
  })

  it('close() removes the registered signal handlers', async () => {
    const { createBootifyApp } = await import('../../src/BootifyApp')
    const { createContainer } = await import('../../src/core/di-container')

    process.env.LOG_BANNER = 'false'
    const before = process.listenerCount('SIGTERM')

    const application = createBootifyApp({ container: createContainer() })
      .setPort(0) // ephemeral — never collide with a locally running dev server
      .useScheduler(false)
      .useLogger((b) => b.disableConsole())
    await application.build()
    await application.start()
    expect(process.listenerCount('SIGTERM')).toBe(before + 1)

    await application.close()
    expect(process.listenerCount('SIGTERM')).toBe(before)
  })

  it('scheduler stays undefined when disabled via createTestApp', async () => {
    const app = await makeApp({ controllers: [HelloController] })
    expect(app.app.scheduler).toBeUndefined()
  })
})
