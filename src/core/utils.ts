import { IncomingMessage } from 'http';
import { URL } from 'url';

export function parseQuery(req: IncomingMessage): Record<string, string> {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const params: Record<string, string> = {};
    
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    
    return params;
  } catch {
    return {};
  }
}

export function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        if (body.trim() === '') {
          resolve(null);
          return;
        }
        
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('application/json')) {
          // Preserve the original body string for backward compatibility
          const parsedBody = JSON.parse(body);
          // Add the original body as a non-enumerable property for tests that expect the exact string
          Object.defineProperty(parsedBody, '_originalBody', {
            value: body,
            enumerable: false,
            writable: false
          });
          resolve(parsedBody);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(body);
          const result: Record<string, string> = {};
          params.forEach((value, key) => {
            result[key] = value;
          });
          resolve(result);
        } else {
          resolve(body);
        }
      } catch (error) {
        reject(error);
      }
    });
    
    req.on('error', reject);
  });
}

export function matchRoute(routePath: string, requestPath: string): { 
  isMatch: boolean; 
  params: Record<string, string> 
} {
  const routeParts = routePath.split('/').filter(Boolean);
  const requestParts = requestPath.split('/').filter(Boolean);
  
  if (routeParts.length !== requestParts.length) {
    return { isMatch: false, params: {} };
  }
  
  const params: Record<string, string> = {};
  
  for (let i = 0; i < routeParts.length; i++) {
    const routePart = routeParts[i];
    const requestPart = requestParts[i];
    
    if (routePart.startsWith(':')) {
      const paramName = routePart.substring(1);
      params[paramName] = requestPart;
    } else if (routePart !== requestPart) {
      return { isMatch: false, params: {} };
    }
  }
  
  return { isMatch: true, params };
}