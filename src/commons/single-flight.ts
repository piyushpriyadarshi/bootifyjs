import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Thrown when a single-flight loader calls `run()` with its own key — that
 * would await its own promise (deadlock). Restructure the loader or use a
 * different key. Lives in commons so this module stays dependency-free.
 */
export class SingleFlightReentrancyError extends Error {
  constructor(key: string) {
    super(
      `[Cache] single-flight reentrancy detected for key '${key}' — the loader is ` +
        `calling itself. Restructure the loader or bypass with a fresh key.`
    )
    this.name = 'SingleFlightReentrancyError'
  }
}

/**
 * Single-flight: concurrent callers with the same key share ONE execution.
 *
 * - The **leader** (first caller for an unsettled key) runs the work.
 * - **Followers** (concurrent callers with the same key) receive the leader's
 *   promise — one execution, everyone gets the same value or the same error.
 * - **Failures are not memoized**: the entry is removed the moment the promise
 *   settles, so the next caller retries fresh.
 *
 * The map is a waiting room, not a warehouse: entries exist only while work
 * is in flight and can never outlive it — no eviction strategy is needed.
 *
 * Keys must deterministically identify the work: same key = coalesced,
 * different key = independent.
 */
export class SingleFlight {
  private inFlight = new Map<string, Promise<unknown>>()
  private static scope = new AsyncLocalStorage<string[]>()

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Reentrancy guard: a loader that calls run() with its own key would
    // await its own promise and deadlock. Fail loudly instead.
    const stack = SingleFlight.scope.getStore() ?? []
    if (stack.includes(key)) {
      throw new SingleFlightReentrancyError(key)
    }

    // Follower path: someone is already running this work.
    const existing = this.inFlight.get(key)
    if (existing) {
      return existing as Promise<T>
    }

    // Leader path: run the work inside the flight scope (so nested run()
    // calls with the same key are detected) and publish the promise.
    const promise = SingleFlight.scope.run([...stack, key], async () => fn()).finally(() => {
      // Stale-delete guard: only remove OUR entry — a clear() mid-flight must
      // not cause this settle to delete a newer flight's registration.
      if (this.inFlight.get(key) === promise) {
        this.inFlight.delete(key)
      }
    })

    this.inFlight.set(key, promise)
    return promise
  }

  /** Number of in-flight executions (observability/tests). */
  get size(): number {
    return this.inFlight.size
  }

  /** Keys with work currently in flight. */
  keys(): string[] {
    return [...this.inFlight.keys()]
  }

  /**
   * Forget all in-flight entries. Never cancels running work — leaders still
   * finish and store their results. Test/debug helper.
   */
  clear(): void {
    this.inFlight.clear()
  }
}

/** Process-wide instance — shared by @Cacheable, remember() and user code. */
export const singleFlight = new SingleFlight()
