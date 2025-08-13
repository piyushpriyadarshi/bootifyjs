import fs from 'fs-extra';
import path from 'path';
import mustache from 'mustache';
import inquirer from 'inquirer';
import { toPascalCase, toCamelCase, toKebabCase } from '../utils/string-utils';
import { GenerateOptions } from '../commands/generate';

const serviceTemplate = `import { Service, Autowired } from 'bootifyjs/core';
import { Logger } from 'bootifyjs/logging';
{{#hasRepository}}
import { {{repositoryName}} } from '../repositories/{{repositoryFileName}}';
{{/hasRepository}}
{{#hasCache}}
import { CacheService } from 'bootifyjs/cache';
import { Cacheable } from 'bootifyjs/cache';
{{/hasCache}}
{{#hasEvents}}
import { EventBusService } from 'bootifyjs/events';
import { {{entityName}}CreatedEvent, {{entityName}}UpdatedEvent, {{entityName}}DeletedEvent } from '../events/{{eventFileName}}';
{{/hasEvents}}

export interface {{entityName}} {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  // Add more properties as needed
}

export interface Create{{entityName}}Dto {
  name: string;
  // Add more properties as needed
}

export interface Update{{entityName}}Dto {
  name?: string;
  // Add more properties as needed
}

@Service()
export class {{className}} {
  constructor(
    private readonly logger: Logger{{#hasRepository}},
    @Autowired() private readonly {{repositoryProperty}}: {{repositoryName}}{{/hasRepository}}{{#hasCache}},
    @Autowired() private readonly cacheService: CacheService{{/hasCache}}{{#hasEvents}},
    @Autowired() private readonly eventBus: EventBusService{{/hasEvents}}
  ) {}

  {{#hasCache}}
  @Cacheable({ key: '{{cacheKey}}:all', ttl: 300 })
  {{/hasCache}}
  async findAll(page: number = 1, limit: number = 10): Promise<{{entityName}}[]> {
    this.logger.info('Finding all {{entityNameLower}}s', { page, limit });
    
    {{#hasRepository}}
    return this.{{repositoryProperty}}.findAll(page, limit);
    {{/hasRepository}}
    {{^hasRepository}}
    // TODO: Implement data access logic
    return [];
    {{/hasRepository}}
  }

  {{#hasCache}}
  @Cacheable({ key: '{{cacheKey}}:{{'{{'}}id{{'}}'}}', ttl: 600 })
  {{/hasCache}}
  async findById(id: string): Promise<{{entityName}} | null> {
    this.logger.info('Finding {{entityNameLower}} by ID', { id });
    
    {{#hasRepository}}
    const {{entityNameLower}} = await this.{{repositoryProperty}}.findById(id);
    if (!{{entityNameLower}}) {
      throw new Error('{{entityName}} not found');
    }
    return {{entityNameLower}};
    {{/hasRepository}}
    {{^hasRepository}}
    // TODO: Implement data access logic
    return null;
    {{/hasRepository}}
  }

  async create(data: Create{{entityName}}Dto): Promise<{{entityName}}> {
    this.logger.info('Creating {{entityNameLower}}', { data });
    
    {{#hasRepository}}
    const {{entityNameLower}} = await this.{{repositoryProperty}}.create({
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
    {{/hasRepository}}
    {{^hasRepository}}
    // TODO: Implement data access logic
    const {{entityNameLower}}: {{entityName}} = {
      id: crypto.randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    {{/hasRepository}}

    {{#hasEvents}}
    // Emit creation event
    this.eventBus.emit(new {{entityName}}CreatedEvent({{entityNameLower}}));
    {{/hasEvents}}

    {{#hasCache}}
    // Invalidate cache
    await this.cacheService.del('{{cacheKey}}:all');
    {{/hasCache}}

    return {{entityNameLower}};
  }

  async update(id: string, data: Update{{entityName}}Dto): Promise<{{entityName}}> {
    this.logger.info('Updating {{entityNameLower}}', { id, data });
    
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('{{entityName}} not found');
    }

    {{#hasRepository}}
    const updated{{entityName}} = await this.{{repositoryProperty}}.update(id, {
      ...data,
      updatedAt: new Date()
    });
    {{/hasRepository}}
    {{^hasRepository}}
    // TODO: Implement data access logic
    const updated{{entityName}}: {{entityName}} = {
      ...existing,
      ...data,
      updatedAt: new Date()
    };
    {{/hasRepository}}

    {{#hasEvents}}
    // Emit update event
    this.eventBus.emit(new {{entityName}}UpdatedEvent(updated{{entityName}}, existing));
    {{/hasEvents}}

    {{#hasCache}}
    // Invalidate cache
    await this.cacheService.del('{{cacheKey}}:all');
    await this.cacheService.del(\`{{cacheKey}}:\${id}\`);
    {{/hasCache}}

    return updated{{entityName}};
  }

  async delete(id: string): Promise<void> {
    this.logger.info('Deleting {{entityNameLower}}', { id });
    
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('{{entityName}} not found');
    }

    {{#hasRepository}}
    await this.{{repositoryProperty}}.delete(id);
    {{/hasRepository}}
    {{^hasRepository}}
    // TODO: Implement data access logic
    {{/hasRepository}}

    {{#hasEvents}}
    // Emit deletion event
    this.eventBus.emit(new {{entityName}}DeletedEvent(existing));
    {{/hasEvents}}

    {{#hasCache}}
    // Invalidate cache
    await this.cacheService.del('{{cacheKey}}:all');
    await this.cacheService.del(\`{{cacheKey}}:\${id}\`);
    {{/hasCache}}
  }
}
`;

export async function generateService(name: string, options: GenerateOptions) {
  const className = toPascalCase(name) + 'Service';
  const fileName = toKebabCase(name) + '.service.ts';
  const entityName = toPascalCase(name);
  const entityNameLower = toCamelCase(name);
  const repositoryName = toPascalCase(name) + 'Repository';
  const repositoryFileName = toKebabCase(name) + '.repository';
  const repositoryProperty = toCamelCase(name) + 'Repository';
  const eventFileName = toKebabCase(name) + '.events';
  const cacheKey = toKebabCase(name);

  // Ask for additional options
  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'features',
      message: 'Select features to include:',
      choices: [
        { name: 'Repository pattern', value: 'repository' },
        { name: 'Caching support', value: 'cache' },
        { name: 'Event emission', value: 'events' },
        { name: 'Validation', value: 'validation' },
        { name: 'Audit logging', value: 'audit' }
      ]
    }
  ]);

  const templateData = {
    className,
    entityName,
    entityNameLower,
    repositoryName,
    repositoryFileName,
    repositoryProperty,
    eventFileName,
    cacheKey,
    hasRepository: answers.features.includes('repository'),
    hasCache: answers.features.includes('cache'),
    hasEvents: answers.features.includes('events'),
    hasValidation: answers.features.includes('validation'),
    hasAudit: answers.features.includes('audit')
  };

  const content = mustache.render(serviceTemplate, templateData);
  
  const targetPath = options.path || path.join('src', 'services', fileName);
  
  const files = [{
    path: targetPath,
    content
  }];

  if (!options.dryRun) {
    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, content);
  }

  const instructions = [
    `Import and register ${className} in your application`,
    `Update the entity interface according to your data structure`
  ];

  if (answers.features.includes('repository')) {
    instructions.push(`Generate the corresponding repository: bootifyjs-cli g repository ${name}`);
  }

  if (answers.features.includes('events')) {
    instructions.push(`Generate the corresponding events: bootifyjs-cli g event ${name}Created`);
  }

  return { files, instructions };
}