/**
 * Order-stable JSON serialization: object keys are sorted recursively, so
 * `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce the SAME string.
 *
 * - `Date` keeps its JSON form (ISO string).
 * - Circular references serialize as `"<circular>"` instead of throwing.
 * - `undefined` serializes as the literal token `undefined` (unquoted).
 */
export function stableStringify(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined'
  }
  if (value instanceof Date) {
    return JSON.stringify(value)
  }
  if (seen.has(value)) {
    return '"<circular>"'
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return `[${(value as unknown[]).map((v) => stableStringify(v, seen)).join(',')}]`
  }

  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k], seen)}`)
    .join(',')
  return `{${entries}}`
}
