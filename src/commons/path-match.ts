/**
 * Path pattern matching for auth route rules.
 *
 * Semantics:
 * - 'exact/path'      → literal match
 * - 'exact/*'         → '*' matches exactly ONE segment
 * - 'admin/**'        → '**' matches ALL remaining segments (including none)
 * - RegExp            → used as-is against the candidate string
 *
 * Matched against the Fastify ROUTE PATTERN (request.routeOptions.url —
 * e.g. '/users/:id'), not the raw request URL — stable, no query strings,
 * and parameter placeholders are compared literally against the rule.
 */

function escapeRegex(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Convert a glob path pattern to a regular expression source.
 * '**' → any remaining segments; '*' → exactly one segment.
 */
function globToRegExpSource(pattern: string): string {
  const normalized = pattern.replace(/\/+$/, '')
  const segments = normalized.split('/')

  const parts: string[] = []
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment === '**') {
      // '**' as the LAST segment matches everything after the prefix;
      // mid-pattern '**' behaves like '**' + '/' for the remaining parts.
      const rest = segments.slice(i + 1)
      if (rest.length === 0) {
        parts.push('(?:/.*)?')
      } else {
        parts.push(`(?:/(?:${rest.map(compileSegment).join('/')})(?:/.*)?)`)
      }
      return buildSource(parts.join(''))
    }
    parts.push(compileSegment(segment))
  }
  return buildSource(parts.join('/'))
}

function compileSegment(segment: string): string {
  if (segment === '*') {
    return '[^/]+'
  }
  return segment.split('*').map(escapeRegex).join('[^/]*')
}

function buildSource(body: string): string {
  return `^/${body.replace(/^\/+/, '')}/?$`
}

/**
 * Test a candidate path (route pattern) against a string glob or RegExp.
 */
export function matchesPath(pattern: string | RegExp, url: string): boolean {
  if (pattern instanceof RegExp) {
    return pattern.test(url)
  }

  const candidate = `/${url.replace(/^\/+|\/+$/g, '')}`
  const normalizedPattern = `/${pattern.replace(/^\/+|\/+$/g, '')}`

  if (normalizedPattern.includes('**') || normalizedPattern.split('/').includes('*')) {
    return new RegExp(globToRegExpSource(normalizedPattern)).test(candidate)
  }

  // fast path: exact (normalized) comparison
  return normalizedPattern === candidate
}
