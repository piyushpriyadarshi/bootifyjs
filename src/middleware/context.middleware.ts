import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'
import { randomUUID } from 'crypto'
import { RequestContextService } from '../core/request-context.service'

/**
 * This hook MUST be registered first. It creates a new AsyncLocalStorage
 * context for each request and populates it with request ID and trace context.
 */
export const contextMiddleware = (
  req: FastifyRequest,
  res: FastifyReply,
  done: HookHandlerDoneFunction
) => {
  // Run the rest of the request lifecycle within a new context
  RequestContextService.run(() => {
    const requestId = randomUUID()
    const contextService = new RequestContextService()

    // Set the request ID in the context
    contextService.set('requestId', requestId)

    // Initialize trace context
    const traceContext = initializeTraceContext(req, requestId)

    // Store trace context in request context for pino mixin
    contextService.set('traceId', traceContext.traceId)
    contextService.set('spanId', traceContext.spanId)
    contextService.set('parentSpanId', traceContext.parentSpanId)
    contextService.set('operationName', traceContext.operationName)
    contextService.set('serviceName', traceContext.serviceName)
    contextService.set('startTime', traceContext.startTime.toISOString())

    // Store full trace context for middleware access
    contextService.set('_traceContext', traceContext)

    // Attach IDs to the request object
    ;(req as any).id = requestId
    ;(req as any).traceId = traceContext.traceId

    // Attach headers
    res.header('X-Request-Id', requestId)
    res.header('X-Trace-Id', traceContext.traceId)

    done()
  })
}

interface TraceContext {
  traceId: string
  spanId: string
  parentSpanId?: string
  requestId: string
  serviceName: string
  operationName: string
  startTime: Date
  tags: Record<string, string>
  baggage: Record<string, string>
}

function initializeTraceContext(req: FastifyRequest, requestId: string): TraceContext {
  const serviceName = process.env.SERVICE_NAME || 'bootify-service'
  const operationName = `${req.method} ${req.url}`

  // Try to continue existing trace from headers
  const incomingTraceId = req.headers['x-trace-id'] as string
  const incomingSpanId = req.headers['x-span-id'] as string
  const incomingBaggage = req.headers['x-baggage'] as string

  let traceId: string
  let parentSpanId: string | undefined
  let baggage: Record<string, string> = {}

  if (incomingTraceId) {
    // Continue existing trace
    traceId = incomingTraceId
    parentSpanId = incomingSpanId
    if (incomingBaggage) {
      try {
        baggage = JSON.parse(incomingBaggage)
      } catch {
        baggage = {}
      }
    }
  } else {
    // Start new trace
    traceId = generateId()
  }

  const spanId = generateId()
  const startTime = new Date()

  const traceContext: TraceContext = {
    traceId,
    spanId,
    parentSpanId,
    requestId,
    serviceName,
    operationName,
    startTime,
    tags: {
      'http.method': req.method,
      'http.url': req.url,
      'http.user_agent': req.headers['user-agent'] || '',
      'http.remote_addr': req.ip,
    },
    baggage,
  }

  return traceContext
}

function generateId(): string {
  return randomUUID().replace(/-/g, '')
}
