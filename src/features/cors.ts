import type { FastifyCorsOptions } from '@fastify/cors'

export interface CorsFeatureOptions extends FastifyCorsOptions {}

export const DEFAULT_CORS_OPTIONS: CorsFeatureOptions = {
  origin: true, // reflect the request origin (dev-friendly)
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
}

export interface CorsFeature {
  options: CorsFeatureOptions
}

/**
 * CORS feature factory. In production, a reflective (`origin: true`) policy
 * without an explicit allow-list triggers a loud warning — the framework
 * never blocks, because many deployments terminate CORS at a proxy.
 */
export function createCorsFeature(options: CorsFeatureOptions = {}): CorsFeature {
  const merged = { ...DEFAULT_CORS_OPTIONS, ...options }

  if (process.env.NODE_ENV === 'production' && merged.origin === true) {
    console.warn(
      '[bootify] CORS is reflecting any origin in PRODUCTION. ' +
        'Pass an explicit allow-list: .enableCors({ origin: ["https://your-app.com"] }) ' +
        '— or terminate CORS at your proxy and call .disableCors().'
    )
  }

  return { options: merged }
}
