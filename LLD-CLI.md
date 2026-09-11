# LLD — BootifyJS CLI (`npx bootifyjs`)

**Vision (locked by Piyush):** the framework package itself IS the CLI. No
separate `bootifyjs-cli` install — `npx bootifyjs` scaffolds a working,
tested, documented project in under a minute.

---

## 1. UX contract

```
npx bootifyjs                          → interactive wizard (new project)
npx bootifyjs new <name> [flags]       → non-interactive
npx bootifyjs my-api                   → bare word = project name (shortcut)
npx bootifyjs generate <type> <name>   → scaffold into an EXISTING project
npx bootifyjs --help | --version

new flags:
  --template <minimal|goals>   project shape (default: minimal)
  --skip-install               don't run npm install
  --yes                        accept all defaults (non-interactive)

generate types: controller, service, repository, event
```

Interactive flow (only when flags are missing):
1. `? Project name (my-api):`
2. `? Template` — numbered select (minimal | goals)
3. `? Run npm install after scaffolding? (Y/n)`

Output ends with concrete next steps:
```
✔ Created my-api
✔ 10 files written (minimal template)
Next steps:
  $ cd my-api && npm run dev
  → http://localhost:3000  (docs: /docs when enabled)
```

## 2. Architecture (src/cli/, zero runtime deps)

```
src/cli/
├── bin.ts                 # entry; require.main guard (commons bin.ts pattern)
├── cli.ts                 # arg parsing, command router, readline prompts
├── generate.ts            # generate command (4 generators, pascal/kebab utils)
└── templates/
    ├── index.ts           # template registry + scaffoldProject()
    ├── minimal.ts-inline  # minimal template (10 files, embedded strings)
    └── goals-template.ts  # AUTO-GENERATED from ~/Documents/goal-setter (38 files)
```

**Zero-dependency principle:** no commander, no chalk, no inquirer —
`node:readline/promises` for prompts, plain string parsing for flags.
Same discipline as `commons/sqlite/bin.ts`.

**bin wiring (package.json):**
```json
"bin": { "bootifyjs": "./dist/cli/bin.js" }
```
`npx bootifyjs` resolves this bin from the published package. Library `main`
(dist/index.js) is unaffected — the bin is purely additive.

## 3. Templates LLD

### 3.1 Placeholder system
- Single token: `{{PROJECT_NAME}}` — replaced in ALL files at scaffold time.
- Generated projects install from **npm**, so local `file:` links from the
  POC are substituted at template-GENERATION time (not scaffold time):
  - `"file:../bootifyjs"` → `"^3.0.0"`
  - `"file:../commons"` → `"^1.3.0"`

### 3.2 `minimal` template (10 files, hand-written)
| File | Contents |
|---|---|
| package.json | scripts dev/build/typecheck/test; deps bootifyjs+reflect-metadata+zod; devDeps vitest+ts-node+typescript |
| tsconfig.json | node16 module/resolution, legacy decorators + emitDecoratorMetadata |
| vitest.config.ts | the tsc-Program decorator plugin (build-parity metadata) |
| .env.example, .gitignore, README.md | docs with the 3 selling points (health, tracing, docs) |
| src/main.ts | the builder chain: createBootify + HelloController + enableCors + enableSwagger |
| src/modules/hello/hello.controller.ts | @Swagger tags, @Schema zod, @CurrentUser-ready |
| tests/setup.ts, tests/integration/hello.test.ts | createTestApp-based suite (happy path + 400) |

### 3.3 `goals` template (38 files, AUTO-GENERATED)
- Derived **mechanically from the GoalSetter POC** (`scripts/generate-goals-template.mjs`)
  so the showcase and the template can never drift apart:
  - `node scripts/generate-goals-template.mjs /path/to/goal-setter`
  - Excludes: node_modules, dist, data, coverage, package-lock.json, .env
  - Substitutions: `goal-setter` → `{{PROJECT_NAME}}`, file: links → npm versions
- Contents: JWT auth (register/login/refresh/logout), goals→milestones
  completion gating, tasks, check-ins + streaks, cached dashboard, admin
  roles, `goal.completed` events, 08:00 digest cron, commons sqlite
  migrations, 23 integration tests.

### 3.4 Scaffold algorithm (`scaffoldProject`)
1. Validate template exists; refuse if target contains a package.json (no clobber)
2. mkdir -p per file; write with placeholder substitution
3. Unless `--skip-install`: spawn `npm install` in the new dir (warn on failure,
   never crash — the note tells the user to run it manually)

## 4. `generate` command LLD

| Type | Emits | 3.0 conventions baked in |
|---|---|---|
| `controller <Name>` | `src/modules/<kebab>/<kebab>.controller.ts` | `@Swagger({ tags })`, `@UseAuth()`, `@CurrentUser()`, `@Schema` zod, ownership via service |
| `service <Name>` | `.../<kebab>.service.ts` | `@Service()`, `NotFoundError` ownership rule |
| `repository <Name>` | `.../<kebab>.repo.ts` | commons `BaseRepo`, `@Autowired(DB_TOKEN)`, `listByUser` + `byUserAndId` |
| `event <Name>` | `.../<kebab>.events.ts` | `@EventListener()` + `@OnEvent('<kebab>.created')`, typed payload |

Rules: pascal/kebab name conversion (`user-task` → `UserTask`/`user-task`);
**never overwrite** an existing file (fail with a clear error); unknown type
prints the available list.

## 5. Status (transparency)

**✅ DONE (implemented + unit-tested, 8/9 passing):**
- `cli.ts` / `bin.ts` (router, prompts, flags, help/version)
- `templates/index.ts` (registry, scaffoldProject, minimal template)
- `generate.ts` (all 4 generators)
- `package.json` bin + keywords + description
- CLI unit tests (9 cases: registry, scaffold both templates, clobber guard,
  all generators, overwrite guard)

**🐛 OPEN BUG (the reason we paused):**
- goals-template package.json is CORRUPT: the generator script's string
  escaping produced `"\"^3.0.0\""` (literal backslashes) → invalid JSON.
  Fix: correct the `.join()` literals in `scripts/generate-goals-template.mjs`,
  regenerate, and add a **JSON-validity guard to the test** (parse every
  generated package.json/vitest.config.ts).

**⬜ REMAINING (after approval):**
1. Fix the escaping bug + regenerate the goals template
2. Test hardening: parse-validate generated JSON files; smoke-run the
   generated minimal project's own `vitest run` (real subprocess) to prove
   generated projects actually work
3. Live `npx bootifyjs` verification (dist bin): `new --template minimal --yes`
   into a temp dir; `generate controller tasks` inside it; `--help/--version`
4. README truth-pass: replace the "Coming Soon / npx bootifyjs-cli" section
   with the real `npx bootifyjs` UX
5. Deprecation note for the old `bootifyjs-cli/` folder (superseded; removal
   in 3.1) — keep for now, document in CHANGELOG
6. Framework full test suite + build green; CHANGELOG entry

## 6. Publish dependency (important)

Generated projects reference `"bootifyjs": "^3.0.0"` — **the CLI's value
depends on publishing 3.0.0 to npm**. Until published, scaffolds install
fine but `npm install` inside them fails on the bootifyjs resolution. The
CLI prints a warning when install fails. Sequence: publish 3.0.0 → CLI is
fully functional for the world.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Template drift from the POC | One-command regeneration script; generation is mechanical |
| `npx bootifyjs` requires 3.0.0 published | Warning on failed install; publish first in launch sequence |
| Interactive prompts in non-TTY (CI) | All flags support full non-interactive mode; prompts skipped with `--yes` |
| Generated vitest config complexity | Same proven tsc-Program pattern as framework + POC; smoke-tested |
| Users' existing files clobbered | Refuse overwrite everywhere (scaffold + generate) |

## 8. Sequencing (remaining work)

| # | Step | Est |
|---|---|---|
| 1 | Fix escaping + regenerate goals template; JSON-validity guard in tests | 0.5h |
| 2 | Generated-project smoke test (subprocess vitest) | 1h |
| 3 | Live `npx bootifyjs` end-to-end verification | 0.5h |
| 4 | README truth-pass + CHANGELOG | 0.5h |
| 5 | Full framework suite green + summary | 0.5h |
