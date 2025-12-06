import dotenv from "dotenv";
import { FastifyInstance } from "fastify";
import "reflect-metadata";
import z from "zod";
import { createBootify } from "../BootifyApp";
import { ComponentCategory } from "../logging/core/enhanced-startup-logger";
import { HealthController } from "./controllers/health.controller";
import { TodoController } from "./controllers/todo.controller";

dotenv.config();

// Example: Using Enhanced Startup Logger with all features

const envSchema = z.object({
    NODE_ENV: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    DATABASE_URL: z.string().optional(),
    REDIS_URL: z.string().optional(),
});

// Mock services for demonstration
const mockDatabase = {
    async connect() {
        // Simulate slow connection
        await new Promise(resolve => setTimeout(resolve, 800));
    },
    async query(sql: string) {
        return [{ result: 1 }];
    },
};

const mockRedis = {
    async connect() {
        await new Promise(resolve => setTimeout(resolve, 100));
    },
    async ping() {
        return 'PONG';
    },
};

async function main() {
    const { app, start, startupLogger, logger } = await createBootify()
        // Configuration
        .useConfig(envSchema)
        .setPort(8080)

        // Initialize Database with proper logging
        .beforeStart(async () => {
            startupLogger.logComponentStart('PostgreSQL', ComponentCategory.DATABASE, {
                host: 'localhost',
                port: 5432,
            });

            try {
                await mockDatabase.connect();
                startupLogger.logComponentComplete('PostgreSQL', {
                    connected: true,
                    poolSize: 10,
                });

                // Register health check
                startupLogger.registerHealthCheck('database', async () => {
                    try {
                        await mockDatabase.query('SELECT 1');
                        return true;
                    } catch {
                        return false;
                    }
                });
            } catch (error) {
                startupLogger.logComponentFailed('PostgreSQL', error as Error, {
                    host: 'localhost',
                    port: 5432,
                });
                throw error;
            }
        })

        // Initialize Redis with proper logging
        .beforeStart(async () => {
            startupLogger.logComponentStart('Redis', ComponentCategory.CACHE, {
                host: 'localhost',
                port: 6379,
            });

            try {
                await mockRedis.connect();
                startupLogger.logComponentComplete('Redis', {
                    connected: true,
                });

                // Register health check
                startupLogger.registerHealthCheck('redis', async () => {
                    try {
                        await mockRedis.ping();
                        return true;
                    } catch {
                        return false;
                    }
                });
            } catch (error) {
                startupLogger.logComponentFailed('Redis', error as Error);
                throw error;
            }
        })

        // Register Swagger plugin
        .usePlugin(async (app: FastifyInstance) => {
            startupLogger.logComponentStart('Swagger', ComponentCategory.PLUGIN);

            const fastifySwagger = await import("@fastify/swagger");
            const fastifySwaggerUI = await import("@fastify/swagger-ui");

            await app.register(fastifySwagger.default, {
                openapi: {
                    info: {
                        title: "Enhanced Logger Example API",
                        description: "Demonstrating the enhanced startup logger",
                        version: "1.0.0",
                    },
                    servers: [{ url: `http://localhost:8080` }],
                },
            });

            await app.register(fastifySwaggerUI.default, {
                routePrefix: "/api-docs",
            });

            startupLogger.logComponentComplete('Swagger');
        })

        // Register controllers
        .useControllers([HealthController, TodoController])

        // After start - show helpful info
        .afterStart(async () => {
            logger.info('🎉 Application is ready to accept requests!');
            logger.info('📚 Try these commands to see different startup modes:');
            logger.info('   STARTUP_MODE=silent npm run dev');
            logger.info('   STARTUP_MODE=verbose npm run dev');
            logger.info('   STARTUP_MODE=debug npm run dev');
            logger.info('   STARTUP_MODE=json npm run dev');
        })

        .build();

    await start();
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('\n👋 Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    process.exit(0);
});

main().catch((error) => {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
});
