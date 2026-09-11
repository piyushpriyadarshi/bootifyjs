# BootifyJS — Pitch & Positioning

> Landing-page / launch copy for **bootifyjs.dev**. This is the "why it exists,
> who it's for, and why it's different" document. The technical README lives in
> [`README.md`](./README.md); the engineering contracts live in the `LLD-*.md`
> files.

---

## 1. One-liner

**BootifyJS is a batteries-included TypeScript backend framework for Node.js —
Spring Boot's opinionated structure and dependency injection, on top of
Fastify's performance.**

Everything you keep rebuilding — auth, caching, events, scheduling, config,
logging, health checks, API docs, a test kit — ships in the box, behind a
fluent builder. You get production-ready defaults on day one, and every layer
stays valid Fastify underneath.

---

## 2. The problem

Every new Node.js backend starts the same way:

- Pick a router (Express, Fastify, raw `http`).
- Pick and wire a DI/structure approach — or skip it and let controllers
  become services.
- Re-solve caching, auth, config validation, logging, events, scheduling,
  health checks, error mapping, testing utilities… again.
- Six months later, nobody can tell where the business logic lives.

Node has great **libraries** and almost no complete, opinionated **frameworks**.
Express and Fastify are (deliberately) unopinionated — they give you a server,
not an architecture. NestJS brings structure and DI but still leaves you
assembling the batteries. Spring Boot's superpower was never a single feature —
it was deciding that the boring 80% is a solved problem and shipping it
coherently.

**BootifyJS fills that gap for TypeScript/Node.**

---

## 3. What BootifyJS is

A framework — not a library — with four ideas:

1. **Opinionated by default, escape hatches everywhere.** A fluent builder
   wires the app; every feature is a toggle (`enableAuth`, `enableCache`,
   `enableSwagger`, `enableRequestLogging`, `disableCache`, …).
2. **Dependency injection first-class.** Constructor + property injection,
   interface tokens, scopes, eager loading — services, repositories,
   controllers and events all resolve through one container. SOLID is the
   happy path, not an exercise.
3. **Batteries included.** The list below is not a roadmap — it is what the
   framework already does, tested in this repository.
4. **Fastify-native, never a walled garden.** What you write is valid Fastify;
   plugins, hooks, schemas and `app.handle` are all available. You can drop to
   Fastify at any time without leaving the framework.

### Batteries that ship today

| Area | What you get out of the box |
|---|---|
| **HTTP** | Decorator controllers (`@Controller`, `@Get`/`@Post`/…), `@Body`/`@Query`/`@Param`, zod `@Schema` validation → 400s with issue details |
| **DI** | Container with `@Service`/`@Repository`/`@Component`, `@Autowired` (constructor + property), interface tokens, singleton/transient, `eagerInit()` |
| **Auth** | JWT access + refresh with rotation, API keys, `@UseAuth`/`@Roles`/`@Public`/`@CurrentUser`, global deny-by-default mode, route rules, pluggable `userProvider`/`credentialValidator`, custom access-token claims (`payloadBuilder`) |
| **Cache** | `@Cacheable`/`@CachePut`/`@CacheEvict`, single-flight stampede protection, `condition`/`unless`, tag invalidation (atomic Redis Sets), `remember()`, batch `mget`/`mset`, pluggable stores, opt-in in-memory LRU, app-owned Redis client |
| **Events** | In-process event bus with retries + DLQ, plus buffered worker-thread processing (shared buffer, processor registry — no eval), metrics and health monitoring |
| **Scheduling** | `@Scheduled` cron / fixed-rate / fixed-delay jobs with retry, overlap prevention and stats |
| **Config** | zod schema validation at startup, typed `app.config`, secret redaction, fail-fast errors — no `process.exit` inside the framework |
| **Logging** | Builder-pattern logger, structured context (request-id propagation), transports, bring-your-own Pino/Winston |
| **Observability** | `/health` + `/ready` (with dependency probes), request context propagation, structured access logs |
| **API docs** | Zero-config Swagger UI from decorators + zod schemas, bearer auth wired |
| **Errors** | Typed hierarchy (`BootifyError`, `HttpError`, `ConfigValidationError`, …) mapped to HTTP consistently, one overridable handler |
| **Testing** | `bootifyjs/testing`: `createTestApp()`, `FakeTokenStorage`, `FakeRedisClient`, `FakeTransport` — the same fakes the framework tests itself with |
| **CLI** | `npx bootifyjs new <app>` (minimal tour or full goals POC), `npx bootifyjs generate controller\|service\|repository\|event` |

### Code taste

```ts
// tasks.service.ts
@Service()
export class TaskService {
  constructor(private readonly tasks: TaskRepository) {}

  @Cacheable({ key: 'tasks.list', ttl: 60, tags: (args) => [`user:${args[0]}`] })
  async list(userId: string) {
    return this.tasks.forUser(userId);          // single-flight protected
  }

  @CacheEvict({ tags: (args) => [`user:${args[0]}`] })
  async complete(userId: string, taskId: string) {
    return this.tasks.complete(taskId);
  }
}

// tasks.controller.ts
@Controller('/tasks')
export class TaskController {
  constructor(private readonly tasks: TaskService) {}

  @UseAuth()
  @Get('/')
  list(@CurrentUser() user: any) {
    return this.tasks.list(user.sub);
  }
}

// main.ts
const app = await createBootifyApp()
  .setServiceName('tasks-api')
  .useConfig(configSchema)
  .useControllers([TaskController])
  .enableAuth()          // zero-config with JWT_* env vars
  .enableCache()         // default-ON InMemoryCacheStore, swap to Redis with one call
  .enableSwagger()
  .enableRequestLogging()
  .build();

await app.start();
```

---

## 4. Why not just…?

| | Express | Fastify | NestJS | **BootifyJS** |
|---|---|---|---|---|
| Unopinionated core | ✅ | ✅ | ➖ structure, few batteries | ➖ opinionated structure **+ batteries** |
| Built-in DI | ❌ | ❌ | ✅ | ✅ |
| Auth (JWT refresh rotation, roles) | assemble | assemble | partial (passport modules) | ✅ built-in |
| Cache (single-flight, tags, decorators) | assemble | assemble | external module | ✅ built-in |
| Buffered worker events + DLQ | ❌ | ❌ | ❌ | ✅ built-in |
| Config validation + typed access | assemble | assemble | `@nestjs/config` | ✅ built-in |
| Health / readiness | assemble | assemble | `@nestjs/terminus` | ✅ built-in |
| Swagger from code | assemble | `@fastify/swagger` | `@nestjs/swagger` | ✅ built-in |
| Test kit + fakes | assemble | assemble | `@nestjs/testing` | ✅ built-in |
| Escape hatch to the core | — | — | — | **full Fastify** |

The honest framing: **NestJS is the closest neighbour.** BootifyJS differentiates
on Spring-Boot-style *batteries* (cache, events, scheduling, auth, health,
config, logging) being first-class and cohesive, on Fastify-native performance,
and on a fail-fast, typed-error philosophy.

---

## 5. Design principles

1. **Fail fast, never silently degrade.** Misconfiguration throws at build
   time with an actionable message. A broken dependency surfaces — it does not
   quietly fall back.
2. **Code matches the docs.** Documentation is treated as part of the
   contract; truth passes ship with behavior changes.
3. **Typed everything.** Errors, config, DI tokens, decorators — no `any`
   where a type can carry the contract.
4. **No hidden magic.** What you write is valid Fastify; inspect
   `app.handle`, add plugins, drop to hooks.
5. **Tests are the contract.** The framework's own suites (unit +
   `app.inject()` integration) are the reference usage; fakes ship to users.
6. **No `process.exit` in library code.** Exit decisions belong to the host
   application.

---

## 6. Who it's for

- **Teams building long-lived API services** who want a structure that still
  makes sense 6–12 months later.
- **Developers coming from Spring Boot / NestJS** who miss dependency
  injection and batteries on Node.
- **Startups and consultancies** that want production-ready defaults (auth,
  cache, health, logs, docs) without spending the first two weeks wiring
  libraries.
- **Fastify users** who want architecture and batteries without giving up
  Fastify.

**Not for:** single-endpoint scripts, edge/serverless runtimes where a lean
router is all you need, or teams that want zero opinions and maximum freedom.
If you want to assemble your own stack, Fastify alone is excellent.

---

## 7. Status

- **v3.0** is the current stabilization release (builder API, DI rewrite, typed
  errors, cache Tier-1 + Phase A/B, CLI, 412 tests in-repo).
- Built on Fastify; TypeScript-first; MIT licensed; free and open source.
- Domain: **bootifyjs.dev** (docs + landing).

Roadmap direction: cache serializer + observability events, OpenAPI
improvements, distributed locks, and expanded examples/templates.

---

## 8. Launch copy (Reddit / Product Hunt)

**Short version**

> I built BootifyJS — a batteries-included Node.js framework inspired by
> Spring Boot, on top of Fastify.
>
> Problem: every Node backend re-wires auth, caching, config, events,
> scheduling, health, logs and tests from scratch. Express/Fastify are great
> but deliberately unopinionated; there's no "Spring Boot feeling" in the
> TypeScript ecosystem.
>
> BootifyJS gives you dependency injection, decorator controllers, and all
> those batteries behind one fluent builder — `enableAuth()`,
> `enableCache()`, `enableSwagger()` — while remaining valid Fastify
> underneath. It's opinionated by default with escape hatches everywhere.
>
> Would love feedback from people who've maintained Node services for years:
> is the "batteries + DI + Fastify core" combination something you'd reach
> for? What's missing before you'd try it on a real service?

**Founder note (optional, longer)**

> I've spent ~8 years building and scaling Node.js services (GeoCinema,
> GeoHarshar, Rakuten). Every project started from scratch, re-solved the same
> problems, and drifted into "controller = service = business logic" as it
> grew. I wanted the thing I kept wishing existed: an opinionated,
> batteries-included framework for TypeScript that keeps SOLID and
> maintainability on the happy path — without giving up Fastify's performance
> or plugin ecosystem. That's BootifyJS.

---

## 9. Pitch feedback checklist (before launch)

- Lead with the **one-liner + the pain**, not the author's résumé.
- Keep every claim **falsifiable and shipped** ("built-in cache with
  single-flight", not "enterprise-grade everything").
- Say **NestJS** out loud in comparisons — it builds trust; explain the
  battery/cohesion difference.
- Show **one realistic code sample** (decorators + DI + cache), not a feature
  list first.
- State **what it's not** (serverless scripts, zero-opinion stacks).
- Add one **proof artifact**: a working `npx bootifyjs new` scaffold and the
  test count.
- Ask one specific question in the launch post ("What would block you from
  trying this?") to drive feedback instead of applause.
