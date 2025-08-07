import { FastifyRequest, FastifyReply, HookHandlerDoneFunction, } from 'fastify';
import { randomUUID } from 'crypto';
import { RequestContextService } from '../core/request-context.service';

/**
 * This hook MUST be registered first. It creates a new AsyncLocalStorage
 * context for each request and populates it with a unique request ID.
 */
export const contextMiddleware = (
    req: FastifyRequest,
    res: FastifyReply,
    done: HookHandlerDoneFunction
) => {
    // Run the rest of the request lifecycle within a new context
    RequestContextService.run(() => {
        const requestId = randomUUID();
        const contextService = new RequestContextService();

        // Set the request ID in the context for access anywhere in the app
        contextService.set('requestId', requestId);

        // Attach ID to the request object for easy access in other hooks/plugins
        (req as any).id = requestId;

        // Attach ID to the response header for client-side tracing
        res.header('X-Request-Id', requestId);

        done();
    });
};