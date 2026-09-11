import { afterEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { scaffoldProject, TEMPLATES } from '../../../src/cli/templates'
import { generateComponent, GENERATORS } from '../../../src/cli/generate'
import { main } from '../../../src/cli/cli'

const created: string[] = []

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootify-cli-'))
  created.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of created.reverse()) fs.rmSync(dir, { recursive: true, force: true })
  created.length = 0
})

describe('CLI argument handling', () => {
  it('new <name> --yes defaults to the minimal template (regression)', async () => {
    const base = tmpDir()
    const prevCwd = process.cwd()
    const prevExitCode = process.exitCode
    process.chdir(base)
    try {
      await main(['new', 'cli-smoke', '--yes', '--skip-install'])

      expect(process.exitCode ?? 0).toBe(0)
      expect(fs.existsSync(path.join(base, 'cli-smoke', 'src/main.ts'))).toBe(true)
      // minimal template, not goals (goals ships migrations/)
      expect(fs.existsSync(path.join(base, 'cli-smoke', 'migrations'))).toBe(false)
    } finally {
      process.chdir(prevCwd)
      process.exitCode = prevExitCode
    }
  })

  it('--template goals is honored in non-interactive mode', async () => {
    const base = tmpDir()
    const prevCwd = process.cwd()
    const prevExitCode = process.exitCode
    process.chdir(base)
    try {
      await main(['new', 'cli-goals', '--template', 'goals', '--yes', '--skip-install'])

      expect(process.exitCode ?? 0).toBe(0)
      expect(fs.existsSync(path.join(base, 'cli-goals', 'migrations/001_init.sql'))).toBe(true)
    } finally {
      process.chdir(prevCwd)
      process.exitCode = prevExitCode
    }
  })
})

describe('templates registry', () => {
  it('exposes the tour (minimal) and goals templates', () => {
    expect(Object.keys(TEMPLATES).sort()).toEqual(['goals', 'minimal'])
    expect(TEMPLATES.minimal.description).toContain('tour')
    expect(Object.keys(TEMPLATES.minimal.files)).toContain('src/main.ts')
    expect(Object.keys(TEMPLATES.minimal.files)).toContain('src/modules/auth/auth.module.ts')
    expect(Object.keys(TEMPLATES.minimal.files)).toContain('src/modules/hello/hello.events.ts')
    expect(Object.keys(TEMPLATES.goals.files)).toContain('src/main.ts')
    expect(Object.keys(TEMPLATES.goals.files)).toContain('migrations/001_init.sql')
    expect(Object.keys(TEMPLATES.goals.files).length).toBeGreaterThan(30)
  })

  it('every template emits valid JSON config files', () => {
    for (const [name, template] of Object.entries(TEMPLATES)) {
      for (const [file, content] of Object.entries(template.files)) {
        if (file === 'package.json' || file === 'tsconfig.json') {
          const parsed = JSON.parse(content.replace(/\{\{PROJECT_NAME\}\}/g, 'test-app'))
          if (file === 'package.json') {
            expect(parsed.dependencies?.bootifyjs ?? parsed.devDependencies?.bootifyjs).toBeDefined()
          }
        }
      }
      void name
    }
  })

  it('rejects unknown templates', async () => {
    await expect(
      scaffoldProject({ name: 'x', template: 'nope', skipInstall: true }, tmpDir())
    ).rejects.toThrow(/Unknown template/)
  })
})

describe('scaffoldProject', () => {
  it('scaffolds the minimal template with placeholders replaced', async () => {
    const base = tmpDir()
    const result = await scaffoldProject(
      { name: 'my-api', template: 'minimal', skipInstall: true },
      base
    )

    const dir = path.join(base, 'my-api')
    expect(result.dir).toBe(dir)
    expect(result.filesWritten).toBe(Object.keys(TEMPLATES.minimal.files).length)

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('my-api')

    const main = fs.readFileSync(path.join(dir, 'src/main.ts'), 'utf8')
    expect(main).toContain("createBootifyApp()")
    expect(main).toContain(".setServiceName('my-api')")
    expect(main).toContain('.enableAuth(')
    expect(main).toContain('bootstrapEventSystem')
    expect(main).not.toContain('{{PROJECT_NAME}}')

    // tour files present
    expect(fs.existsSync(path.join(dir, '.gitignore'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'tests/integration/hello.test.ts'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'src/modules/hello/hello.events.ts'))).toBe(true)

    // the generated hello test exercises the full decorator tour
    const testSource = fs.readFileSync(path.join(dir, 'tests/integration/hello.test.ts'), 'utf8')
    expect(testSource).toContain('createTestApp')
    expect(testSource).toContain('/auth/login')
  })

  it('refuses to scaffold into an existing project', async () => {
    const base = tmpDir()
    await scaffoldProject({ name: 'dup', template: 'minimal', skipInstall: true }, base)
    await expect(
      scaffoldProject({ name: 'dup', template: 'minimal', skipInstall: true }, base)
    ).rejects.toThrow(/already contains/)
  })

  it('scaffolds the goals template (the full POC)', async () => {
    const base = tmpDir()
    const result = await scaffoldProject(
      { name: 'goal-app', template: 'goals', skipInstall: true },
      base
    )

    const dir = path.join(base, 'goal-app')
    expect(result.filesWritten).toBeGreaterThan(30)

    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('goal-app')
    expect(pkg.dependencies.bootifyjs).toBe('^3.0.0')

    const main = fs.readFileSync(path.join(dir, 'src/main.ts'), 'utf8')
    expect(main).toContain('.enableAuth(')
    expect(main).toContain('bootstrapEventSystem')

    expect(fs.existsSync(path.join(dir, 'migrations/001_init.sql'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'src/modules/goals/goal.service.ts'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'src/events/goal-events.ts'))).toBe(true)
    // no lockfile / coverage junk
    expect(fs.existsSync(path.join(dir, 'package-lock.json'))).toBe(false)
  })
})

describe('generateComponent', () => {
  it('generates controller + service + repository + event with 3.0 conventions', () => {
    const base = tmpDir()

    const controller = generateComponent('controller', 'user-task', base)
    const controllerPath = path.join(base, controller.files[0])
    const controllerSource = fs.readFileSync(controllerPath, 'utf8')
    expect(controllerSource).toContain("@Controller('/user-tasks')")
    expect(controllerSource).toContain("@Swagger({ tags: ['UserTask'] })")
    expect(controllerSource).toContain('@UseAuth()')
    expect(controllerSource).toContain('@CurrentUser()')

    const service = generateComponent('service', 'user-task', base)
    const serviceSource = fs.readFileSync(path.join(base, service.files[0]), 'utf8')
    expect(serviceSource).toContain('@Service()')
    expect(serviceSource).toContain('NotFoundError')

    const repo = generateComponent('repository', 'user-task', base)
    const repoSource = fs.readFileSync(path.join(base, repo.files[0]), 'utf8')
    expect(repoSource).toContain('extends BaseRepo')
    expect(repoSource).toContain("@Autowired(DB_TOKEN)")
    expect(repoSource).toContain("super('user-tasks'")

    const event = generateComponent('event', 'user-task', base)
    const eventSource = fs.readFileSync(path.join(base, event.files[0]), 'utf8')
    expect(eventSource).toContain("@EventListener()")
    expect(eventSource).toContain("@OnEvent('user-task.created')")
  })

  it('refuses to overwrite existing files', () => {
    const base = tmpDir()
    generateComponent('controller', 'dup', base)
    expect(() => generateComponent('controller', 'dup', base)).toThrow(/Refusing to overwrite/)
  })

  it('rejects unknown generators with the available list', () => {
    const base = tmpDir()
    expect(() => generateComponent('graphql', 'x', base)).toThrow(/controller, service, repository, event/)
  })

  it('exposes exactly the documented generator types', () => {
    expect(Object.keys(GENERATORS).sort()).toEqual(['controller', 'event', 'repository', 'service'])
  })
})
