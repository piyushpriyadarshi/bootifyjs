import { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { AppConfig } from '../config';
import { RequestContextService } from '../core';

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

// JWT verification function (replace with your worker implementation)
const verifyJwtToken = async ({ token, tokenSecret }: { token: string; tokenSecret: string }) => {

  const appConfig = AppConfig.getInstance();
  const jwtSecret = appConfig.get('JWT_SECRET');

  console.log(`Verifying token: ${token}`)
  console.log(`Token secret: ${tokenSecret}`);
  console.log(`Token JWT secret: ${jwtSecret}`);


  try {
    const decoded = jwt.verify(token, jwtSecret) as any;
    return decoded;
  } catch (error) {
    console.log(error)
    throw new Error('Invalid token');
  }
};

/**
 * Authentication middleware factory
 * @param tokenSecret JWT secret for token verification
 * @returns Fastify middleware function
 */
function authenticate(tokenSecret: string) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      // Extract token from headers


      const contextService = new RequestContextService()

      console.log('Token Secret', tokenSecret)
      const accessToken =
        request.headers.Authorization || request.headers.authorization;

      if (!accessToken) {
        (request as any).authenticated = false;
        return;
      }

      console.log(`Access token: ${accessToken}`);

      // Check cache first
      const cachedToken = tokenCache.get(`token:${accessToken}`);

      if (cachedToken) {
        // Token found in cache
        (request as any).user = cachedToken;
        (request as any).authenticated = true;
        console.log('Token found in cache');
        return;
      }

      // Verify token if not in cache
      try {
        const verifiedToken = await verifyJwtToken({
          token: Array.isArray(accessToken) ? accessToken[0] : accessToken || "",
          tokenSecret
        });

        // Calculate expiration time
        const expiresIn = verifiedToken.exp - Math.floor(Date.now() / 1000);

        // Cache the verified token
        tokenCache.set(`token:${accessToken}`, verifiedToken, expiresIn);

        (request as any).user = verifiedToken;
        (request as any).authenticated = true;
        contextService.set('user', verifiedToken)

      } catch (error) {
        console.error('Error verifying token:', error);
        (request as any).authenticated = false;
        (request as any).user = null;
      }

    } catch (error) {
      console.error('Authentication middleware error:', error);
      (request as any).authenticated = false;
      (request as any).user = null;
    }
  };
}

export default authenticate;
export { authenticate, TokenCache };
