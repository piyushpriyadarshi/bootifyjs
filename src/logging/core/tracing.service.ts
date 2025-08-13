import { Autowired, Service } from '../../core'
import { RequestContextService } from '../../core/request-context.service'
import { Logger } from './logger'

export interface TraceContext {
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

export interface SpanOptions {
  operationName: string
  parentSpanId?: string
  tags?: Record<string, string>
  startTime?: Date
}

@Service()
export class TracingService {
  private serviceName = 'bootify-service'
  @Autowired(Logger)
  private logger!: Logger

  // Get current trace context from request context
  getCurrentContext(): TraceContext | undefined {
    const contextService = new RequestContextService()
    return contextService.get<TraceContext>('_traceContext')
  }

  // Create child span
  createChildSpan(operationName: string, options: Partial<SpanOptions> = {}): TraceContext {
    const parentContext = this.getCurrentContext()
    if (!parentContext) {
      throw new Error(
        'No active trace context found. Ensure context middleware is registered first.'
      )
    }

    const spanId = this.generateId()
    const startTime = options.startTime || new Date()
    const contextService = new RequestContextService()

    const context: TraceContext = {
      ...parentContext,
      spanId,
      parentSpanId: parentContext.spanId,
      operationName,
      startTime,
      tags: { ...parentContext.tags, ...options.tags },
    }

    // Update context with new span
    contextService.set('spanId', context.spanId)
    contextService.set('parentSpanId', context.parentSpanId)
    contextService.set('operationName', context.operationName)
    contextService.set('startTime', context.startTime.toISOString())
    contextService.set('_traceContext', context)

    // Log span start
    this.logger.info('span.start', {
      traceId: context.traceId,
      spanId,
      parentSpanId: context.parentSpanId,
      operationName,
      serviceName: this.serviceName,
      startTime: startTime.toISOString(),
    })

    return context
  }

  // Finish span
  finishSpan(context?: TraceContext, status: 'ok' | 'error' = 'ok', error?: Error): void {
    const traceContext = context || this.getCurrentContext()
    if (!traceContext) return

    const endTime = new Date()
    const duration = endTime.getTime() - traceContext.startTime.getTime()

    // Log to application_logs
    this.logger.info('span.end', {
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      parentSpanId: traceContext.parentSpanId,
      operationName: traceContext.operationName,
      serviceName: traceContext.serviceName,
      duration: duration * 1000, // convert to microseconds
      status,
      error: error?.message,
    })

    // // Also insert into spans table
    // this.insertSpan({
    //   traceId: traceContext.traceId,
    //   spanId: traceContext.spanId,
    //   parentSpanId: traceContext.parentSpanId,
    //   operationName: traceContext.operationName,
    //   serviceName: traceContext.serviceName,
    //   startTime: traceContext.startTime,
    //   endTime,
    //   duration: duration * 1000,
    //   status,
    //   requestId: traceContext.requestId,
    //   tags: traceContext.tags,
    //   events: [],
    //   error: error?.message,
    // })
    this.logger.span({
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      parentSpanId: traceContext.parentSpanId,
      operationName: traceContext.operationName,
      serviceName: traceContext.serviceName,
      startTime: traceContext.startTime,
      endTime,
      duration: duration * 1000, // microseconds
      status,
      statusCode: status === 'error' ? 500 : 200,
      requestId: traceContext.requestId,
      // tags: traceContext.tags,
      // baggage: traceContext.baggage,
      error: error?.message,
    })
  }

  // Add tags to current span
  addTags(tags: Record<string, string>): void {
    const context = this.getCurrentContext()
    if (context) {
      Object.assign(context.tags, tags)
      const contextService = new RequestContextService()
      contextService.set('_traceContext', context)
    }
  }

  // Add baggage (cross-service context)
  setBaggage(key: string, value: string): void {
    const context = this.getCurrentContext()
    if (context) {
      context.baggage[key] = value
      const contextService = new RequestContextService()
      contextService.set('_traceContext', context)
    }
  }

  // Get trace headers for HTTP propagation
  getTraceHeaders(): Record<string, string> {
    const context = this.getCurrentContext()
    if (!context) return {}

    return {
      'x-trace-id': context.traceId,
      'x-span-id': context.spanId,
      'x-request-id': context.requestId,
      'x-baggage': JSON.stringify(context.baggage),
    }
  }

  // Span logging methods
  spanStart(operationName: string, tags?: Record<string, string>): TraceContext {
    return this.createChildSpan(operationName, { tags })
  }

  spanEnd(context?: TraceContext, status: 'ok' | 'error' = 'ok', error?: Error): void {
    this.finishSpan(context, status, error)
  }

  private generateId(): string {
    return require('crypto').randomUUID().replace(/-/g, '')
  }

  private async insertSpan(span: any): Promise<void> {
    // Insert into ClickHouse spans table
    console.log('span', span)
  }
}
