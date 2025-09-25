// src/middleware/tracing.middleware.ts
import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'
// TracingService has been disabled
// import { TracingService } from '../logging/core/tracing.service'
// import { Logger } from '../logging/core/logger'
// import { RequestContextService } from '../core/request-context.service'

/**
 * Tracing middleware has been disabled.
 * This is a no-op middleware for backward compatibility.
 */
export class TracingMiddleware {
  // constructor(private tracingService: TracingService, private logger: Logger) {}

  // Fastify plugin
  async register(fastify: any) {
    // Tracing functionality has been disabled
    // If you need tracing, implement it using a custom solution
    // fastify.addHook('onRequest', this.onRequest.bind(this))
    // fastify.addHook('onResponse', this.onResponse.bind(this))
    // fastify.addHook('onError', this.onError.bind(this))
  }

  // private async onRequest(request: FastifyRequest, reply: FastifyReply) {
  //   // Tracing functionality disabled
  // }

  // private async onResponse(request: FastifyRequest, reply: FastifyReply) {
  //   // Tracing functionality disabled
  // }

  // private async onError(request: FastifyRequest, reply: FastifyReply, error: Error) {
  //   // Tracing functionality disabled
  // }
}

/**
 * Tracing middleware has been disabled.
 * This is a no-op middleware for backward compatibility.
 * Users can implement their own tracing using the context extractor function.
 */
export const tracingMiddleware = (
  req: FastifyRequest,
  res: FastifyReply,
  done: HookHandlerDoneFunction
) => {
  // Tracing functionality has been disabled
  // If you need tracing, implement it using the context extractor function
  // in the context middleware
  done()
}
