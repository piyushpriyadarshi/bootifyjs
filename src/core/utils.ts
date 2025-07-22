import { IncomingMessage } from 'http'
import { URL } from 'url'

/**
 * Parses query parameters from a request in a framework-agnostic way.
 * It first checks for a pre-parsed `query` object (from Express/Fastify)
 * before falling back to manually parsing the URL for the native http server.
 *
 * @param req The request object from Node, Express, or Fastify.
 * @returns A record of query parameters.
 */
export function parseQuery(req: any): Record<string, string> {
  // For Express/Fastify, the query is often pre-parsed.
  if (req.query && typeof req.query === 'object' && Object.keys(req.query).length > 0) {
    return req.query
  }

  // Fallback for native Node.js http.IncomingMessage
  try {
    const host = req.headers?.host || 'localhost'
    const url = new URL(req.url || '', `http://${host}`)
    const params: Record<string, string> = {}

    url.searchParams.forEach((value, key) => {
      params[key] = value
    })

    return params
  } catch {
    return {}
  }
}

/**
 * Parses the request body in a framework-agnostic way.
 * It first checks for a pre-parsed `body` object (from Express/Fastify)
 * before falling back to manually parsing the stream for the native http server.
 *
 * @param req The request object from Node, Express, or Fastify.
 * @returns A promise that resolves with the parsed body.
 */
export function parseBody(req: any): Promise<any> {
  // For Express/Fastify, the body is already parsed by middleware.
  // Check if req.body exists and is not an empty object.
  if (req.body && (typeof req.body !== 'object' || Object.keys(req.body).length > 0)) {
    return Promise.resolve(req.body)
  }

  // Fallback for native Node.js http.IncomingMessage (which is a stream)
  if (typeof req.on !== 'function') {
    // If there's no .on function and no body, resolve with null.
    return Promise.resolve(null)
  }

  return new Promise((resolve, reject) => {
    let body = ''

    req.on('data', (chunk: Buffer | string) => {
      body += chunk.toString()
    })

    req.on('end', () => {
      try {
        if (body.trim() === '') {
          resolve(null)
          return
        }

        const contentType = req.headers['content-type'] || ''

        if (contentType.includes('application/json')) {
          resolve(JSON.parse(body))
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(body)
          const result: Record<string, string> = {}
          params.forEach((value, key) => {
            result[key] = value
          })
          resolve(result)
        } else {
          // Resolve with the raw string body if content type is unknown
          resolve(body)
        }
      } catch (error) {
        // Catch JSON parsing errors, etc.
        reject(error)
      }
    })

    req.on('error', (err: Error) => {
      reject(err)
    })
  })
}

/**
 * Matches a request path against a route path with parameters (e.g., /users/:id).
 *
 * @param routePath The defined route path (e.g., '/users/:id').
 * @param requestPath The incoming request path (e.g., '/users/123').
 * @returns An object indicating if it's a match and any extracted params.
 */
export function matchRoute(
  routePath: string,
  requestPath: string
): {
  isMatch: boolean
  params: Record<string, string>
} {
  const routeParts = routePath.split('/').filter(Boolean)
  const requestParts = requestPath.split('/').filter(Boolean)

  if (routeParts.length !== requestParts.length) {
    return { isMatch: false, params: {} }
  }

  const params: Record<string, string> = {}

  for (let i = 0; i < routeParts.length; i++) {
    const routePart = routeParts[i]
    const requestPart = requestParts[i]

    if (routePart.startsWith(':')) {
      const paramName = routePart.substring(1)
      params[paramName] = requestPart
    } else if (routePart !== requestPart) {
      return { isMatch: false, params: {} }
    }
  }

  return { isMatch: true, params }
}
