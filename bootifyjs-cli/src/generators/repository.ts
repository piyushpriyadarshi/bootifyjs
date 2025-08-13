import fs from 'fs-extra';
import path from 'path';
import { toPascalCase, toCamelCase } from '../utils/string-utils';
import { GenerateOptions } from '../commands/generate';

export interface GeneratorResult {
  files: { path: string; content: string }[];
  instructions?: string[];
}

export async function generateRepository(name: string, options: GenerateOptions): Promise<GeneratorResult> {
  const className = toPascalCase(name) + 'Repository';
  const interfaceName = 'I' + className;
  const fileName = name.toLowerCase() + '.repository.ts';
  const entityName = toPascalCase(name);
  
  const targetPath = options.path || 'src/repositories';
  const filePath = path.join(targetPath, fileName);

  const content = `import { Component } from 'bootifyjs';

export interface ${entityName} {
  id: string;
  // TODO: Add your entity properties here
  createdAt: Date;
  updatedAt: Date;
}

export interface ${interfaceName} {
  findById(id: string): Promise<${entityName} | null>;
  findAll(): Promise<${entityName}[]>;
  create(data: Partial<${entityName}>): Promise<${entityName}>;
  update(id: string, data: Partial<${entityName}>): Promise<${entityName} | null>;
  delete(id: string): Promise<boolean>;
}

@Component()
export class ${className} implements ${interfaceName} {
  private items: ${entityName}[] = [];

  async findById(id: string): Promise<${entityName} | null> {
    return this.items.find(item => item.id === id) || null;
  }

  async findAll(): Promise<${entityName}[]> {
    return [...this.items];
  }

  async create(data: Partial<${entityName}>): Promise<${entityName}> {
    const item: ${entityName} = {
      id: Math.random().toString(36).substr(2, 9),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ${entityName};
    
    this.items.push(item);
    return item;
  }

  async update(id: string, data: Partial<${entityName}>): Promise<${entityName} | null> {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) return null;
    
    this.items[index] = {
      ...this.items[index],
      ...data,
      updatedAt: new Date()
    };
    
    return this.items[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.items.findIndex(item => item.id === id);
    if (index === -1) return false;
    
    this.items.splice(index, 1);
    return true;
  }
}
`;

  if (!options.dryRun) {
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content);
  }

  return {
    files: [{ path: filePath, content }],
    instructions: [
      `Inject the repository into your services using @Autowired`,
      `Replace the in-memory implementation with your preferred database`
    ]
  };
}