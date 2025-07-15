import { Middleware } from '../../core/middleware';
import { LogContextService } from '../core/log-context.service';
import { LogContext } from '../types/logging.types';

export const contextMiddleware: Middleware = async (req, res, next) => {
  const requestId = LogContextService.generateRequestId();
  const traceId = LogContextService.generateTraceId();
  
  // Set response header
  res.setHeader('x-request-id', requestId);
  
  // Extract user info if available (from auth middleware)
  const user = (req as any).user;
  
  const context: LogContext = {
    requestId,
    traceId,
    spanId: LogContextService.generateSpanId(),
    userId: user?.id,
    username: user?.username,
    userAgent: req.headers['user-agent'],
    ip: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress,
    method: req.method,
    url: req.url,
    startTime: Date.now()
  };

  LogContextService.run(context, async () => {
    await next();
  });
};