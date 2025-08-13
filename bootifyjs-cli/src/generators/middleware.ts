import fs from 'fs-extra';
import path from 'path';
import { toPascalCase } from '../utils/string-utils';
import { GenerateOptions } from '../commands/generate';

export interface GeneratorResult {
  files: { path: string; content: string }[];
  instructions?: string[];
}

export async function generateMiddleware(name: string, options: GenerateOptions): Promise<GeneratorResult> {
  const className = toPascalCase(name) + 'Middleware';
  const fileName = name.toLowerCase() + '.middleware.ts';
  
  const targetPath = options.path || 'src/middleware';
  const filePath = path.join(targetPath, fileName);

  const content = `import { FastifyRequest, FastifyReply } from 'fastify';
import { Component } from 'bootifyjs';

@Component()
export class ${className} {
  async execute(request: FastifyRequest, reply: FastifyReply, next: () => void): Promise<void> {
    try {
      // TODO: Implement your middleware logic here
      console.log('${className} executed for:', request.url);
      
      // Call next middleware in the chain
      next();
    } catch (error) {
      console.error('Error in ${className}:', error);
      reply.status(500).send({ error: 'Internal server error' });
    }
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
      `Register the middleware in your application configuration`,
      `Apply the middleware to specific routes or globally`
    ]
  };
}