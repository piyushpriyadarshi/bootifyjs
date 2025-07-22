import { ServerResponse } from 'http'
import { sendResponse } from './response.handler'
import { LoggerService } from '../logging/core/logger.service'
// import { loggingConfig } from '../logging/config/logging.config';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string = 'Resource not found') {
    super(404, message)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Unauthorized') {
    super(401, message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string = 'Forbidden') {
    super(403, message)
    this.name = 'ForbiddenError'
  }
}
// The res parameter is now 'any' to accept different response types
export function errorHandler(error: unknown, res: any): void {
  const logger = LoggerService.getInstance()
  // Check if headers have already been sent to prevent ERR_HTTP_HEADERS_SENT
  if (res.headersSent || (res.raw && res.raw.headersSent) || res.sent) {
    console.error('Cannot send error response - headers already sent:', error)
    return
  }

  if (error instanceof HttpError) {
    logger.warn(error.message, error)
    sendResponse(res, error.status, {
      error: error.message,
      status: error.status,
      timestamp: new Date().toISOString(),
    })
  } else if (error instanceof Error) {
    logger.error('Unhandled error', error)
    sendResponse(res, 500, {
      error: 'Internal Server Error',
      status: 500,
      timestamp: new Date().toISOString(),
    })
  } else {
    logger.error('Unknown error', error as Error)
    sendResponse(res, 500, {
      error: 'Internal Server Error',
      status: 500,
      timestamp: new Date().toISOString(),
    })
  }
}
