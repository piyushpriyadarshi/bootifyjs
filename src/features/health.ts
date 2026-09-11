import type { FastifyInstance } from 'fastify'
import { VERSION } from '../version'
import { CACHE_STORE_TOKEN } from '../cache/cache.types'
import type { Container } from '../core/di-container'

export interface HealthCheckOptions {
  /** Liveness path. Default: `/health`. */
  path?: string
  /** Optional readiness path (includes dependency checks). Default: none. */
  readinessPath?: string
  /** Ping the bound ICacheStore (500ms timeout) on readiness checks. Default: true. */
  includeCache?: boolean
}

const DEFAULTS: Required<Omit<HealthCheckOptions, 'readinessPath'>> = {
  path: '/health',
  includeCache: true,
}

export interface HealthCheckFeature {
  path: string
  readinessPath?: string
  register(app: FastifyInstance, container: Container): void
}

/**
 * Actuator-style health endpoints.
 * - Liveness (`/health`): always 200 while the process is up.
 * - Readiness (`/ready`): 200 when dependencies are healthy, 503 otherwise.
 */
export function createHealthCheckFeature(
  options: HealthCheckOptions = {},
  context: { serviceName?: string } = {}
): HealthCheckFeature {
  const config = { ...DEFAULTS, ...options }
  const path = config.path.startsWith('/') ? config.path : `/${config.path}`

  async function probeCache(container: Container): Promise<boolean | undefined> {
    if (!config.includeCache || !container.isRegistered(CACHE_STORE_TOKEN)) {
      return undefined
    }
    try {
      const store = container.resolve<any>(CACHE_STORE_TOKEN)
      if (typeof store?.healthCheck !== 'function') return undefined
      const healthy = await Promise.race([
        store.healthCheck(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 500)),
      ])
      return healthy === true
    } catch {
      return false
    }
  }

  function basePayload() {
    return {
      status: 'ok' as const,
      service: context.serviceName || process.env.SERVICE_NAME || 'bootify-app',
      version: VERSION,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    }
  }

  return {
    path,
    readinessPath: options.readinessPath,
    register(app, container) {
      app.get(path, { config: { authPublic: true }, schema: { tags: ['System'], summary: 'Liveness probe' } }, async () => basePayload())

      if (options.readinessPath) {
        const readyPath = options.readinessPath.startsWith('/')
          ? options.readinessPath
          : `/${options.readinessPath}`

        app.get(readyPath, { config: { authPublic: true }, schema: { tags: ['System'], summary: 'Readiness probe (dependency checks)' } }, async (_request, reply) => {
          const cache = await probeCache(container)
          const checks: Record<string, boolean> = {}
          if (cache !== undefined) checks.cache = cache

          const degraded = Object.values(checks).some((healthy) => healthy === false)
          if (degraded) {
            return reply.status(503).send({
              ...basePayload(),
              status: 'degraded',
              checks,
            })
          }

          return { ...basePayload(), checks }
        })
      }
    },
  }
}
