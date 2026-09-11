/**
 * Env helper: applies vars, returns a restore function.
 * Usage: const restore = applyEnv({ FOO: '1' }); try { ... } finally { restore() }
 * or in beforeEach/afterEach.
 */
export function applyEnv(vars: Record<string, string | undefined>): () => void {
  const snapshot = new Map<string, string | undefined>()
  for (const key of Object.keys(vars)) {
    snapshot.set(key, process.env[key])
  }
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  return () => {
    for (const [key, value] of snapshot) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}
