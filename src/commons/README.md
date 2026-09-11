# BootifyJS Framework Commons (`bootifyjs/commons`)

> **"Framework commons"** — generic, dependency-free utilities shared across
> framework modules and exported for application use. Distinct from
> `@priyadarship4/commons` ("commons-sqlite" — the cross-repo building blocks
> with the sqlite/DI layer).

## Placement rule

A utility belongs here when it is **generic**, **framework-agnostic**, and
used by **at least two framework modules** (or by users independent of any
module). This module imports **nothing** from the rest of the framework.

## What ships here

### `singleFlight` / `SingleFlight` — promise deduplication

Concurrent callers with the same key share one execution — one database
query, one API call, one token refresh instead of a stampede.

```ts
import { singleFlight } from 'bootifyjs/commons'

// The classic: dedupe OAuth token refreshes
async function getAccessToken() {
  return singleFlight.run('oauth:refresh', async () => refreshFromProvider())
}

// Dedupe a heavy DB aggregate — concurrent dashboard loads share one query
getRevenueRollup(month: string) {
  return singleFlight.run(`analytics:revenue:${month}`, async () => {
    return db.prepare('SELECT ...').all(month)
  })
}
```

Semantics:

| Aspect | Behavior |
|---|---|
| Leader / followers | First caller for a key runs the work; concurrent same-key callers receive the leader's promise |
| Errors | Followers receive the leader's error; **failures are not remembered** — the next caller retries fresh |
| Memory | Entries exist only while work is in flight — self-cleaning, no eviction needed |
| Key choice | Same key = coalesced; different key = independent |
| Reentrancy | A loader calling `run()` with its own key throws `SingleFlightReentrancyError` (would deadlock) |
| Scope | Per process — multi-instance deployments dedupe per instance |
| Methods | `run(key, fn)`, `size`, `keys()`, `clear()` (never cancels running work) |

In the cache layer, `@Cacheable` uses this automatically (single-flight is
default-ON — see the [cache bible](../cache/README.md) §6.5), and
`CacheService.remember()` coalesces through the same instance.

### `stableStringify` — order-stable JSON serialization

`JSON.stringify` but with recursively sorted object keys, `Date` → ISO,
circular references → `"<circular>"`, `undefined` → `undefined` token.

```ts
import { stableStringify } from 'bootifyjs/commons'

stableStringify({ b: 2, a: 1 }) // '{"a":1,"b":2}' — key order never matters
stableStringify(when)           // '"2026-01-01T00:00:00.000Z"'
```

Used by the cache's key generation (`generateCacheKey`) — logically-equal
objects always map to the same cache entry.
