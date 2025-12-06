---
id: installation
title: Installation
sidebar_label: Installation
sidebar_position: 1
description: Learn how to install BootifyJS and set up your development environment
keywords: [bootifyjs, installation, setup, npm, node.js]
---

# Installation

Get started with BootifyJS by installing the framework and setting up your development environment.

## Prerequisites

Before installing BootifyJS, ensure you have the following installed on your system:

- **Node.js**: Version 18.x or higher
- **npm**: Version 8.x or higher (comes with Node.js)
- **TypeScript**: Version 5.x or higher (will be installed as a dependency)

You can verify your installations by running:

```bash
node --version
npm --version
```

## Installation Methods

### Method 1: Using the CLI (Recommended)

The fastest way to get started is using the BootifyJS CLI, which scaffolds a complete project structure for you.

```bash
# Install the CLI globally
npm install -g bootifyjs-cli

# Create a new project
bootify create my-api

# Navigate to your project
cd my-api

# Install dependencies
npm install

# Start the development server
npm run dev
```

The CLI will create a project with:

- Pre-configured TypeScript setup
- Example controllers and services
- Environment configuration
- Development scripts

### Method 2: Manual Installation

If you prefer to set up your project manually or add BootifyJS to an existing project:

```bash
# Create a new directory
mkdir my-bootify-app
cd my-bootify-app

# Initialize npm project
npm init -y

# Install BootifyJS and required dependencies
npm install bootifyjs fastify reflect-metadata zod

# Install TypeScript and development dependencies
npm install -D typescript @types/node ts-node nodemon

# Install optional dependencies (recommended)
npm install dotenv
npm install -D @types/dotenv
```

## TypeScript Configuration

Create a `tsconfig.json` file in your project root:

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

:::warning Important
The `experimentalDecorators` and `emitDecoratorMetadata` options are **required** for BootifyJS to work properly. These enable TypeScript's decorator support, which is fundamental to the framework.
:::

## Package Scripts

Add these scripts to your `package.json`:

```json title="package.json"
{
  "scripts": {
    "dev": "nodemon --watch src --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "clean": "rm -rf dist"
  }
}
```

## Environment Setup

Create a `.env` file in your project root for environment variables:

```bash title=".env"
NODE_ENV=development
PORT=8080
HOST=localhost
```

Create a `.env.example` file to document required environment variables:

```bash title=".env.example"
NODE_ENV=development
PORT=8080
HOST=localhost
# Add other required environment variables here
```

## Project Structure

After installation, your project should have this basic structure:

```
my-bootify-app/
├── src/
│   └── index.ts          # Application entry point
├── .env                  # Environment variables (git-ignored)
├── .env.example          # Environment variables template
├── .gitignore           # Git ignore file
├── package.json         # Project dependencies
├── tsconfig.json        # TypeScript configuration
└── README.md            # Project documentation
```

## Verify Installation

Create a simple test file to verify your installation:

```typescript title="src/index.ts"
import "reflect-metadata";
import { createBootify } from "bootifyjs";

async function main() {
  const { start } = await createBootify().setPort(8080).build();

  await start();
  console.log("✅ BootifyJS is installed and running!");
}

main();
```

Run the application:

```bash
npm run dev
```

If you see the startup banner and "BootifyJS is installed and running!" message, your installation is successful!

## Troubleshooting

### Common Issues

#### "Cannot find module 'reflect-metadata'"

**Solution**: Make sure you import `reflect-metadata` at the very top of your entry file:

```typescript
import "reflect-metadata"; // Must be first!
import { createBootify } from "bootifyjs";
```

#### "Experimental support for decorators is a feature..."

**Solution**: Ensure your `tsconfig.json` has these options enabled:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

#### Port Already in Use

**Solution**: Change the port in your `.env` file or use a different port:

```typescript
createBootify().setPort(3000);
```

#### TypeScript Compilation Errors

**Solution**: Make sure you're using TypeScript 5.x or higher:

```bash
npm install -D typescript@latest
```

## Next Steps

Now that you have BootifyJS installed, you're ready to:

- Follow the [Quick Start](./quick-start.md) guide to build your first endpoint
- Learn about [Project Structure](./project-structure.md) best practices
- Build your [First Application](./first-application.md) with a complete example

## Additional Resources

- [BootifyJS GitHub Repository](https://github.com/piyushpriyadarshi/bootifyjs)
- [npm Package](https://www.npmjs.com/package/bootifyjs)
- [Report Installation Issues](https://github.com/piyushpriyadarshi/bootifyjs/issues)
- [Community Discussions](https://github.com/piyushpriyadarshi/bootifyjs/discussions)
