import dotenv from "dotenv";
import { FastifyInstance } from "fastify";
import "reflect-metadata";
import z from "zod";
import { createBootify } from "../BootifyApp";
import { HealthController } from "./controllers/health.controller";
import { TodoController } from "./controllers/todo.controller";

dotenv.config();

// Example: Using Streaming Startup Logger (Spring Boot style)

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
            startupLogger.logComponentStart('PostgreSQL', 'localhost:5432');

            try {
                await mockDatabase.connect();
                startupLogger.logComponentComplete();
            } catch (error) {
                startupLogger.logComponentFailed(error as Error);
                throw error;
            }
        })

        // Initialize Redis with proper logging
        .beforeStart(async () => {
            startupLogger.logComponentStart('Redis', 'localhost:6379');

            try {
                await mockRedis.connect();
                startupLogger.logComponentComplete();
            } catch (error) {
                startupLogger.logComponentFailed(error as Error);
                throw error;
            }
        })

        // Register Swagger plugin
        .usePlugin(async (app: FastifyInstance) => {
            startupLogger.logComponentStart('Swagger');

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

            startupLogger.logComponentComplete();
        })

        // Register controllers
        .useControllers([HealthController, TodoController])

        // After start - show helpful info
        .afterStart(async () => {
            logger.info('🎉 Application is ready to accept requests!');
            logger.info('📚 API Documentation available at /api-docs');
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
