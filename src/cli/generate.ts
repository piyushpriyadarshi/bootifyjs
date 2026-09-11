/**
 * `bootifyjs generate <type> <name>` — scaffolds components into an existing
 * project, following BootifyJS 3.0 conventions (zod schemas, typed errors,
 * @UseAuth, commons BaseRepo).
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface GenerateResult {
  files: string[]
}

function pascal(name: string): string {
  return name
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
}

function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[-_.\s]+/g, '-')
    .toLowerCase()
}

function writeFile(baseDir: string, relativePath: string, content: string): string {
  const target = path.join(baseDir, relativePath)
  if (fs.existsSync(target)) {
    throw new Error(`Refusing to overwrite existing file: ${relativePath}`)
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
  return relativePath
}

const CONTROLLER = (Pascal: string, kebabName: string) => `import {
  Controller, Get, Post, Body, Param, Schema, Swagger, UseAuth, CurrentUser,
} from 'bootifyjs'
import { z } from 'zod'
import { ${Pascal}Service } from './${kebabName}.service'

const createSchema = z.object({
  name: z.string().min(1),
})

@Swagger({ tags: ['${Pascal}'] })
@UseAuth()
@Controller('/${kebabName}s')
export class ${Pascal}Controller {
  constructor(private readonly ${kebabName}s: ${Pascal}Service) {}

  @Get('/')
  list(@CurrentUser() user: any) {
    return this.${kebabName}s.list(user.sub)
  }

  @Post('/')
  @Swagger({ summary: 'Create a ${kebabName}' })
  @Schema({ body: createSchema })
  create(@Body() body: { name: string }, @CurrentUser() user: any) {
    return this.${kebabName}s.create(user.sub, body)
  }

  @Get('/:id')
  get(@Param('id') id: string, @CurrentUser() user: any) {
    return this.${kebabName}s.getOwned(user.sub, id)
  }
}
`

const SERVICE = (Pascal: string, kebabName: string) => `import { Service, NotFoundError } from 'bootifyjs'
import { ${Pascal}Repo } from './${kebabName}.repo'

@Service()
export class ${Pascal}Service {
  constructor(private readonly ${kebabName}s: ${Pascal}Repo) {}

  list(userId: string) {
    return this.${kebabName}s.listByUser(userId)
  }

  create(userId: string, input: { name: string }) {
    return this.${kebabName}s.insert({ user_id: userId, name: input.name })
  }

  /** Ownership in the query — foreign resources read as 404. */
  getOwned(userId: string, id: string) {
    const row = this.${kebabName}s.byUserAndId(id, userId)
    if (!row) throw new NotFoundError('${Pascal} not found')
    return row
  }
}
`

const REPO = (Pascal: string, kebabName: string) => `import { BaseRepo } from '@priyadarship4/commons/sqlite'
import type { Db } from '@priyadarship4/commons/sqlite'
import { randomUUID } from 'node:crypto'
import { Repository, Autowired } from 'bootifyjs'
import { DB_TOKEN } from '../../db/db'

export interface ${Pascal}Row {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at: string
}

@Repository()
export class ${Pascal}Repo extends BaseRepo<${Pascal}Row> {
  constructor(@Autowired(DB_TOKEN) protected readonly db: Db) {
    super('${kebabName}s', db, {
      writableColumns: ['user_id', 'name'],
      timestamps: true,
      generateId: () => randomUUID(),
    })
  }

  listByUser(userId: string): ${Pascal}Row[] {
    return this.db
      .prepare('SELECT * FROM ${kebabName}s WHERE user_id = ? ORDER BY created_at DESC', {
        name: '${kebabName}s.listByUser',
      })
      .all<${Pascal}Row>(userId)
  }

  byUserAndId(id: string, userId: string): ${Pascal}Row | undefined {
    return this.db
      .prepare('SELECT * FROM ${kebabName}s WHERE id = ? AND user_id = ?', {
        name: '${kebabName}s.byUserAndId',
      })
      .get<${Pascal}Row>(id, userId)
  }
}
`

const EVENT = (Pascal: string, kebabName: string) => `import { EventListener, OnEvent, Service, Autowired, getLogger } from 'bootifyjs'
import type { IEvent } from 'bootifyjs/events'

export interface ${Pascal}EventPayload {
  id: string
  userId: string
}

@Service()
@EventListener()
export class ${Pascal}EventsHandler {
  @OnEvent('${kebabName}.created')
  async onCreated(event: IEvent): Promise<void> {
    const payload = event.payload as ${Pascal}EventPayload
    getLogger().info('${kebabName}.created', { logType: 'event', ...payload })
  }
}
`

export const GENERATORS: Record<string, (Pascal: string, kebabName: string) => string> = {
  controller: CONTROLLER,
  service: SERVICE,
  repository: REPO,
  event: EVENT,
}

export function generateComponent(
  type: string,
  name: string,
  baseDir: string
): GenerateResult {
  const generator = GENERATORS[type]
  if (!generator) {
    throw new Error(`Unknown generator '${type}'. Types: ${Object.keys(GENERATORS).join(', ')}`)
  }

  const Pascal = pascal(name)
  const kebabName = kebab(name)
  const moduleDir = `src/modules/${kebabName}`
  const content = generator(Pascal, kebabName)
  const fileName =
    type === 'event' ? `${kebabName}.events.ts` : `${kebabName}.${type === 'repository' ? 'repo' : type}.ts`

  const written = writeFile(baseDir, path.join(moduleDir, fileName), content)
  return { files: [written] }
}
