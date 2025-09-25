import { FastifyRequest, FastifyReply } from 'fastify';
import { ContextExtractor } from './context.middleware';

// Authentication context extractor that works with JWT-based authentication
export const authContextExtractor: ContextExtractor = (req: FastifyRequest, res: FastifyReply) => {
  let userId: string | null = null;
  let username: string | null = null;
  let userEmail: string | null = null;
  let userRoles: string[] = [];
  let authMethod: string = 'none';
  let isAuthenticated: boolean = false;
  let authenticatedUser: any = null;

  // Check if user is authenticated via JWT middleware
  if ((req as any).authenticated && (req as any).user) {
    authenticatedUser = (req as any).user;
    isAuthenticated = true;
    authMethod = 'jwt';
    
    // Extract user information from JWT payload
    userId = authenticatedUser.id || authenticatedUser.sub;
    username = authenticatedUser.username || authenticatedUser.name;
    userEmail = authenticatedUser.email;
    userRoles = authenticatedUser.roles || [];
  }
  
  // Fallback: Try API Key authentication (x-api-key header) for backward compatibility
  if (!authenticatedUser) {
    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) {
      // You can implement API key validation here if needed
      // For now, we'll just mark it as an API key method
      authMethod = 'apikey';
      // Note: You would need to validate the API key against your database/store
    }
  }

  // Set context values
  if (isAuthenticated) {
    userEmail = authenticatedUser.email;
    userRoles = authenticatedUser.roles || [];
    isAuthenticated = true;
  }

  return {
    // Authentication context
    userId,
    username,
    userEmail,
    userRoles,
    authMethod,
    isAuthenticated,
    
    // Request metadata
    userAgent: req.headers['user-agent'],
    clientIp: req.ip,
    requestMethod: req.method,
    requestUrl: req.url,
    
    // Additional useful context
    timestamp: new Date().toISOString(),
    hasApiKey: !!(req.headers['x-api-key']),
    hasBearerToken: !!(req.headers.authorization && req.headers.authorization.startsWith('Bearer ')),
    hasBasicAuth: !!(req.headers.authorization && req.headers.authorization.startsWith('Basic '))
  };
};

// Enhanced context extractor with additional security context
export const enhancedAuthContextExtractor: ContextExtractor = (req: FastifyRequest, res: FastifyReply) => {
  const baseContext = authContextExtractor(req, res);
  
  // Add security-related context
  const securityContext = {
    // Rate limiting context
    clientFingerprint: generateClientFingerprint(req),
    
    // Request source analysis
    isFromMobileApp: isMobileUserAgent(req.headers['user-agent'] || ''),
    isFromBrowser: isBrowserUserAgent(req.headers['user-agent'] || ''),
    
    // Geographic context (mock - in real app you'd use IP geolocation)
    estimatedRegion: 'US', // Mock data
    estimatedTimezone: 'America/New_York', // Mock data
    
    // Request characteristics
    contentType: req.headers['content-type'],
    acceptLanguage: req.headers['accept-language'],
    referer: req.headers.referer,
    
    // Security flags
    isSecureConnection: req.protocol === 'https',
    hasCustomHeaders: hasCustomHeaders(req.headers)
  };
  
  return {
    ...baseContext,
    ...securityContext
  };
};

// Utility functions
function generateClientFingerprint(req: FastifyRequest): string {
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  const acceptEncoding = req.headers['accept-encoding'] || '';
  
  // Simple fingerprint based on headers (in production, use more sophisticated methods)
  const fingerprint = Buffer.from(`${userAgent}:${acceptLanguage}:${acceptEncoding}`)
    .toString('base64')
    .substring(0, 16);
    
  return fingerprint;
}

function isMobileUserAgent(userAgent: string): boolean {
  const mobileKeywords = ['Mobile', 'Android', 'iPhone', 'iPad', 'Windows Phone'];
  return mobileKeywords.some(keyword => userAgent.includes(keyword));
}

function isBrowserUserAgent(userAgent: string): boolean {
  const browserKeywords = ['Mozilla', 'Chrome', 'Safari', 'Firefox', 'Edge'];
  return browserKeywords.some(keyword => userAgent.includes(keyword));
}

function hasCustomHeaders(headers: any): boolean {
  const customHeaderPrefixes = ['x-', 'X-'];
  const headerNames = Object.keys(headers);
  
  return headerNames.some(header => 
    customHeaderPrefixes.some(prefix => header.startsWith(prefix))
  );
}

// Export default as the basic auth context extractor
export default authContextExtractor;