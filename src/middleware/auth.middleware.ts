import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

/**
 * Simple in-memory cache for verified tokens. Swap with a distributed cache
 * (e.g. Redis) in multi-instance production setups via `createAuthMiddleware`.
 */
export class TokenCache {
    private cache = new Map<string, any>();
    private timers = new Map<string, NodeJS.Timeout>();

    set(key: string, value: any, expiresInSeconds: number): void {
        this.cache.set(key, value);

        // Clear existing timer if any
        const existingTimer = this.timers.get(key);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new expiration timer
        const timer = setTimeout(() => {
            this.cache.delete(key);
            this.timers.delete(key);
        }, expiresInSeconds * 1000);

        this.timers.set(key, timer);
    }

    get(key: string): any {
        return this.cache.get(key);
    }

    has(key: string): boolean {
        return this.cache.has(key);
    }

    delete(key: string): void {
        this.cache.delete(key);
        const timer = this.timers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(key);
        }
    }

    /** Remove all entries and timers (tests / shutdown). */
    clear(): void {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.cache.clear();
        this.timers.clear();
    }
}

const tokenCache = new TokenCache();

export interface AuthMiddlewareOptions {
    /** JWT secret used to verify tokens. */
    secret: string;
    /** Provide a custom/shared token cache. Defaults to a module-level instance. */
    tokenCache?: TokenCache;
    /** Full override: extract the raw token from the request yourself.
     *  Default: `Authorization: Bearer <token>` header. */
    tokenExtractor?: (request: FastifyRequest) => string | undefined;
    /** Sugar: fall back to this cookie when the header is absent
     *  (requires @fastify/cookie to be registered). */
    cookieName?: string;
}

const verifyJwtToken = async ({ token, tokenSecret }: { token: string; tokenSecret: string }) => {
    const decoded = jwt.verify(token, tokenSecret);
    return decoded;
};

/**
 * Authentication middleware factory.
 *
 * - No Authorization header → request proceeds unauthenticated (`authenticated: false`)
 * - Valid token → `request.user` is the verified payload, `authenticated: true`
 * - Invalid/expired token → `authenticated: false`, `user: null`
 *
 * Verified tokens are cached in the (optionally injected) TokenCache until expiry.
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
    const cache = options.tokenCache ?? tokenCache;

    return async function (request: FastifyRequest, _reply: FastifyReply) {
        const accessToken =
            options.tokenExtractor?.(request) ??
            request.headers.Authorization ??
            request.headers.authorization ??
            (options.cookieName ? (request as any).cookies?.[options.cookieName] : undefined);

        if (!accessToken) {
            (request as any).authenticated = false;
            return;
        }

        // Remove 'Bearer ' prefix if present
        const token = String(accessToken).replace(/^Bearer\s+/i, '');

        // Check cache first
        const cachedToken = cache.get(`token:${token}`);
        if (cachedToken) {
            (request as any).user = cachedToken;
            (request as any).authenticated = true;
            return;
        }

        try {
            const verifiedToken = await verifyJwtToken({ token, tokenSecret: options.secret });

            // Calculate expiration time
            const expiresIn = (verifiedToken as any).exp
                ? (verifiedToken as any).exp - Math.floor(Date.now() / 1000)
                : 3600; // Default 1 hour

            // Cache the verified token
            if (expiresIn > 0) {
                cache.set(`token:${token}`, verifiedToken, expiresIn);
            }

            (request as any).user = verifiedToken;
            (request as any).authenticated = true;
        } catch {
            (request as any).authenticated = false;
            (request as any).user = null;
        }
    };
}

/**
 * Authentication middleware factory (back-compat signature).
 * @param tokenSecret JWT secret for token verification
 */
export function authenticate(tokenSecret: string) {
    return createAuthMiddleware({ secret: tokenSecret });
}

export default authenticate;
