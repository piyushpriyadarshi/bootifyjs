import { BootifyApp } from '../BootifyApp'
import { defineConfig } from '../config/AppConfig'
import { createContainer, container as globalContainer } from '../core/di-container'
import type { Container } from '../core/di-container'
import type { FastifyInstance } from 'fastify'

export interface CreateTestAppOptions {
  controllers?: any[]
  /** Register additional setup on the app before build. */
  setup?: (app: BootifyApp, container: Container) => void
  /** Silence all framework output (default: true). */
  silent?: boolean
  /**
   * Mirror every component registered in the global container (via
   * `@Service`/`@Repository`/`@Controller`) into the isolated container so
   * constructor dependencies resolve with fresh per-app singletons.
   * Default: true. Token-based registrations (symbols) are NOT mirrored —
   * register them in `setup`.
   */
  mirrorGlobalComponents?: boolean
}

export interface TestApp {
  /** The underlying Fastify instance — use `.inject()` in tests, never listen(). */
  handle: FastifyInstance
  container: Container
  app: BootifyApp
  inject: FastifyInstance['inject']
  close: () => Promise<void>
}

/**
 * Build a BootifyApp preconfigured for tests:
 * - isolated DI container (optionally mirroring global components)
 * - silent logging and startup banner
 * - scheduler disabled
 * - no process signal handlers
 *
 * @example
 * const testApp = await createTestApp({ controllers: [TodoController] })
 * const res = await testApp.inject({ method: 'GET', url: '/todos' })
 * expect(res.statusCode).toBe(200)
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  // Must be set BEFORE the BootifyApp constructor captures its quiet flag.
  if (options.silent !== false) {
    process.env.LOG_BANNER = 'false'
    process.env.CONFIG_DEBUG = 'false'
  }

  const container = createContainer()

  if (options.mirrorGlobalComponents !== false) {
    for (const component of globalContainer.getRegisteredComponents()) {
      container.register(component, { useClass: component, override: true })
    }
  }

  const app = new BootifyApp({ container })
    .setServiceName('bootify-test')
    .useScheduler(false)
    .useConfig(defineConfig({}))

  if (options.controllers?.length) {
    app.useControllers(options.controllers as any)
  }

  options.setup?.(app, container)

  // Controllers decorated with @Controller are registered into the container
  // they were imported against (the global one). Mirror those registrations
  // into the isolated container so resolution works there too.
  for (const controller of options.controllers ?? []) {
    if (!container.isRegistered(controller)) {
      container.register(controller, { useClass: controller, override: true })
    }
  }

  const built = await app.build()

  return {
    handle: built.handle,
    container,
    app: built,
    inject: (built.handle as any).inject.bind(built.handle),
    close: () => built.close(),
  }
}
