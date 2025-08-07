import { AsyncLocalStorage } from 'async_hooks'
import { Service } from './decorators'

// The actual storage instance. It's created once and exported.
export const requestContextStore = new AsyncLocalStorage<Map<string, any>>()

@Service()
export class RequestContextService {
  /**
   * Retrieves a value from the request context by key.
   * @param key The key of the value to retrieve.
   * @returns The value, or undefined if not found.
   */
  get<T = any>(key: string): T | undefined {
    const store = requestContextStore.getStore()
    return store?.get(key)
  }

  /**
   * Sets a value in the request context.
   * @param key The key of the value to set.
   * @param value The value to set.
   */
  set(key: string, value: any): void {
    const store = requestContextStore.getStore()
    if (store) {
      store.set(key, value)
    }
  }
  store() {
    return requestContextStore.getStore()
  }

  /**
   * A static method to run a function within a new request context.
   * This is the entry point used by our framework middleware.
   * @param callback The function to execute within the new context.
   */
  static run(callback: () => void) {
    const store = new Map<string, any>()
    requestContextStore.run(store, callback)
  }
}
