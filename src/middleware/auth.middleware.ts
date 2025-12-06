import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

// Simple in-memory cache for demonstration (replace with Redis in production)
class TokenCache {
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

    delete(key: string): void {
        this.cache.delete(key);
        const timer = this.timers.get(key);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(key);
        }
    }
}

const tokenCache = new TokenCache();

// JWT verification function
const verifyJwtToken = async ({ token, tokenSecret }: { token: string; tokenSecret: string }) => {
    try {
        const decoded = jwt.verify(token, tokenSecret) as any;
        return decoded;
    } catch (error) {
        throw new Error('Invalid token');
    }
};

/**
 * Authentication middleware factory
 * @param tokenSecret JWT secret for token verification
 * @returns Fastify middleware function
 */
export function authenticate(tokenSecret: string) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
        try {
            const accessToken =
                request.headers.Authorization || request.headers.authorization;

            if (!accessToken) {
                (request as any).authenticated = false;
                return;
            }

            // Remove 'Bearer ' prefix if present
            const token = String(accessToken).replace(/^Bearer\s+/i, '');

            // Check cache first
            const cachedToken = tokenCache.get(`token:${token}`);

            if (cachedToken) {
                (request as any).user = cachedToken;
                (request as any).authenticated = true;
                return;
            }

            // Verify token if not in cache
            try {
                const verifiedToken = await verifyJwtToken({
                    token,
                    tokenSecret
                });

                // Calculate expiration time
                const expiresIn = verifiedToken.exp
                    ? verifiedToken.exp - Math.floor(Date.now() / 1000)
                    : 3600; // Default 1 hour

                // Cache the verified token
                if (expiresIn > 0) {
                    tokenCache.set(`token:${token}`, verifiedToken, expiresIn);
                }

                (request as any).user = verifiedToken;
                (request as any).authenticated = true;

            } catch (error) {
                (request as any).authenticated = false;
                (request as any).user = null;
            }

        } catch (error) {
            (request as any).authenticated = false;
            (request as any).user = null;
        }
    };
}

export { TokenCache };
export default authenticate;
