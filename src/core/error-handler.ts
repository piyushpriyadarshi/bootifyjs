import type { FastifyError } from 'fastify'
import { ZodError } from 'zod'
import { BootifyError, HttpError } from './errors'

const STATUS_PHRASES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
}

/**
 * Framework default error handler:
 * - ZodError / Fastify validation errors -> 400 with issue details
 * - HttpError (and subclasses) -> its status
 * - other BootifyError -> 500 with the error `code`
 * - unknown -> 500 (message hidden in production)
 *
 * Override with `.useErrorHandler()`.
 */
export function defaultErrorHandler(
  error: FastifyError | Error,
  _request: unknown,
  reply: { status: (code: number) => { send: (payload: unknown) => unknown } }
): void {
  if (error instanceof ZodError) {
    reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues: error.issues,
    })
    return
  }

  const validation = (error as FastifyError).validation
  if (validation) {
    reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues: validation,
    })
    return
  }

  // Fastify convention: errors may carry a numeric statusCode
  const declaredStatus = (error as { statusCode?: number }).statusCode
  if (typeof declaredStatus === 'number' && declaredStatus >= 400 && declaredStatus < 600) {
    const isProduction = process.env.NODE_ENV === 'production'
    reply.status(declaredStatus).send({
      statusCode: declaredStatus,
      error: STATUS_PHRASES[declaredStatus] ?? 'Error',
      message: isProduction && declaredStatus === 500 ? 'Internal Server Error' : error.message,
    })
    return
  }

  if (error instanceof BootifyError) {
    const status = error instanceof HttpError ? error.status : 500
    reply.status(status).send({
      statusCode: status,
      error: STATUS_PHRASES[status] ?? 'Error',
      message: error.message,
      code: error.code,
    })
    return
  }

  const isProduction = process.env.NODE_ENV === 'production'
  reply.status(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message: isProduction ? 'Internal Server Error' : error.message,
  })
}
