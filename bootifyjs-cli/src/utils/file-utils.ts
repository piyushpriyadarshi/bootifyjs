import fs from 'fs-extra';
import path from 'path';
import mustache from 'mustache';

export interface ProjectData {
  projectName: string;
  description: string;
  author: string;
  template: string;
  features: string[];
}

export async function createProjectStructure(projectPath: string, data: ProjectData) {
  // Create basic structure
  await fs.ensureDir(projectPath);
  await fs.ensureDir(path.join(projectPath, 'src'));
  await fs.ensureDir(path.join(projectPath, 'src', 'controllers'));
  await fs.ensureDir(path.join(projectPath, 'src', 'services'));
  await fs.ensureDir(path.join(projectPath, 'src', 'events'));
  await fs.ensureDir(path.join(projectPath, 'src', 'middleware'));
  await fs.ensureDir(path.join(projectPath, 'src', 'config'));

  // Create package.json
  const packageJson = {
    name: data.projectName,
    version: '1.0.0',
    description: data.description,
    main: 'dist/index.js',
    scripts: {
      'dev': 'nodemon --watch src --exec ts-node src/index.ts',
      'build': 'tsc',
      'start': 'node dist/index.js',
      'test': 'jest',
      'test:watch': 'jest --watch',
      'lint': 'eslint src/**/*.ts',
      'lint:fix': 'eslint src/**/*.ts --fix'
    },
    author: data.author,
    license: 'ISC',
    dependencies: {
      'bootifyjs': '^1.1.9',
      'fastify': '^5.4.0',
      'reflect-metadata': '^0.2.2',
      'zod': '^3.25.76',
      'dotenv': '^17.2.1'
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      'typescript': '^5.0.0',
      'ts-node': '^10.9.0',
      'nodemon': '^3.1.0',
      ...(data.features.includes('testing') && {
        'jest': '^29.0.0',
        '@types/jest': '^29.0.0',
        'ts-jest': '^29.0.0'
      })
    }
  };

  await fs.writeJSON(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 });

  // Create main application file
  const mainAppContent = `import 'reflect-metadata';
import { createBootifyApp } from 'bootifyjs';
import { HealthController } from './controllers/health.controller';
import { z } from 'zod';

async function main() {
  const { app, start } = await createBootifyApp({
    controllers: [HealthController],
    enableSwagger: true,
    port: 3000,
    configSchema: z.object({
      NODE_ENV: z.string().default('development'),
    }),
  });

  await start();
  console.log('🚀 Server running on http://localhost:3000');
  console.log('📖 API docs available at http://localhost:3000/api-docs');
}

main().catch(console.error);
`;

  await fs.writeFile(path.join(projectPath, 'src', 'index.ts'), mainAppContent);

  // Create health controller
  const healthControllerContent = `import { Controller, Get } from 'bootifyjs/core';

@Controller('/health')
export class HealthController {
  @Get('/')
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('/ping')
  ping() {
    return 'pong';
  }
}
`;

  await fs.writeFile(
    path.join(projectPath, 'src', 'controllers', 'health.controller.ts'),
    healthControllerContent
  );

  // Create other template files based on selected features
  if (data.features.includes('testing')) {
    await createTestingSetup(projectPath);
  }

  if (data.features.includes('database')) {
    await createDatabaseSetup(projectPath);
  }

  // Create configuration files
  await createConfigFiles(projectPath, data);
}

async function createTestingSetup(projectPath: string) {
  const jestConfig = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
    collectCoverageFrom: [
      'src/**/*.ts',
      '!src/**/*.d.ts',
      '!src/index.ts'
    ]
  };

  await fs.writeJSON(path.join(projectPath, 'jest.config.json'), jestConfig, { spaces: 2 });

  // Create sample test
  const testContent = `import { HealthController } from '../controllers/health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  describe('check', () => {
    it('should return health status', () => {
      const result = controller.check();
      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
    });
  });

  describe('ping', () => {
    it('should return pong', () => {
      const result = controller.ping();
      expect(result).toBe('pong');
    });
  });
});
`;

  await fs.ensureDir(path.join(projectPath, 'src', '__tests__'));
  await fs.writeFile(
    path.join(projectPath, 'src', '__tests__', 'health.controller.test.ts'),
    testContent
  );
}

async function createDatabaseSetup(projectPath: string) {
  // Add database-related files and configurations
  // This would include TypeORM setup, entity examples, etc.
}

async function createConfigFiles(projectPath: string, data: ProjectData) {
  // TypeScript config
  const tsConfig = {
    compilerOptions: {
      target: 'ES2021',
      module: 'commonjs',
      lib: ['ES2021'],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      outDir: './dist',
      rootDir: './src',
      declaration: true,
      sourceMap: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist', '**/*.test.ts']
  };

  await fs.writeJSON(path.join(projectPath, 'tsconfig.json'), tsConfig, { spaces: 2 });

  // Environment file
  const envContent = `NODE_ENV=development
SERVER_PORT=3000
SERVER_HOST=localhost
LOG_LEVEL=debug
`;

  await fs.writeFile(path.join(projectPath, '.env'), envContent);
  await fs.writeFile(path.join(projectPath, '.env.example'), envContent);

  // Nodemon config
  const nodemonConfig = {
    watch: ['src'],
    ext: 'ts',
    ignore: ['src/**/*.test.ts'],
    exec: 'ts-node src/index.ts'
  };

  await fs.writeJSON(path.join(projectPath, 'nodemon.json'), nodemonConfig, { spaces: 2 });

  // README
  const readmeContent = `# ${data.projectName}

${data.description}

## Getting Started

### Installation

\`\`\`bash
npm install
\`\`\`

### Development

\`\`\`bash
npm run dev
\`\`\`

### Production

\`\`\`bash
npm run build
npm start
\`\`\`

### Testing

\`\`\`bash
npm test
\`\`\`

## API Documentation

Once the server is running, visit http://localhost:3000/api-docs for interactive API documentation.

## Project Structure

\`\`\`
src/
├── controllers/     # HTTP controllers
├── services/        # Business logic
├── events/          # Event definitions
├── middleware/      # Custom middleware
├── config/          # Configuration
└── index.ts         # Application entry point
\`\`\`

## Built with BootifyJS

This project was generated using [BootifyJS](https://bootifyjs.dev), a modern Node.js framework.
`;

  await fs.writeFile(path.join(projectPath, 'README.md'), readmeContent);
}