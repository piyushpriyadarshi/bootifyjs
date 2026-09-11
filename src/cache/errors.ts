import { BootifyError } from '../core/errors'

/** Base class for cache-related failures. */
export class CacheError extends BootifyError {
  constructor(message: string, code = 'CACHE_ERROR') {
    super(message, code)
  }
}

/** Thrown when a cache backend cannot be reached or initialized. */
export class CacheConnectionError extends CacheError {
  constructor(message: string) {
    super(message, 'CACHE_CONNECTION')
  }
}
