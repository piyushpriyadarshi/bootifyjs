import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import { DECORATOR_GLOBS } from './scripts/decorator-globs'

/**
 * BootifyJS relies on legacy experimental decorators + emitDecoratorMetadata
 * across the whole src tree (DI constructor injection reads `design:paramtypes`).
 * Vitest's oxc transform strips types but never emits `design:*` metadata — and
 * `ts.transpileModule` cannot either, because decorator metadata emission
 * requires the type checker.
 *
 * So this plugin maintains a real `ts.Program` (built once per worker over all
 * src/tests files) and emits each file through it — the same checker-driven
 * transform `npm run build` uses. If a not-yet-seen file is requested, the
 * program is rebuilt with it included.
 *
 * Map is omitted on purpose: vite's SSR transform rebuilds (rather than chains)
 * plugin maps, which mis-attributes coverage. Identity mapping is exercised by
 * the tests, so remapping would only add drift.
 */

const ROOT = __dirname
const PROGRAM_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2021,
  lib: ['ES2021'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  experimentalDecorators: true,
  emitDecoratorMetadata: true,
  esModuleInterop: true,
  skipLibCheck: true,
  allowJs: false,
}

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'dist-test') {
        continue
      }
      collectTsFiles(full, acc)
    } else if (entry.name.endsWith('.ts')) {
      acc.push(full)
    }
  }
  return acc
}

let program: ts.Program | undefined
const knownFiles = new Set<string>()

function getProgram(requestedFile: string): ts.Program {
  const fileIsKnown = knownFiles.has(requestedFile)
  if (program !== undefined && (fileIsKnown || !fs.existsSync(requestedFile))) {
    return program
  }

  if (program === undefined) {
    for (const file of collectTsFiles(path.join(ROOT, 'src'))) knownFiles.add(file)
    for (const file of collectTsFiles(path.join(ROOT, 'tests'))) knownFiles.add(file)
  }
  knownFiles.add(requestedFile)

  program = ts.createProgram({ rootNames: [...knownFiles], options: PROGRAM_OPTIONS })
  return program
}

function emitWithChecker(program: ts.Program, fileName: string, fallback: string): string {
  const sourceFile = program.getSourceFile(fileName)
  if (!sourceFile) return fallback

  let output: string | undefined
  const writeFile: ts.WriteFileCallback = (_name, text) => {
    if (!_name.endsWith('.d.ts') && output === undefined) {
      output = text
    }
  }

  program.emit(sourceFile, writeFile)

  return output ?? fallback
}

function tscTranspile(): Plugin {
  return {
    name: 'tsc-transpile-decorators',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.ts') || id.includes('node_modules')) {
        return null
      }
      const cleanId = id.replace(/\?.*$/, '').replace(/^file:\/\//, '')
      if (!DECORATOR_GLOBS.some((glob) => glob.test(cleanId))) {
        return null
      }

      const absolute = path.isAbsolute(cleanId) ? cleanId : path.resolve(ROOT, cleanId)
      const checkedProgram = getProgram(absolute)
      const outputText = emitWithChecker(checkedProgram, absolute, code)

      return { code: outputText, map: null }
    },
  }
}

export default defineConfig({
  plugins: [tscTranspile()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Demo apps, type-only declarations, and the worker entry (covered by
      // the gated integration test instead of unit tests).
      exclude: [
        'src/examples/**',
        'src/auth/examples/**',
        'src/types/**',
        'src/cluster.ts',
        'src/events/worker/event-processor.worker.ts',
      ],
      thresholds: {
        lines: 60,
        statements: 60,
        branches: 65,
        functions: 60,
      },
    },
  },
})
