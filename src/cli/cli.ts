/**
 * BootifyJS CLI — invoked via `npx bootifyjs`.
 *
 * Zero runtime dependencies: hand-rolled arg parsing (same pattern as the
 * commons sqlite bin) and node:readline prompts.
 */
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { VERSION } from '../version'
import { scaffoldProject, NewProjectOptions, TEMPLATES } from './templates'
import { generateComponent, GENERATORS } from './generate'

const HELP = `
🚀 BootifyJS CLI (v${VERSION})

Usage:
  npx bootifyjs                          Interactive project wizard
  npx bootifyjs new <name> [options]     Create a new project
  npx bootifyjs generate <type> <name>   Scaffold into an existing project
  npx bootifyjs --help | --version

New project options:
  --template <minimal|goals>   Project template (default: minimal)
  --skip-install               Do not run npm install
  --yes                        Accept all defaults (non-interactive)

Generate types: ${Object.keys(GENERATORS).join(', ')}

Examples:
  npx bootifyjs new my-api --template goals --yes
  npx bootifyjs generate controller tasks
  npx bootifyjs generate event goal.completed
`

async function prompt(question: string, defaultValue: string): Promise<string> {
  const rl = readline.createInterface({ input, output })
  try {
    const answer = await rl.question(`${question} (${defaultValue}): `)
    return answer.trim() || defaultValue
  } finally {
    rl.close()
  }
}

async function promptConfirm(question: string, defaultValue: boolean): Promise<boolean> {
  const answer = await prompt(question, defaultValue ? 'Y' : 'n')
  return /^y(es)?$/i.test(answer.trim())
}

async function promptSelect(question: string, options: string[], defaultValue: string): Promise<string> {
  console.log(`${question}`)
  options.forEach((opt, i) => console.log(`  ${opt === defaultValue ? '›' : ' '} ${i + 1}. ${opt}`))
  const answer = await prompt('Choose', defaultValue)
  if (options.includes(answer)) return answer
  const index = parseInt(answer, 10)
  if (!Number.isNaN(index) && options[index - 1]) return options[index - 1]
  return defaultValue
}

interface NewArgs {
  name?: string
  template: string
  skipInstall: boolean
  yes: boolean
}

async function runNew(args: NewArgs): Promise<void> {
  let name = args.name
  let template = args.template
  let skipInstall = args.skipInstall

  if (!args.yes) {
    if (!name) name = await prompt('Project name', 'my-api')
    if (!args.template) {
      template = await promptSelect('Template', Object.keys(TEMPLATES), 'minimal')
    }
    if (!args.skipInstall && args.template === undefined && args.name === undefined) {
      skipInstall = !(await promptConfirm('Run npm install after scaffolding?', true))
    }
  }

  if (!name) {
    console.error('✗ Project name is required (npx bootifyjs new <name>)')
    process.exitCode = 1
    return
  }
  if (!TEMPLATES[template]) {
    console.error(`✗ Unknown template '${template}'. Available: ${Object.keys(TEMPLATES).join(', ')}`)
    process.exitCode = 1
    return
  }

  const options: NewProjectOptions = { name, template, skipInstall }
  const result = await scaffoldProject(options, process.cwd())

  console.log(`\n✔ Created ${result.dir}`)
  console.log(`✔ ${result.filesWritten} files written (${template} template)`)
  if (!skipInstall) {
    console.log('✔ Dependencies installed')
  }

  const tips =
    template === 'goals'
      ? ['The first registered user becomes admin.', 'Demo app: goals, milestones, tasks, daily check-ins.']
      : ['Demo login: POST /auth/login { "username": "demo", "password": "demo123" }.']

  console.log(`\nNext steps:
  $ cd ${name}
  $ npm run dev
  → http://localhost:3000  (docs: /docs when enabled)

${tips.map((t) => `• ${t}`).join('\n')}
`)
}

function runGenerate(type: string | undefined, name: string | undefined): void {
  if (!type || !name) {
    console.error('✗ Usage: npx bootifyjs generate <type> <name>')
    console.error(`  Types: ${Object.keys(GENERATORS).join(', ')}`)
    process.exitCode = 1
    return
  }
  try {
    const result = generateComponent(type, name, process.cwd())
    for (const file of result.files) {
      console.log(`  ✓ ${file}`)
    }
    console.log(`✔ Generated ${type} '${name}' (${result.files.length} files)`)
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`)
    process.exitCode = 1
  }
}

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP)
    return
  }
  if (command === '--version' || command === '-v') {
    console.log(VERSION)
    return
  }

  if (command === 'new') {
    const name = rest.find((a) => !a.startsWith('--'))
    const flags = rest.filter((a) => a.startsWith('--'))
    const getFlag = (flag: string): string | undefined => {
      const inline = flags.find((f) => f.startsWith(`--${flag}=`))
      if (inline) return inline.split('=')[1]
      // support space-separated form too: --template minimal
      const index = rest.indexOf(`--${flag}`)
      if (index !== -1 && rest[index + 1] && !rest[index + 1].startsWith('--')) {
        return rest[index + 1]
      }
      return undefined
    }
    await runNew({
      name,
      template: getFlag('template') ?? '',
      skipInstall: flags.includes('--skip-install'),
      yes: flags.includes('--yes') || flags.includes('--skip-install'),
    })
    return
  }

  if (command === 'generate' || command === 'g') {
    const positional = rest.filter((a) => !a.startsWith('--'))
    runGenerate(positional[0], positional[1])
    return
  }

  // No recognized command — treat a bare word as a project name (npx bootifyjs my-api)
  if (!command.startsWith('-')) {
    await runNew({ name: command, template: '', skipInstall: false, yes: false })
    return
  }

  console.error(`✗ Unknown option '${command}'`)
  console.log(HELP)
  process.exitCode = 1
}
