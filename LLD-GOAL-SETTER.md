# LLD — GoalSetter (BootifyJS POC App)

**Mission:** a small but complete Goal-Setting app that exercises **every major
BootifyJS 3.0 feature** end-to-end — the reference application for the
framework. Stack: `bootifyjs` (this repo, linked locally) +
`@priyadarship4/commons` sqlite module as the database layer.

Domain: **Goals → Milestones → Tasks**, plus **daily Check-ins** with streak
tracking, and a dashboard with completion stats.

---

## 1. BootifyJS feature → POC mapping (the "why" of every feature)

| BootifyJS feature | Where GoalSetter uses it |
|---|---|
| `createBootifyApp()` builder | `src/main.ts` — the whole app in one fluent chain |
| `.enableSwagger()` | Docs at `/docs`; every route documented via `@Schema` zod |
| `.enableAuth()` + `@UseAuth()` `@Roles('admin')` `@CurrentUser()` | JWT auth over the users table; admin-only metrics endpoint |
| `.enableCors()` | Dev-friendly default, explicit origin in prod |
| `/health` + `/ready` (default ON) | `/ready` probes the sqlite store health |
| `x-request-id` tracing + structured logs | Default ON — every log line carries requestId |
| DI container (`@Service`/`@Repository`/`@Autowired`) | Repos, services, controllers |
| Zod `@Schema` validation | All request bodies/params |
| Typed errors (`NotFoundError`, `HttpError`, `ConfigValidationError`) | Ownership checks, business-rule violations |
| `EventBusService` + `@EventListener`/`@OnEvent` | `goal.completed` event → celebration handler + cache eviction |
| `@Cacheable`/`@CacheEvict` | Dashboard stats (30s TTL), evicted on mutations |
| `@Scheduled` + `SchedulerService` | Daily 08:00 digest of due tasks (cron) |
| `@priyadarship4/commons` sqlite | `Db` (statement cache, transactions), checksummed `migrate()`, `BaseRepo` CRUD |
| `bootifyjs/testing` (`createTestApp`, fakes) | The app's own integration test suite |
| Graceful shutdown (`app.close()`) | SIGTERM drains scheduler + closes db |

---

## 2. Project location & local linking

**Location:** sibling repo `~/Documents/goal-setter` (standalone showcase repo —
clonable proof that bootifyjs works for real apps).

**Linking strategy (both supported):**

```bash
# --- Option A (committed, reproducible): file: deps ---
# goal-setter/package.json
"dependencies": {
  "bootifyjs": "file:../bootifyjs",
  "@priyadarship4/commons": "file:../commons"
}
# npm symlinks file: deps — edits to framework source need `npm run build`
# in the framework repo (dist is what the app imports).

# --- Option B (active framework dev): npm link ---
cd ~/Documents/bootifyjs && npm run build && npm link
cd ~/Documents/commons     && npm run build && npm link
cd ~/Documents/goal-setter && npm link bootifyjs @priyadarship4/commons
```

**Build order rule:** framework `dist/` must exist before the app starts.
`goal-setter` scripts: `"predev": "npm run build --prefix ../bootifyjs && npm run build --prefix ../commons"`
(opt-out: `npm run dev` skips prepublishOnly anyway; keep predev optional via `PREP=skip`).

**Module format:** app is **CommonJS** (`ts-node`), consuming bootifyjs CJS
`dist` and commons `require` export path — same toolchain as the framework.

---

## 3. Repository layout

```
goal-setter/
├── package.json            # file:/link deps, scripts (dev, test, migrate)
├── tsconfig.json           # module: commonjs, experimentalDecorators, emitDecoratorMetadata
├── vitest.config.ts        # same tsc-Program decorator plugin pattern as bootifyjs
├── .env.example            # JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, DB_PATH, PORT
├── data/                   # sqlite file (gitignored)
├── src/
│   ├── main.ts             # the createBootifyApp() chain — ~40 lines total
│   ├── config.ts           # zod env schema (PORT, DB_PATH, JWT secrets, NODE_ENV)
│   ├── db/
│   │   ├── db.ts           # Db singleton factory + DB_TOKEN + migrate runner
│   │   └── migrations/
│   │       └── 001_init.sql
│   ├── modules/
│   │   ├── users/
│   │   │   ├── user.repo.ts
│   │   │   └── user.service.ts        # register (scrypt hash), findByEmail
│   │   ├── auth/
│   │   │   └── auth.module.ts         # userProvider + credentialValidator wiring
│   │   ├── goals/
│   │   │   ├── goal.repo.ts
│   │   │   ├── goal.service.ts        # + completion business rule
│   │   │   ├── goal.controller.ts
│   │   │   └── goal.schema.ts
│   │   ├── milestones/ (repo, service, controller, schema)
│   │   ├── tasks/      (repo, service, controller, schema)
│   │   ├── checkins/   (repo, service, controller, schema — streak logic)
│   │   └── dashboard/
│   │       └── dashboard.service.ts   # @Cacheable stats
│   └── events/
│       └── goal-events.ts             # @EventListener handler
├── migrations/             # symlink or copy → src/db/migrations (commons migrate dir)
└── tests/
    ├── setup.ts
    ├── helpers/app.ts      # createTestApp + in-memory sqlite + seeded user
    └── integration/
        ├── auth-flow.test.ts
        ├── goals.test.ts
        ├── milestones.test.ts
        ├── tasks.test.ts
        ├── checkins.test.ts
        └── dashboard.test.ts
```

---

## 4. Domain model & migration (`001_init.sql`)

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,          -- uuid
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,             -- scrypt: salt:hash (hex)
  created_at    TEXT NOT NULL,             -- ISO (repo-managed timestamps)
  updated_at    TEXT NOT NULL
);

CREATE TABLE goals (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT NOT NULL DEFAULT 'general',   -- health|career|learning|finance|general
  target_date  TEXT,                              -- ISO date, nullable
  status       TEXT NOT NULL DEFAULT 'active',    -- active|completed|abandoned
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_goals_user   ON goals(user_id, status);
CREATE INDEX idx_goals_status ON goals(status);

CREATE TABLE milestones (
  id           TEXT PRIMARY KEY,
  goal_id      TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,       -- ordering within goal
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending|completed
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_milestones_goal ON milestones(goal_id, position);

CREATE TABLE tasks (
  id           TEXT PRIMARY KEY,
  goal_id      TEXT REFERENCES goals(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE SET NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  due_date     TEXT,                             -- ISO date (daily view)
  completed    INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_tasks_user_due ON tasks(user_id, due_date, completed);

CREATE TABLE checkins (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,                      -- YYYY-MM-DD, one per user/day
  note       TEXT,
  mood       TEXT NOT NULL DEFAULT 'neutral',    -- great|good|neutral|low|bad
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, date)
);
CREATE INDEX idx_checkins_user ON checkins(user_id, date);
```

**Repo wiring** (commons `BaseRepo`):
- `BaseRepoConfig`: `writableColumns` allowlist per table, `timestamps: true`
  (commons manages `created_at/updated_at`), `softDelete: false` (POC keeps
  hard deletes; goals "delete" = status→abandoned via service), 
  `generateId: () => randomUUID()`.
- Domain queries beyond BaseRepo CRUD (`listByUser`, `byUserAndId`,
  `countDueToday`, `streakDates`) implemented in each repo with
  `db.prepare(sql, { name })` — named statements hit the commons LRU cache.

---

## 5. API contract

Legend: 🔒 = `@UseAuth()`, 🛡️ = `@Roles('admin')`.

| Method | Path | Auth | Body/Query (zod) | Success | Errors | Side effects |
|---|---|---|---|---|---|---|
| POST | `/auth/register` | — | `{email, username, password(min8)}` | 201 user | 409 email taken | — |
| POST | `/auth/login` | — | `{email, password}` | 200 `{user, accessToken, refreshToken}` | 401 invalid | — |
| POST | `/auth/refresh` | — | `{refreshToken}` | 200 rotated pair | 401 | rotation via storage |
| POST | `/auth/logout` | — | `{refreshToken}` | 204 | — | revoke |
| GET | `/goals` | 🔒 | `?status=active\|completed\|abandoned` | 200 list | — | — |
| POST | `/goals` | 🔒 | `{title, description?, category?, targetDate?}` | 201 goal | 400 | — |
| GET | `/goals/:id` | 🔒 | — | 200 goal + milestones | 404 (foreign → 404) | — |
| PATCH | `/goals/:id` | 🔒 | `{title?, description?, category?, targetDate?, status?}` | 200 | 404 | — |
| DELETE | `/goals/:id` | 🔒 | — | 200 abandoned goal | 404 | evict dashboard |
| POST | `/goals/:id/complete` | 🔒 | — | 200 completed goal | 404, **409** milestones pending | **`goal.completed` event**, evict |
| POST | `/goals/:goalId/milestones` | 🔒 | `{title, position?}` | 201 | 404 | — |
| PATCH | `/milestones/:id` | 🔒 | `{title?, status?, position?}` | 200 | 404 | — |
| DELETE | `/milestones/:id` | 🔒 | — | 204 | 404 | — |
| GET | `/tasks` | 🔒 | `?date=YYYY-MM-DD` (default today) | 200 list | — | — |
| POST | `/tasks` | 🔒 | `{title, goalId?, milestoneId?, dueDate?}` | 201 | 404 (bad refs) | — |
| PATCH | `/tasks/:id` | 🔒 | `{title?, completed?, dueDate?}` | 200 | 404 | evict dashboard |
| DELETE | `/tasks/:id` | 🔒 | — | 204 | 404 | evict dashboard |
| POST | `/checkins` | 🔒 | `{date?, note?, mood?}` (date default today) | 201 | 409 duplicate | evict streak cache |
| GET | `/checkins` | 🔒 | `?from&to` | 200 list | — | — |
| GET | `/checkins/streak` | 🔒 | — | 200 `{current, longest, lastCheckIn}` | — | `@Cacheable` 60s |
| GET | `/stats/dashboard` | 🔒 | — | 200 stats | — | `@Cacheable` 30s |
| GET | `/stats/admin` | 🔒 🛡️ | — | 200 platform stats | 403 | role demo |
| GET | `/health`, `/ready` | — | — | default feature | — | `/ready` probes sqlite |

**Ownership rule:** every service method takes `userId` (from
`@CurrentUser()`) and filters `WHERE user_id = ?`; a foreign id returns
`NotFoundError` (no existence leak). All ownership-sensitive queries go
through repos with the userId bound.

**Completion rule (business):** `POST /goals/:id/complete` succeeds only when
the goal has ≥1 milestone and all are `completed`; otherwise
`HttpError(409, 'Complete all milestones first')`. On success the service
flips status, sets `completed_at`, and publishes `goal.completed`.

---

## 6. Module LLD

### 6.1 `src/main.ts` — the whole app (~40 lines, the POC pitch)

```ts
import 'reflect-metadata'
import { createBootify } from 'bootifyjs'
import { defineConfig } from 'bootifyjs/config'
import { z } from 'zod'
import { configSchema, loadDb, runMigrations } from './config'
import { controllers } from './modules'
import { bootstrapEventSystem } from './events'

const env = loadConfig()

const app = await createBootifyApp()
  .setServiceName('goal-setter')
  .setPort(env.PORT)
  .useConfig(defineConfig(configSchema.shape))
  .enableCors({ origin: env.CORS_ORIGIN ?? true })
  .enableSwagger({ path: '/docs', jwtSecurity: true })
  .enableAuth({
    accessTokenSecret: env.JWT_ACCESS_SECRET,
    refreshTokenSecret: env.JWT_REFRESH_SECRET,
    userProvider: findByUserId,          // from user.service
    credentialValidator: verifyCredentials,
    tokenStorage: createTokenStorage(env),
  })
  .beforeStart(async () => {
    await runMigrations()                // commons checksummed migrations
    await bootstrapEventSystem(controllers)
  })
  .build()

await app.start()
```

### 6.2 auth integration (`modules/auth`)

- `credentialValidator({email, password})` → user.repo.findByEmail →
  `crypto.scryptSync(password, salt, 64)` timing-safe compare → User or null.
- `userProvider(userId)` → repo lookup (JwtStrategy `validate()` uses it).
- Registration hashes with `crypto.randomBytes(16)` salt; never store plaintext.
- Refresh flow uses bootifyjs `JwtStrategy` as-is (rotation + optional
  storage). POC ships `tokenStorage: undefined` (stateless) with the
  `RedisTokenStorage`/`FakeTokenStorage` swap documented.

### 6.3 goals module

- `GoalRepo extends BaseRepo` — `insert/findById/findMany` + `listByUser(userId, status?)`,
  `byUserAndId(id, userId)` (ownership in SQL).
- `GoalService`:
  - `create(userId, dto)` → repo.insert
  - `list(userId, status?)`
  - `getOwned(userId, id)` → NotFoundError when missing/foreign
  - `update(userId, id, patch)`
  - `abandon(userId, id)`
  - `complete(userId, id)` → transaction (commons `db.transaction(fn)`):
    load milestones → validate all completed (else `HttpError 409`) → update
    goal → publish `goal.completed` → return goal.
- `GoalController`: `@Controller('/goals')`, all methods `@UseAuth()`,
  `@Schema` zod, `@CurrentUser()` for the userId param.

### 6.4 milestones / tasks / checkins

- Same shape as goals: repo (ownership-bound queries) → service (rules) →
  controller (decorators). Notable rules:
  - `TaskService.create`: validates `goalId`/`milestoneId` belong to the user
    (404 otherwise).
  - `CheckInService.create`: unique `(user_id, date)` → 409 on duplicate;
    `streak(userId)`: sorted distinct dates → walk backwards from today (or
    yesterday) counting consecutive days; `longest` computed over history.
- Params zod: ISO date coercion via `z.string().date()` transforms.

### 6.5 dashboard (`@Cacheable` showcase)

```ts
@Service()
export class DashboardService {
  @Cacheable({ key: 'dashboard', ttl: 30 })
  async stats(@Autowired-injected services..., userId: string) {
    // activeGoals, completedGoals, milestonesPending, tasksDueToday,
    // currentStreak, completionRate
  }
}
```
Mutating services call `cacheService.del('dashboard::<userId>')` (documented
key format from `generateCacheKey`) — plus the `goal.completed` listener
evicts as a belt-and-braces demo.

### 6.6 events (`goal-events.ts`)

```ts
@EventListener()
export class GoalEventsHandler {
  @OnEvent('goal.completed')
  async onGoalCompleted(event) {
    logger.info('goal.completed', { goalId, userId })   // structured, requestId attached
    await cacheService.del(`dashboard::${event.payload.userId}`)
  }
}
```
(`bootstrapEventSystem` scanned the controllers list; listeners are
`@Component`-registered and resolved from the container — same wiring the
framework tests prove.)

### 6.7 scheduling

```ts
@Service()
export class DigestService {
  @Scheduled({ cron: '0 8 * * *', preventOverlap: true, name: 'morning-digest' })
  async dailyDigest() { /* count due-today tasks per user, log summary */ }
}
```
Manual demo: `npx ts-node scripts/trigger-digest.ts` →
`scheduler.trigger('DigestService.morning-digest')` (documented; tests use the
same trigger).

---

## 7. Testing plan (the app proves `bootifyjs/testing`)

- **Setup:** `createTestApp({ controllers, setup: (app, container) => {...} })`
  with an **in-memory sqlite** (`new Db(':memory:')` — commons supports it),
  migrations applied, auth enabled with test secrets, seeded user.
- `helpers/app.ts` exports `buildTestApp()` + `authHeaders(user)` helpers.
- Suites:
  1. `auth-flow` — register → login → protected 401→200 → refresh rotation → logout
  2. `goals` — CRUD + ownership (user B cannot see A's goal → 404) + complete gating (409 → complete milestones → 200) + `goal.completed` event fired (spy handler)
  3. `milestones` — ordering, complete/uncomplete
  4. `tasks` — daily view filter, toggle, cross-user 404
  5. `checkins` — duplicate 409, streak math (today chain, gap break), cache eviction on new checkin
  6. `dashboard` — numbers correct after mutations; second call served from cache (underlying counters don't re-run)
- Non-functional assertions: every response carries `x-request-id`;
  `/docs/json` contains all paths; `/ready` reflects sqlite health.

**Framework-side regression note:** this app's suite doubles as a
real-world smoke test for bootifyjs — CI can run it against the framework
build (`npm test` in goal-setter with linked deps).

---

## 8. Config (`src/config.ts`)

```ts
export const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DB_PATH: z.string().default('./data/goals.db'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  CORS_ORIGIN: z.string().optional(),
  SERVICE_NAME: z.string().default('goal-setter'),
})
```
`.env.example` documents all; prod requires real secrets (bootifyjs
`ConfigValidationError` surfaces gaps at startup).

---

## 9. Risks / decisions

| Decision | Rationale |
|---|---|
| CJS app consuming linked dist | Same toolchain as framework; no ESM/CJS interop surprises |
| scrypt (node:crypto) not bcrypt | Zero extra deps for the POC; swap documented |
| Hard deletes (no soft-delete) | BaseRepo softDelete off; goals "delete" = abandon status |
| `:memory:` sqlite in tests | commons Db supports it natively; per-test isolation, zero fs |
| Ownership in SQL (`WHERE user_id=?`) not post-filters | No existence leaks; index-backed |
| Events via plain `EventBusService` (not buffered workers) | POC simplicity; buffered path already framework-tested; swap documented |
| `position` on milestones, not drag-drop API | Ordering demo without websocket scope |

## 10. Build sequence & estimate

| # | Step | Est |
|---|---|---|
| 1 | Scaffold repo (package.json, tsconfig, vitest + decorator plugin, .env.example, link/file deps) | 0.5d |
| 2 | db.ts + 001_init.sql + user repo/service (scrypt) | 0.5d |
| 3 | main.ts chain + auth integration (register/login/refresh/logout) | 0.5d |
| 4 | goals module (service/controller/schema) + ownership tests | 1d |
| 5 | milestones + completion gating + `goal.completed` event | 0.5d |
| 6 | tasks + checkins (streak math) + dashboard (@Cacheable) | 1d |
| 7 | digest `@Scheduled` + admin role endpoint | 0.5d |
| 8 | Full test pass + README (the POC's own pitch) | 0.5d |

**Total ≈ 5 days.** Sequencing note: commons `migrate()` + Db APIs were
verified against source (base-repo `insert/findById/findMany/updateById/
deleteById/restoreById`, `new Db(path, options)`, `:memory:` supported).
