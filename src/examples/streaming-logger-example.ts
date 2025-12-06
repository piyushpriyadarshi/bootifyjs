import dotenv from "dotenv";
import { FastifyInstance } from "fastify";
import "reflect-metadata";
import z from "zod";
import { createBootify } from "../BootifyApp";
import { HealthController } from "./controllers/health.controller";
import { TodoController } from "./controllers/todo.controller";

dotenv.config();

// Example: Spring Boot-style streaming startup logs

const envSchema = z.object({
    NODE_ENV: z.string().min(1),
    JWT_SECRET: z.string().min(1),
});

// Mock services
const mockDatabase = {
    async connect() {
        await new Promise(resolve => setTimeout(resolve, 500));
    },
};

const mockRedis = {
    async connect() {
        await new Promise(resolve => setTimeout(resolve, 200));
    },
};

async function main() {
    const { app, start, startupLogger } = await createBootify()
        .useConfig(envSchema)
        .setPort(8080)

        // Database initialization phase
        .beforeStart(async () => {
            startupLogger.logPhaseStart('Database Initialization')

            startupLogger.logComponentStart('PostgreSQL Connection Pool', 'localhost:5432')
            await mockDatabase.connect()
            startupLogger.logComponentComplete()

            startupLogger.logInfo('Database', 'PostgreSQL 14.5')
            startupLogger.logInfo('Pool size', '10 connections')
            startupLogger.logInfo('Schema', 'public')
        })

        // Cache initialization phase
        .beforeStart(async () => {
            startupLogger.logPhaseStart('Cache Initialization')

            startupLogger.logComponentStart('Redis Connection', 'localhost:6379')
            await mockRedis.connect()
            startupLogger.logComponentComplete()

            startupLogger.logInfo('Cache provider', 'Redis 7.0')
            startupLogger.logInfo('Max memory', '256MB')
        })

        // Plugin registration phase
        .beforeStart(async () => {
            startupLogger.logPhaseStart('Plugin Registration')
        })

        .usePlugin(async (app: FastifyInstance) => {
            startupLogger.logComponentStart('Cookie Parser')
            const fastifyCookie = await import("@fastify/cookie");
            await app.register(fastifyCookie.default, {
                hook: "onRequest",
                parseOptions: {},
            });
            startupLogger.logComponentComplete()
        })

        .usePlugin(async (app: FastifyInstance) => {
            startupLogger.logComponentStart('Swagger Documentation')
            const fastifySwagger = await import("@fastify/swagger");
            const fastifySwaggerUI = await import("@fastify/swagger-ui");

            await app.register(fastifySwagger.default, {
                openapi: {
                    info: {
                        title: "Streaming Logger Example API",
                        version: "1.0.0",
                    },
                    servers: [{ url: `http://localhost:8080` }],
                },
            });

            await app.register(fastifySwaggerUI.default, {
                routePrefix: "/api-docs",
            });
            startupLogger.logComponentComplete()
        })

        .useControllers([HealthController, TodoController])

        .build();

    await start();
}

main().catch((error) => {
    console.error('Application startup failed:', error);
    process.exit(1);
});
