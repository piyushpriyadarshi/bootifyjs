import { AsyncLocalStorage } from 'async_hooks'
// import { FastifyRequest } from 'fastify'

export interface LogContext {
  requestId: string
  userId?: string
  traceId?: string
  username?: string
  additionalContext?: { [key: string]: any } // Additional context data
}

export const requestContext = new AsyncLocalStorage<LogContext>()
