import { ServerResponse } from 'http';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string = 'Resource not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export function errorHandler(error: unknown, res: ServerResponse): void {
  // Check if headers have already been sent to prevent ERR_HTTP_HEADERS_SENT
  if (res.headersSent) {
    console.error('Cannot send error response - headers already sent:', error);
    return;
  }

  if (error instanceof HttpError) {
    res.writeHead(error.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: error.message,
      status: error.status,
      timestamp: new Date().toISOString()
    }));
  } else if (error instanceof Error) {
    console.error('Unhandled error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      status: 500,
      timestamp: new Date().toISOString()
    }));
  } else {
    console.error('Unknown error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Internal Server Error',
      status: 500,
      timestamp: new Date().toISOString()
    }));
  }
}