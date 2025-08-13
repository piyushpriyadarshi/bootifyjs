// src/middleware/tracing.middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify'
import { TracingService } from '../logging/core/tracing.service'
import { Logger } from '../logging/core/logger'

export class TracingMiddleware {
  constructor(private tracingService: TracingService, private logger: Logger) {}

  // Fastify plugin
  async register(fastify: any) {
    fastify.addHook('onRequest', this.onRequest.bind(this))
    fastify.addHook('onResponse', this.onResponse.bind(this))
    fastify.addHook('onError', this.onError.bind(this))
  }

  private async onRequest(request: FastifyRequest, reply: FastifyReply) {
    // Try to continue existing trace or start new one
    let traceContext = this.tracingService.continueTraceFromHeaders(
      request.headers as Record<string, string>
    )

    if (!traceContext) {
      // Start new trace
      const operationName = `${request.method} ${request.url}`
      traceContext = this.tracingService.startTrace(operationName)
    } else {
      // Update operation name for continued trace
      traceContext.operationName = `${request.method} ${request.url}`
    }

    // Add HTTP-specific tags
    this.tracingService.addTags({
      'http.method': request.method,
      'http.url': request.url,
      'http.user_agent': request.headers['user-agent'] || '',
      'http.remote_addr': request.ip,
    })

    // Store context in request
    ;(request as any).traceContext = traceContext

    // Run the rest of the request in trace context
    return this.tracingService.runWithContext(traceContext, async () => {
      // Continue with request processing
    })
  }

  private async onResponse(request: FastifyRequest, reply: FastifyReply) {
    const traceContext = (request as any).traceContext
    if (!traceContext) return

    // Add response tags
    this.tracingService.addTags({
      'http.status_code': reply.statusCode.toString(),
      'http.response_size': reply.getHeader('content-length')?.toString() || '0',
    })

    // Finish the span
    const status = reply.statusCode >= 400 ? 'error' : 'ok'
    this.tracingService.finishSpan(traceContext, status)
  }

  private async onError(request: FastifyRequest, reply: FastifyReply, error: Error) {
    const traceContext = (request as any).traceContext
    if (!traceContext) return

    // Add error tags
    this.tracingService.addTags({
      error: 'true',
      'error.type': error.constructor.name,
      'error.message': error.message,
    })

    // Finish span with error
    this.tracingService.finishSpan(traceContext, 'error', error)
  }
}
