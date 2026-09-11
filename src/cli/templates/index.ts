/**
 * Project templates. File contents are embedded as strings so the compiled
 * `dist/cli` is fully self-contained (tsc does not copy asset files).
 * `{{PROJECT_NAME}}` is replaced during scaffolding.
 *
 * ⚠ Escaping rules inside these template literals:
 *   - backticks -> \`
 *   - ${        -> \${   (generated code containing template literals)
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { GOALS_TEMPLATE_FILES } from './goals-template'

export interface NewProjectOptions {
  name: string
  template: string
  skipInstall: boolean
}

export interface ScaffoldResult {
  dir: string
  filesWritten: number
}

export interface TemplateDefinition {
  description: string
  files: Record<string, string>
}

// ---------------------------------------------------------------------------
// shared generated-project config
// ---------------------------------------------------------------------------

const TS_CONFIG = `{
  "compilerOptions": {
    "target": "ES2021",
    "module": "node16",
    "moduleResolution": "node16",
    "lib": ["ES2021"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
`

const VITEST_CONFIG = `import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

/**
 * BootifyJS uses legacy decorators + emitDecoratorMetadata. oxc (vitest's
 * transform) cannot emit design:* metadata, so this plugin transpiles
 * project files through a real ts.Program — the same transform that
 * "npm run build" uses.
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
}

function collectTsFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
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

function tscTranspile(): Plugin {
  return {
    name: 'tsc-transpile-decorators',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.ts') || id.includes('node_modules')) return null
      const cleanId = id.replace(/\\?.*$/, '').replace(/^file:\\/\\//, '')
      if (!/(^|[\\\\/])(src|tests)[\\\\/].*\\.ts$/.test(cleanId)) return null
      const absolute = path.isAbsolute(cleanId) ? cleanId : path.resolve(ROOT, cleanId)
      const checked = getProgram(absolute)
      const source = checked.getSourceFile(absolute)
      if (!source) return null
      let output: string | undefined
      checked.emit(source, (_name, text) => {
        if (!_name.endsWith('.d.ts') && output === undefined) output = text
      })
      return { code: output ?? code, map: null }
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
  },
})
`

const GITIGNORE = `node_modules/
dist/
.env
coverage/
`

const TEST_SETUP = `import 'reflect-metadata'
`

// ---------------------------------------------------------------------------
// tour template — "very simple yet robust": every core decorator in one app
// ---------------------------------------------------------------------------

const TOUR_PACKAGE_JSON = `{
  "name": "{{PROJECT_NAME}}",
  "version": "1.0.0",
  "description": "{{PROJECT_NAME}} — a BootifyJS service (framework tour)",
  "main": "dist/main.js",
  "scripts": {
    "dev": "ts-node src/main.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "bootifyjs": "^3.0.0",
    "dotenv": "^17.2.1",
    "reflect-metadata": "^0.2.2",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/node": "^24.1.0",
    "@vitest/coverage-v8": "^3.2.4",
    "ts-node": "^10.9.2",
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
`

const TOUR_ENV = `PORT=3000
JWT_ACCESS_SECRET=change-me-access-secret-min-16-chars
JWT_REFRESH_SECRET=change-me-refresh-secret-min-16-chars
NODE_ENV=development
`

const TOUR_MAIN = `import 'reflect-metadata'
import 'dotenv/config'
import { createBootifyApp } from 'bootifyjs'
import { bootstrapEventSystem } from 'bootifyjs/events'
import { AuthController, findDemoUser, validateDemoCredentials } from './modules/auth/auth.module'
import { HelloController } from './modules/hello/hello.controller'
import { HelloEventsHandler } from './modules/hello/hello.events'

// ---------------------------------------------------------------------------
// The WHOLE app lives in this builder chain.
//
// Default-ON (nothing to do):
//   GET /health, x-request-id tracing, structured logs, graceful shutdown,
//   zod validation errors mapped to 400 with issue details.
//
// Opt-in below: CORS, Swagger docs, JWT auth.
// ---------------------------------------------------------------------------
async function main() {
  const app = await createBootifyApp()
    .setServiceName('{{PROJECT_NAME}}')
    .setPort(Number(process.env.PORT) || 3000)
    .useControllers([HelloController, AuthController])
    .enableCors()                     // dev-safe; pass { origin: [...] } in prod
    .enableSwagger({ path: '/docs' }) // UI generated from your zod schemas
    .enableAuth({                     // JWT; secrets come from .env
      accessTokenSecret: process.env.JWT_ACCESS_SECRET!,
      refreshTokenSecret: process.env.JWT_REFRESH_SECRET!,
      userProvider: findDemoUser,
      credentialValidator: validateDemoCredentials,
    })
    .beforeStart(async () => {
      // wires @EventListener handlers onto the event bus
      await bootstrapEventSystem([HelloEventsHandler])
    })
    .build()

  await app.start()
  // http://localhost:3000/docs — your API, fully documented
  // Demo login: POST /auth/login { "username": "demo", "password": "demo123" }
}

main().catch((error) => {
  console.error('Failed to start:', error)
  process.exitCode = 1
})
`

const TOUR_AUTH_MODULE = `import {
  Controller, Post, Body, Schema, Swagger, Autowired, UnauthorizedError,
} from 'bootifyjs'
import { AuthManager } from 'bootifyjs/auth'
import { z } from 'zod'

// ─── Demo identity ─────────────────────────────────────────────────────────
// A real app swaps this for a users table. The shape matches what BootifyJS
// auth strategies expect (roles drive @Roles()).
export interface DemoUser {
  id: string
  username: string
  roles: string[]
  permissions: string[]
  createdAt: Date
}

export const DEMO_USER: DemoUser = {
  id: 'demo-1',
  username: 'demo',
  roles: ['admin'],
  permissions: [],
  createdAt: new Date(),
}

export async function validateDemoCredentials(credentials: {
  username?: string
  password?: string
}): Promise<DemoUser | null> {
  // Demo credentials: demo / demo123 (replace with your real auth)
  if (credentials.username === 'demo' && credentials.password === 'demo123') {
    return DEMO_USER
  }
  return null
}

export async function findDemoUser(userId: string): Promise<DemoUser | null> {
  return userId === DEMO_USER.id ? DEMO_USER : null
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

// ─── Login route ───────────────────────────────────────────────────────────
// enableAuth() registered an AuthManager for us. authenticate() verifies
// credentials through credentialValidator above and returns a token pair.
@Swagger({ tags: ['Auth'] })
@Controller('/auth')
export class AuthController {
  @Autowired(AuthManager)
  private readonly authManager!: AuthManager

  @Post('/login')
  @Swagger({ summary: 'Login (demo credentials: demo / demo123)' })
  @Schema({ body: loginSchema })
  async login(@Body() body: { username: string; password: string }) {
    const result = await this.authManager.authenticate({
      type: 'login',
      strategy: 'jwt',
      request: {},
      headers: {},
      body,
    })

    if (!result.success) {
      throw new UnauthorizedError(result.error ?? 'Invalid credentials')
    }
    return { user: result.user, tokens: result.tokens }
  }
}
`

const TOUR_HELLO_CONTROLLER = `import {
  Controller, Get, Post, Body, Schema, Swagger, UseAuth, Public, CurrentUser, HttpError,
} from 'bootifyjs'
import { z } from 'zod'
import { HelloService } from './hello.service'

const greetSchema = z.object({
  name: z.string().min(1).max(80),
})

// ─── A controller, end to end ──────────────────────────────────────────────
// - @Swagger        groups routes in /docs (controller + method tags merge)
// - @UseAuth        on the class protects EVERY route; @Public opts a route out
// - @Schema         one zod schema = validation AND OpenAPI docs
// - @CurrentUser    injects the verified JWT payload
// - HttpError       typed errors carry an HTTP status (mapped by the default
//                   error handler — no reply.status() ceremony)
@Swagger({ tags: ['Hello'], description: 'A guided tour of BootifyJS' })
@UseAuth()
@Controller('/hello')
export class HelloController {
  constructor(private readonly hello: HelloService) {}

  @Get('/public')
  @Public() // opts out of the class-level @UseAuth — no token needed
  @Swagger({ summary: 'No token needed' })
  publicHello() {
    return { message: 'Hello from {{PROJECT_NAME}}! No token required.' }
  }

  @Post('/greet')
  @Swagger({ summary: 'Greet someone (emits hello.greeted on the event bus)' })
  @Schema({ body: greetSchema })
  greet(@Body() body: { name: string }, @CurrentUser() user: any) {
    return this.hello.greet(body.name, user?.sub)
  }

  @Get('/me')
  @Swagger({ summary: 'Who am I? (decoded from the verified token)' })
  me(@CurrentUser() user: any) {
    return { userId: user?.sub, roles: user?.roles }
  }

  @Get('/teapot')
  @Swagger({ summary: 'Typed errors carry an HTTP status' })
  teapot() {
    throw new HttpError(418, "I'm a teapot")
  }
}
`

const TOUR_HELLO_SERVICE = `import { Service, Autowired, Cacheable, EventBusService } from 'bootifyjs'
import type { IEvent } from 'bootifyjs/events'

export interface GreetedEventPayload {
  name: string
  userId?: string
}

// ─── Services live in the DI container ─────────────────────────────────────
// @Service registers the class; constructor params and @Autowired properties
// are resolved by the container automatically.
@Service()
export class HelloService {
  @Autowired(EventBusService)
  private readonly events!: EventBusService

  greet(name: string, userId?: string) {
    const payload: GreetedEventPayload = { name, userId }
    // Fire-and-forget: any @EventListener for 'hello.greeted' reacts.
    this.events.emit({ type: 'hello.greeted', payload } as IEvent)

    return {
      greeting: \`Hello, \${name}!\`,
      greetedBy: userId ?? 'anonymous',
    }
  }

  /** @Cacheable caches the result for 60s — key: hello.stats::<args> */
  @Cacheable({ key: 'hello.stats', ttl: 60 })
  async stats() {
    // Pretend this is expensive. Second call within the TTL is served
    // from cache (the uptime number below will "freeze" for 60s).
    return {
      uptimeSeconds: Math.floor(process.uptime()),
      tip: 'This response is cached for 60 seconds — call me twice!',
    }
  }
}
`

const TOUR_HELLO_EVENTS = `import { EventListener, OnEvent, Service, getLogger } from 'bootifyjs'
import type { IEvent } from 'bootifyjs/events'
import type { GreetedEventPayload } from './hello.service'

// ─── React to domain events ────────────────────────────────────────────────
// bootstrapEventSystem([HelloEventsHandler]) in main.ts wires this handler
// onto the event bus. Structured logs automatically carry the requestId.
@Service()
@EventListener()
export class HelloEventsHandler {
  @OnEvent('hello.greeted')
  onGreeted(event: IEvent): void {
    const payload = event.payload as GreetedEventPayload
    getLogger().info('hello.greeted', {
      logType: 'event',
      name: payload.name,
      greetedBy: payload.userId ?? 'anonymous',
    })
  }
}
`

const TOUR_README = `# {{PROJECT_NAME}}

A [BootifyJS](https://github.com/piyushpriyadarshi/bootifyjs) service — this
project is a guided tour of the framework.

\`\`\`bash
npm install
cp .env.example .env
npm run dev        # http://localhost:3000 — docs at /docs
npm test
\`\`\`

**Demo login:** \`POST /auth/login\` with \`{ "username": "demo", "password": "demo123" }\`

## Learn the framework in 5 files

| File | What it teaches |
|---|---|
| \`src/main.ts\` | The whole app: builder chain, default-ON features, opt-ins |
| \`src/modules/auth/auth.module.ts\` | Login over \`AuthManager\`; issuing JWTs |
| \`src/modules/hello/hello.controller.ts\` | \`@Controller\`, \`@Get/@Post\`, \`@Schema\` (zod), \`@Swagger\`, \`@UseAuth\`, \`@Public\`, \`@CurrentUser\`, \`HttpError\` |
| \`src/modules/hello/hello.service.ts\` | \`@Service\`, \`@Autowired\`, \`@Cacheable\`, emitting events |
| \`src/modules/hello/hello.events.ts\` | \`@EventListener\` + \`@OnEvent\` |

## Built-in, zero-config

- \`GET /health\` — liveness probe
- \`x-request-id\` on every response (reused from incoming requests — tracing)
- Structured logs with requestId context
- Zod validation errors → 400 with issue details
- Graceful shutdown on SIGTERM/SIGINT

## Next steps

- Swap the demo user in \`src/modules/auth/auth.module.ts\` for a real user store
- Generate more modules: \`npx bootifyjs generate controller tasks\`
- Full-feature example (DB, events, scheduling): the \`goals\` template
`

const TOUR_TEST = `import { afterAll, describe, expect, it } from 'vitest'
import { createTestApp } from 'bootifyjs/testing'
import { HelloController } from '../../src/modules/hello/hello.controller'
import {
  AuthController, findDemoUser, validateDemoCredentials,
} from '../../src/modules/auth/auth.module'

const app = await createTestApp({
  controllers: [HelloController, AuthController],
  setup: (a) => {
    a.enableSwagger()
    a.enableAuth({
      accessTokenSecret: 'test-access-secret-123456',
      refreshTokenSecret: 'test-refresh-secret-123456',
      userProvider: findDemoUser,
      credentialValidator: validateDemoCredentials,
    })
  },
})

afterAll(async () => {
  await app.close()
})

async function login(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: 'demo', password: 'demo123' },
  })
  return res.json().tokens.accessToken
}

describe('hello tour', () => {
  it('public route needs no token', async () => {
    const res = await app.inject({ method: 'GET', url: '/hello/public' })
    expect(res.statusCode).toBe(200)
  })

  it('protected routes return 401 without a token, 200 with one', async () => {
    const denied = await app.inject({ method: 'GET', url: '/hello/me' })
    expect(denied.statusCode).toBe(401)

    const token = await login()
    const allowed = await app.inject({
      method: 'GET',
      url: '/hello/me',
      headers: { authorization: \`Bearer \${token}\` },
    })
    expect(allowed.statusCode).toBe(200)
    expect(allowed.json().userId).toBe('demo-1')
  })

  it('greets and emits the event', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'POST',
      url: '/hello/greet',
      headers: { authorization: \`Bearer \${token}\` },
      payload: { name: 'Piyush' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().greeting).toBe('Hello, Piyush!')
  })

  it('validates the body (400 with issues)', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'POST',
      url: '/hello/greet',
      headers: { authorization: \`Bearer \${token}\` },
      payload: { name: '' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.stringify(res.json().issues)).toContain('name')
  })

  it('maps HttpError to its status', async () => {
    const token = await login()
    const res = await app.inject({
      method: 'GET',
      url: '/hello/teapot',
      headers: { authorization: \`Bearer \${token}\` },
    })
    expect(res.statusCode).toBe(418)
  })
})
`

const TOUR_TEMPLATE: TemplateDefinition = {
  description: 'Guided tour: every core decorator + auth + docs + events in one small app',
  files: {
    'package.json': TOUR_PACKAGE_JSON,
    'tsconfig.json': TS_CONFIG,
    'vitest.config.ts': VITEST_CONFIG,
    '.env.example': TOUR_ENV,
    '.gitignore': GITIGNORE,
    'README.md': TOUR_README,
    'src/main.ts': TOUR_MAIN,
    'src/modules/auth/auth.module.ts': TOUR_AUTH_MODULE,
    'src/modules/hello/hello.controller.ts': TOUR_HELLO_CONTROLLER,
    'src/modules/hello/hello.service.ts': TOUR_HELLO_SERVICE,
    'src/modules/hello/hello.events.ts': TOUR_HELLO_EVENTS,
    'tests/setup.ts': TEST_SETUP,
    'tests/integration/hello.test.ts': TOUR_TEST,
  },
}

// ---------------------------------------------------------------------------
// goals template — the full GoalSetter POC (auth + goals + events + digest)
// ---------------------------------------------------------------------------

const GOALS_TEMPLATE: TemplateDefinition = {
  description: 'Full POC: JWT auth, goals/milestones/tasks/checkins, events, digest cron',
  files: GOALS_TEMPLATE_FILES,
}

// ---------------------------------------------------------------------------
// scaffolding
// ---------------------------------------------------------------------------

export const TEMPLATES: Record<string, TemplateDefinition> = {
  minimal: TOUR_TEMPLATE,
  goals: GOALS_TEMPLATE,
}

function applyPlaceholders(content: string, options: NewProjectOptions): string {
  return content.split('{{PROJECT_NAME}}').join(options.name)
}

export async function scaffoldProject(
  options: NewProjectOptions,
  baseDir: string
): Promise<ScaffoldResult> {
  const template = TEMPLATES[options.template]
  if (!template) {
    throw new Error(`Unknown template '${options.template}'`)
  }

  const dir = path.join(baseDir, options.name)
  if (fs.existsSync(path.join(dir, 'package.json'))) {
    throw new Error(`Directory '${options.name}' already contains a package.json`)
  }

  let filesWritten = 0
  for (const [relativePath, rawContent] of Object.entries(template.files)) {
    const target = path.join(dir, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, applyPlaceholders(rawContent, options))
    filesWritten++
  }

  // Dev convenience: seed `.env` from `.env.example` (every template gitignores
  // it), so `npm run dev` works right after scaffolding.
  const envExample = template.files['.env.example']
  if (envExample && !template.files['.env']) {
    fs.writeFileSync(path.join(dir, '.env'), applyPlaceholders(envExample, options))
    filesWritten++
  }

  if (!options.skipInstall) {
    const { execFileSync } = await import('node:child_process')
    try {
      execFileSync('npm', ['install', '--no-audit', '--no-fund'], {
        cwd: dir,
        stdio: 'inherit',
      })
    } catch {
      console.warn('⚠ npm install failed — run it manually inside the project')
    }
  }

  return { dir, filesWritten }
}
