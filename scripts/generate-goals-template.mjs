// Regenerates src/cli/templates/goals-template.ts from ~/Documents/goal-setter
import fs from 'node:fs'
import path from 'node:path'

const SRC = process.argv[2] ?? new URL('../../goal-setter', import.meta.url).pathname

// Strict allowlist — the POC repo also contains local-only material (Bruno
// collections with real credentials, data, coverage…) that must NEVER ship.
const INCLUDE_DIRS = new Set(['src', 'tests', 'migrations'])
const INCLUDE_ROOT_FILES = new Set(['package.json', 'README.md', 'tsconfig.json', 'vitest.config.ts'])
const INCLUDE_DOTFILES = new Set(['.env.example', '.gitignore'])

const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'data', 'coverage', 'dist-test'])
const EXCLUDE_FILES = new Set(['package-lock.json', 'onGoalCompleted', '.env'])

const files = {}
function walk(dir, rel = '') {
  const isRoot = rel === ''
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const relPath = path.join(rel, entry.name).split(path.sep).join('/')

    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue
      if (isRoot && !INCLUDE_DIRS.has(entry.name)) continue
      walk(full, relPath)
      continue
    }

    if (EXCLUDE_FILES.has(entry.name)) continue
    if (entry.name.startsWith('.')) {
      if (!INCLUDE_DOTFILES.has(entry.name)) continue
    } else if (isRoot && !INCLUDE_ROOT_FILES.has(entry.name)) {
      continue
    }

    const content = fs.readFileSync(full, 'utf8')
    let templated = content
    if (['package.json', 'README.md'].includes(entry.name)) {
      templated = templated
        .split('goal-setter').join('{{PROJECT_NAME}}')
        // generated projects install from npm, not local file: links
        .split('"file:../bootifyjs"').join('"^3.0.0"')
        .split('"file:../commons"').join('"^1.3.0"')
    }
    files[relPath] = templated
  }
}
walk(SRC)
const out = `/**
 * AUTO-GENERATED from the GoalSetter POC (${SRC}).
 * Regenerate with: node scripts/generate-goals-template.mjs
 */
export const GOALS_TEMPLATE_FILES: Record<string, string> = ${JSON.stringify(files, null, 2)}
`
fs.writeFileSync(new URL('../src/cli/templates/goals-template.ts', import.meta.url).pathname, out)
console.log('goals template:', Object.keys(files).length, 'files')
