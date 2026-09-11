import 'reflect-metadata'

const realExit = process.exit.bind(process)

// Library code must never call process.exit() — it should throw typed errors
// (see LLD-PLAN.md principle 3). Fail loudly if any code path tries.
;(process as any).exit = (code?: number) => {
  throw new Error(
    `process.exit(${code}) called during tests — throw a typed BootifyError instead`
  )
}

export { realExit }
