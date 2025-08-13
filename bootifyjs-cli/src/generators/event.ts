import fs from 'fs-extra';
import path from 'path';
import mustache from 'mustache';
import inquirer from 'inquirer';
import { toPascalCase, toCamelCase, toKebabCase } from '../utils/string-utils';
import { GenerateOptions } from '../commands/generate';

const eventTemplate = `import { IEvent } from 'bootifyjs/events';

export class {{className}} implements IEvent {
  readonly type = '{{eventType}}';
  readonly timestamp = new Date();
  readonly version = '1.0';

  constructor(
    public readonly {{payloadProperty}}: {{payloadType}}{{#hasMetadata}},
    public readonly metadata?: {{metadataType}}{{/hasMetadata}}
  ) {}

  // Helper method to get event data
  getData() {
    return {
      type: this.type,
      timestamp: this.timestamp,
      version: this.version,
      payload: this.{{payloadProperty}}{{#hasMetadata}},
      metadata: this.metadata{{/hasMetadata}}
    };
  }

  // Helper method to serialize event
  toJSON() {
    return JSON.stringify(this.getData());
  }
}

{{#generatePayloadType}}
export interface {{payloadType}} {
  id: string;
  // Add your payload properties here
}
{{/generatePayloadType}}

{{#hasMetadata}}
export interface {{metadataType}} {
  userId?: string;
  requestId?: string;
  source?: string;
  // Add your metadata properties here
}
{{/hasMetadata}}
`;

export async function generateEvent(name: string, options: GenerateOptions) {
  const className = toPascalCase(name) + 'Event';
  const fileName = toKebabCase(name) + '.event.ts';
  const eventType = toKebabCase(name).replace(/-/g, '.');
  const payloadProperty = 'payload';
  const payloadType = toPascalCase(name) + 'Payload';
  const metadataType = 'EventMetadata';

  // Ask for additional options
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'eventType',
      message: 'Event type (dot notation):',
      default: eventType
    },
    {
      type: 'input',
      name: 'payloadType',
      message: 'Payload type name:',
      default: payloadType
    },
    {
      type: 'confirm',
      name: 'generatePayloadType',
      message: 'Generate payload interface?',
      default: true
    },
    {
      type: 'confirm',
      name: 'hasMetadata',
      message: 'Include metadata support?',
      default: true
    },
    {
      type: 'confirm',
      name: 'generateHandler',
      message: 'Generate corresponding event handler?',
      default: true
    }
  ]);

  const templateData = {
    className,
    eventType: answers.eventType,
    payloadProperty,
    payloadType: answers.payloadType,
    metadataType,
    generatePayloadType: answers.generatePayloadType,
    hasMetadata: answers.hasMetadata
  };

  const content = mustache.render(eventTemplate, templateData);
  
  const targetPath = options.path || path.join('src', 'events', fileName);
  
  const files = [{
    path: targetPath,
    content
  }];

  if (!options.dryRun) {
    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, content);
  }

  const instructions = [
    `Import and use ${className} in your services`,
    `Update the payload interface according to your event data`
  ];

  if (answers.generateHandler) {
    instructions.push(`Generate the corresponding handler: bootifyjs-cli g handler ${name}Handler`);
  }

  return { files, instructions };
}