#!/usr/bin/env node
/**
 * CLI entry point (bin). Guards against double execution under CJS.
 */
import { main } from './cli'

const isMain =
  typeof require !== 'undefined' &&
  typeof require.main !== 'undefined' &&
  require.main === module

if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`✗ ${(error as Error).message}`)
    process.exitCode = 1
  })
}
