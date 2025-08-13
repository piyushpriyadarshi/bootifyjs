import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import validatePackageName from 'validate-npm-package-name';
import { createProjectStructure } from '../utils/file-utils';

export interface CreateOptions {
  template?: string;
  skipInstall?: boolean;
}

export async function createCommand(projectName: string, options: CreateOptions) {
  console.log(chalk.blue('\n🚀 Creating BootifyJS project...'));

  // Validate project name
  const validation = validatePackageName(projectName);
  if (!validation.validForNewPackages) {
    console.error(chalk.red('❌ Invalid project name:'));
    validation.errors?.forEach(error => console.error(chalk.red(`  - ${error}`)));
    process.exit(1);
  }

  const projectPath = path.resolve(projectName);

  // Check if directory exists
  if (fs.existsSync(projectPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `Directory ${projectName} already exists. Overwrite?`,
        default: false
      }
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('❌ Project creation cancelled.'));
      process.exit(0);
    }

    fs.removeSync(projectPath);
  }

  // Get project details
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'description',
      message: 'Project description:',
      default: 'A BootifyJS application'
    },
    {
      type: 'input',
      name: 'author',
      message: 'Author:',
      default: ''
    },
    {
      type: 'list',
      name: 'template',
      message: 'Choose a template:',
      choices: [
        { name: 'Basic API', value: 'basic' },
        { name: 'REST API with Database', value: 'rest-api' },
        { name: 'Microservice', value: 'microservice' },
        { name: 'Full Stack (API + Frontend)', value: 'fullstack' }
      ],
      default: options.template || 'basic'
    },
    {
      type: 'checkbox',
      name: 'features',
      message: 'Select additional features:',
      choices: [
        { name: 'Authentication & Authorization', value: 'auth' },
        { name: 'Database Integration (TypeORM)', value: 'database' },
        { name: 'Redis Caching', value: 'redis' },
        { name: 'File Upload Support', value: 'upload' },
        { name: 'Email Service', value: 'email' },
        { name: 'Background Jobs', value: 'jobs' },
        { name: 'WebSocket Support', value: 'websocket' },
        { name: 'Testing Setup (Jest)', value: 'testing' }
      ]
    }
  ]);

  const spinner = ora('Creating project structure...').start();

  try {
    // Create project structure
    await createProjectStructure(projectPath, {
      projectName,
      ...answers
    });

    spinner.succeed('Project structure created!');

    // Install dependencies
    if (!options.skipInstall) {
      const installSpinner = ora('Installing dependencies...').start();
      try {
        execSync('npm install', { cwd: projectPath, stdio: 'pipe' });
        installSpinner.succeed('Dependencies installed!');
      } catch (error) {
        installSpinner.fail('Failed to install dependencies');
        console.log(chalk.yellow('You can install them manually by running: npm install'));
      }
    }

    // Success message
    console.log(chalk.green('\n✅ Project created successfully!'));
    console.log(chalk.blue('\n📁 Next steps:'));
    console.log(chalk.gray(`  cd ${projectName}`));
    if (options.skipInstall) {
      console.log(chalk.gray('  npm install'));
    }
    console.log(chalk.gray('  npm run dev'));
    console.log(chalk.blue('\n📖 Documentation: https://bootifyjs.dev'));

  } catch (error) {
    spinner.fail('Failed to create project');
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}