import type { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { VERSION } from '../version'

export interface SwaggerFeatureOptions {
  /** Docs UI path. Default: `/docs`. */
  path?: string
  /** Default: `${serviceName} API`. */
  title?: string
  description?: string
  /** Default: the framework VERSION. */
  version?: string
  /** Add a bearerAuth security scheme (default: true when auth is enabled). */
  jwtSecurity?: boolean
  /** Hide the UI in production (still serves the JSON schema). Default: false. */
  hideUiInProduction?: boolean
}

export interface SwaggerFeature {
  path: string
  register(app: FastifyInstance): void
}

/**
 * Zero-config OpenAPI documentation. Route schemas come from `@Schema`
 * (zod → JSON schema) and `@Swagger` metadata — wired by the router — so
 * controllers document themselves.
 */
export function createSwaggerFeature(
  options: SwaggerFeatureOptions = {},
  context: { serviceName: string; authEnabled: boolean }
): SwaggerFeature {
  const path = (options.path ?? '/docs').startsWith('/')
    ? options.path ?? '/docs'
    : `/${options.path ?? '/docs'}`

  const title = options.title ?? `${context.serviceName} API`
  const version = options.version ?? VERSION
  const jwtSecurity = options.jwtSecurity ?? context.authEnabled

  // Awaiting the registration is REQUIRED: avvio eagerly boots the plugin,
  // attaching its onRoute hook before controller routes are added — otherwise
  // the spec captures no paths.
  const register = async (app: FastifyInstance) => {
    await app.register(swagger, {
      openapi: {
        info: {
          title,
          description: options.description ?? `API documentation for ${context.serviceName}`,
          version,
        },
        ...(jwtSecurity
          ? {
              components: {
                securitySchemes: {
                  bearerAuth: {
                    type: 'http' as const,
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                  },
                },
              },
              security: [{ bearerAuth: [] }],
            }
          : {}),
      },
    })

    const hideUi = options.hideUiInProduction && process.env.NODE_ENV === 'production'
    if (!hideUi) {
      await app.register(swaggerUi, {
        routePrefix: path,
      })
    }
  }

  return { path, register }
}
