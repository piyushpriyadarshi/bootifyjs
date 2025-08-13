import fs from 'fs-extra';
import path from 'path';
import mustache from 'mustache';
import inquirer from 'inquirer';
import { toPascalCase, toCamelCase, toKebabCase } from '../utils/string-utils';
import { GenerateOptions } from '../commands/generate';

const controllerTemplate = `import { Controller, Get, Post, Put, Delete, Body, Param, Query } from 'bootifyjs/core';
import { z } from 'zod';
import { {{serviceName}} } from '../services/{{serviceFileName}}';

// Validation schemas
const create{{entityName}}Schema = z.object({
  // Add your validation fields here
  name: z.string().min(1, 'Name is required'),
});

const update{{entityName}}Schema = z.object({
  // Add your validation fields here
  name: z.string().min(1, 'Name is required'),
});

const get{{entityName}}ByIdSchema = {
  params: z.object({
    id: z.string().uuid('Invalid ID format'),
  }),
};

type Create{{entityName}}Dto = z.infer<typeof create{{entityName}}Schema>;
type Update{{entityName}}Dto = z.infer<typeof update{{entityName}}Schema>;

@Controller('/{{routePath}}')
export class {{className}} {
  constructor(private readonly {{serviceProperty}}: {{serviceName}}) {}

  @Get('/')
  async getAll{{entityName}}s(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    return this.{{serviceProperty}}.findAll(pageNum, limitNum);
  }

  @Get('/:id')
  async get{{entityName}}ById(@Param('id') id: string) {
    return this.{{serviceProperty}}.findById(id);
  }

  @Post('/')
  async create{{entityName}}(@Body() body: Create{{entityName}}Dto) {
    return this.{{serviceProperty}}.create(body);
  }

  @Put('/:id')
  async update{{entityName}}(
    @Param('id') id: string,
    @Body() body: Update{{entityName}}Dto
  ) {
    return this.{{serviceProperty}}.update(id, body);
  }

  @Delete('/:id')
  async delete{{entityName}}(@Param('id') id: string) {
    return this.{{serviceProperty}}.delete(id);
  }
}
`;

export async function generateController(name: string, options: GenerateOptions) {
  const className = toPascalCase(name) + 'Controller';
  const fileName = toKebabCase(name) + '.controller.ts';
  const entityName = toPascalCase(name);
  const serviceName = toPascalCase(name) + 'Service';
  const serviceFileName = toKebabCase(name) + '.service';
  const serviceProperty = toCamelCase(name) + 'Service';
  const routePath = toKebabCase(name) + 's';

  // Ask for additional options
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'routePath',
      message: 'Route path:',
      default: routePath
    },
    {
      type: 'confirm',
      name: 'generateService',
      message: 'Generate corresponding service?',
      default: true
    },
    {
      type: 'checkbox',
      name: 'features',
      message: 'Select features to include:',
      choices: [
        { name: 'Authentication middleware', value: 'auth' },
        { name: 'Caching decorators', value: 'cache' },
        { name: 'Validation schemas', value: 'validation' },
        { name: 'Audit logging', value: 'audit' },
        { name: 'Rate limiting', value: 'rateLimit' }
      ]
    }
  ]);

  const templateData = {
    className,
    entityName,
    serviceName,
    serviceFileName,
    serviceProperty,
    routePath: answers.routePath,
    ...answers
  };

  const content = mustache.render(controllerTemplate, templateData);
  
  const targetPath = options.path || path.join('src', 'controllers', fileName);
  
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
    `Update the validation schemas according to your entity structure`
  ];

  if (answers.generateService) {
    instructions.push(`Generate the corresponding service: bootifyjs-cli g service ${name}`);
  }

  return { files, instructions };
}