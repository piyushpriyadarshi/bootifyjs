import type { ZodIssue } from 'zod'

/**
 * Base error class for all framework errors.
 *
 * Library code must never call `process.exit()` — throw a typed error and let
 * the host application decide how to fail.
 */
export class BootifyError extends Error {
  readonly code: string

  constructor(message: string, code = 'BOOTIFY_ERROR') {
    super(message)
    this.name = new.target.name
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

/** Thrown when a lifecycle method is called in an invalid state (e.g. double build). */
export class BootifyStateError extends BootifyError {
  constructor(message: string) {
    super(message, 'BOOTIFY_STATE')
  }
}

/** Thrown when the application fails to start (e.g. port already in use). */
export class BootifyStartError extends BootifyError {
  constructor(message: string, readonly cause?: unknown) {
    super(message, 'BOOTIFY_START')
  }
}

/**
 * Error carrying an HTTP status. Throw it from controllers/handlers and the
 * default error handler maps it to the status code automatically.
 */
export class HttpError extends BootifyError {
  readonly status: number

  constructor(status: number, message: string, code = 'HTTP_ERROR') {
    super(message, code)
    this.status = status
  }
}

/** Validation failure for a route payload — mapped to HTTP 400. */
export class RouteValidationError extends HttpError {
  readonly issues: ZodIssue[]

  constructor(message = 'Validation failed', issues: ZodIssue[] = []) {
    super(400, message, 'ROUTE_VALIDATION')
    this.issues = issues
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN')
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not Found') {
    super(404, message, 'NOT_FOUND')
  }
}

// --- DI errors ---

export class ServiceNotFoundError extends BootifyError {
  constructor(token: string) {
    super(`[DI] Service with token '${token}' is not registered.`, 'DI_SERVICE_NOT_FOUND')
  }
}

export class CircularDependencyError extends BootifyError {
  constructor(token: string) {
    super(`[DI] Circular dependency detected for token '${token}'.`, 'DI_CIRCULAR')
  }
}

export class InvalidRegistrationError extends BootifyError {
  constructor(message: string) {
    super(message, 'DI_INVALID_REGISTRATION')
  }
}

/** A constructor parameter resolved to `Object` (interface/untyped) without @Autowired. */
export class InterfaceTokenError extends BootifyError {
  constructor(message: string) {
    super(message, 'DI_INTERFACE_TOKEN')
  }
}
