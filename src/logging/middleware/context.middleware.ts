import { Middleware } from '../../core/middleware'
import { ResponseAdapter } from '../../core/response-adapter'
import { LogContextService, AppContext } from '../core/log-context.service'
import { LogContext } from '../types/logging.types'
import { LoggerService } from '../core/logger.service'

export const contextMiddleware: Middleware = async (req, res, next) => {
  console.log(res)
  const requestId = LogContextService.generateRequestId()
  const traceId = LogContextService.generateTraceId()

  const responseAdapter = new ResponseAdapter(res)
  responseAdapter.setHeader('x-request-id', requestId)

  const user = (req as any).user

  const logContext: LogContext = {
    requestId,
    traceId,
    spanId: LogContextService.generateSpanId(),
    userId: user?.id,
    username: user?.username,
    userAgent: req.headers['user-agent'],
    ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
    method: req.method,
    url: req.url,
    startTime: Date.now(),
  }

  const globalLogger = LoggerService.getInstance()
  const requestLogger = globalLogger.child({ requestId, traceId })

  const appContext: AppContext = {
    logContext,
    logger: requestLogger,
  }

  LogContextService.run(appContext, () => {
    next()
  })
}
