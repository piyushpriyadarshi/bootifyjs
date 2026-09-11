# Contributing to BootifyJS

Thanks for helping make BootifyJS flagship-grade. The rules are few and strict.

## Setup

```bash
npm install
npm test          # vitest run
npm run test:watch
npm run typecheck # tsc over src + tests
npm run build     # emits dist/
```

CI runs typecheck → test → build on Node 22 and 24. A PR is green only when all
three pass locally too.

## Non-negotiable principles

1. **No `process.exit()` in library code.** Throw a typed `BootifyError`
   subclass (see `src/core/errors.ts`). Let the host application decide how to fail.
2. **No dead code.** Delete it. Git remembers; the working tree should not.
3. **No import cycles.** Shared symbols live in leaf modules (see
   `di-container.ts` / `decorators.ts` for the pattern). Cycles break under ESM
   and vitest's SSR transform even when CJS tolerates them.
4. **Injected dependencies.** No `process.env` reads or `Date.now()` calls buried
   in constructors — accept clock/config through options with sensible defaults.
5. **Tests are the contract.** Every behavior change ships with tests that assert
   real state, not mock interactions. Deterministic: fake timers for time, fakes
   for I/O (see `tests/helpers/`).
6. **`import type` for type-only imports.** The vitest transform uses
   `ts.transpileModule`, which cannot elide value-imports of types.

## Module layout

- `src/core` — DI container, decorators, router, request context, error taxonomy
- `src/{events,cache,scheduling,auth,logging,config,middleware}` — feature modules
- `tests/unit/<module>` and `tests/integration` — mirrored to source layout
- Fakes and helpers shared by tests and users live in `tests/helpers/` (the
  future `bootifyjs/testing` export)

## Commits & releases

- Conventional commit style: `feat(core): ...`, `fix(cache): ...`,
  `refactor(events): ...`, `test(auth): ...`, `chore: ...`
- Breaking changes must include a CHANGELOG entry under **Changed**/**Removed**
  with a migration note. Deprecate first, remove in the next major.

### Publishing (staged)

Releases never publish directly from CI. Pushing a `v*` tag triggers the
**Stage Publish** workflow, which typechecks, tests, builds and *stages* the
version on npm without 2FA. A maintainer then approves it, which is where
proof-of-presence happens:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z   # CI stages
npx npm@^11.19.1 stage list                                # find the stage id
npx npm@^11.19.1 stage approve <stage-id>                  # prompts for OTP → publishes
```

`npm stage` needs npm ≥ 11.19 (or use the Staged Packages page on npmjs.com).
Setup: add a granular access token with **stage-only** write access to
`bootifyjs` as the `NPM_TOKEN` repository secret — no bypass-2FA required.
