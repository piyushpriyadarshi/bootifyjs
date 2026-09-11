import { randomUUID } from 'crypto'
import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify'
import { RequestContextService } from '../core/request-context.service'

/**
 * Type definition for user-defined context extraction function
 */
export type ContextExtractor = (req: FastifyRequest, res: FastifyReply) => Record<string, any>

/**
 * Default context extractor that only sets basic framework defaults
 */
const defaultContextExtractor: ContextExtractor = (req: FastifyRequest, res: FastifyReply) => {
  return {
    // Add any default user info extraction logic here if needed
    // For now, returning empty object as user info extraction is application-specific
  }
}

export interface ContextMiddlewareOptions {
  /**
   * Reuse an incoming `x-request-id` header as the request's correlation id
   * (trace propagation across services) instead of always generating a new one.
   * Default: true.
   */
  trustIncomingRequestId?: boolean
}

/**
 * Creates a context middleware with optional user-defined context extraction
 * @param extractorOrOptions Optional extractor function and/or options
 */
export const createContextMiddleware = (
  extractorOrOptions?: ContextExtractor | ContextMiddlewareOptions,
  maybeOptions?: ContextMiddlewareOptions
) => {
  const extractor =
    typeof extractorOrOptions === 'function' ? extractorOrOptions : defaultContextExtractor
  const options: ContextMiddlewareOptions =
    (typeof extractorOrOptions === 'function' ? maybeOptions : extractorOrOptions) || {}
  const trustIncomingRequestId = options.trustIncomingRequestId !== false

  return (req: FastifyRequest, res: FastifyReply, done: HookHandlerDoneFunction) => {
    // Run the rest of the request lifecycle within a new context
    RequestContextService.run(() => {
      // Propagate an incoming trace id when present (cross-service tracing)
      const incoming =
        trustIncomingRequestId &&
        ((req.headers['x-request-id'] as string | undefined) ||
          (req.headers['X-Request-Id'] as string | undefined))
      const requestId = incoming || randomUUID()
      const contextService = new RequestContextService()

      // Set default framework context
      contextService.set('requestId', requestId)

      // Extract user-defined context
      const userContext = extractor(req, res)

      // Set user-defined context values
      Object.entries(userContext).forEach(([key, value]) => {
        contextService.set(key, value)
      })

      // Attach request ID to the request object
      ;(req as any).id = requestId

      // Attach headers
      res.header('X-Request-Id', requestId)

      done()
    })
  }
}

/**
 * Default context middleware for backward compatibility
 * This hook MUST be registered first. It creates a new AsyncLocalStorage
 * context for each request and populates it with request ID only.
 */
export const contextMiddleware = createContextMiddleware()

// Tracing functionality has been disabled
// Users can implement their own tracing if needed using the context extractor function
