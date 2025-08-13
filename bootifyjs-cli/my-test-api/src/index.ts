import 'reflect-metadata';
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
