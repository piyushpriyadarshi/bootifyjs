import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { generateController } from '../generators/controller';
import { generateService } from '../generators/service';
import { generateEvent } from '../generators/event';
import { generateEventHandler } from '../generators/event-handler';
import { generateMiddleware } from '../generators/middleware';
import { generateRepository } from '../generators/repository';

export interface GenerateOptions {
  path?: string;
  dryRun?: boolean;
}

const generators = {
  controller: generateController,
  service: generateService,
  event: generateEvent,
  handler: generateEventHandler,
  middleware: generateMiddleware,
  repository: generateRepository
};

export async function generateCommand(type: string, name: string, options: GenerateOptions) {
  console.log(chalk.blue(`\n🔧 Generating ${type}...`));

  if (!generators[type as keyof typeof generators]) {
    console.error(chalk.red(`❌ Unknown generator type: ${type}`));
    console.log(chalk.gray('Available types: controller, service, event, handler, middleware, repository'));
    process.exit(1);
  }

  const generator = generators[type as keyof typeof generators];
  const spinner = ora(`Generating ${type}...`).start();

  try {
    const result = await generator(name, options);
    
    if (options.dryRun) {
      spinner.info('Dry run - no files created');
      console.log(chalk.blue('\n📄 Files that would be created:'));
      result.files.forEach(file => {
        console.log(chalk.gray(`  ${file.path}`));
      });
    } else {
      spinner.succeed(`${type} generated successfully!`);
      console.log(chalk.green('\n✅ Files created:'));
      result.files.forEach(file => {
        console.log(chalk.gray(`  ${file.path}`));
      });
    }

    if (result.instructions?.length) {
      console.log(chalk.blue('\n📝 Next steps:'));
      result.instructions.forEach(instruction => {
        console.log(chalk.gray(`  ${instruction}`));
      });
    }

  } catch (error) {
    spinner.fail(`Failed to generate ${type}`);
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}