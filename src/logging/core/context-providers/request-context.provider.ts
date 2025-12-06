/**
 * Request Context Provider
 * 
 * Automatically adds request context (requestId, userId, etc.) to logs.
 */
import { requestContextStore } from '../../../core/request-context.service'
import { IContextProvider, LogContext } from '../interfaces'

export class RequestContextProvider implements IContextProvider {
    getContext(): LogContext {
        const store = requestContextStore.getStore()
        if (!store) return {}
        return Object.fromEntries(store.entries())
    }
}
