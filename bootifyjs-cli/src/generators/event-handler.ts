import fs from 'fs-extra';
import path from 'path';
import { toPascalCase, toCamelCase } from '../utils/string-utils';
import { GenerateOptions } from '../commands/generate';

export interface GeneratorResult {
  files: { path: string; content: string }[];
  instructions?: string[];
}

export async function generateEventHandler(name: string, options: GenerateOptions): Promise<GeneratorResult> {
  const className = toPascalCase(name) + 'Handler';
  const fileName = name.toLowerCase() + '.handler.ts';
  const eventName = toPascalCase(name) + 'Event';
  
  const targetPath = options.path || 'src/events/handlers';
  const filePath = path.join(targetPath, fileName);

  const content = `import { EventHandler, OnEvent } from 'bootifyjs';
import { ${eventName} } from '../${name.toLowerCase()}.event';

@EventHandler()
export class ${className} {
  @OnEvent(${eventName})
  async handle(event: ${eventName}): Promise<void> {
    console.log('Handling ${name} event:', event);
    
    // TODO: Implement your event handling logic here
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
      `Register the handler in your application bootstrap`,
      `Import and use the ${eventName} in your services`
    ]
  };
}