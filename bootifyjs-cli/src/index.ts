#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createCommand } from './commands/create';
import { generateCommand } from './commands/generate';

const program = new Command();

program
  .name('bootifyjs-cli')
  .description('CLI tool for BootifyJS framework')
  .version('1.0.0');

program
  .command('create')
  .description('Create a new BootifyJS project')
  .argument('<project-name>', 'Name of the project')
  .option('-t, --template <template>', 'Project template', 'basic')
  .option('--skip-install', 'Skip npm install')
  .action(createCommand);

program
  .command('generate')
  .alias('g')
  .description('Generate code components')
  .argument('<type>', 'Type of component (controller, service, event, handler, middleware, repository)')
  .argument('<name>', 'Name of the component')
  .option('-p, --path <path>', 'Custom path for the generated file')
  .option('--dry-run', 'Show what would be generated without creating files')
  .action(generateCommand);

program
  .command('info')
  .description('Display project information')
  .action(() => {
    console.log(chalk.blue('\n🚀 BootifyJS CLI'));
    console.log(chalk.gray('Version: 1.0.0'));
    console.log(chalk.gray('Framework: BootifyJS'));
    console.log(chalk.gray('Documentation: https://bootifyjs.dev'));
  });

program.parse();