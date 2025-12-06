---
id: first-application
title: First Application
sidebar_label: First Application
sidebar_position: 4
description: Build a complete CRUD application with BootifyJS from scratch
keywords: [bootifyjs, tutorial, crud, rest api, first app, example]
---

# Build Your First Application

In this tutorial, you'll build a complete Task Management API with BootifyJS. You'll learn how to create controllers, services, repositories, add validation, and implement all CRUD operations.

## What You'll Build

A REST API for managing tasks with the following features:

- Create, read, update, and delete tasks
- Input validation with Zod
- Dependency injection
- Proper error handling
- Clean architecture with separation of concerns

## Prerequisites

Make sure you have:

- Completed the [Installation](./installation.md) guide
- Node.js 18+ and npm installed
- Basic understanding of TypeScript

## Step 1: Project Setup

Create a new project:

```bash
mkdir task-api
cd task-api
npm init -y
```

Install dependencies:

```bash
# Core dependencies
npm install bootifyjs fastify reflect-metadata zod dotenv

# Development dependencies
npm install -D typescript @types/node ts-node nodemon @types/dotenv
```

Create `tsconfig.json`:

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
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Add scripts to `package.json`:

```json title="package.json"
{
  "scripts": {
    "dev": "nodemon --watch src --exec ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

Create project structure:

```bash
mkdir -p src/{controllers,services,repositories,models}
```

## Step 2: Define the Data Model

Create the task model with validation schemas:

```typescript title="src/models/task.model.ts"
import { z } from "zod";

// Task status enum
export enum TaskStatus {
  TODO = "TODO",
  IN_PROGRESS = "IN_PROGRESS",
  DONE = "DONE",
}

// Task priority enum
export enum TaskPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

// Full task schema
export const TaskSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  status: z.nativeEnum(TaskStatus),
  priority: z.nativeEnum(TaskPriority),
  dueDate: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Create task DTO (Data Transfer Object)
export const CreateTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(100, "Title too long"),
  description: z.string().max(500, "Description too long").optional(),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.TODO),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  dueDate: z.string().datetime().optional(),
});

// Update task DTO (all fields optional)
export const UpdateTaskSchema = CreateTaskSchema.partial();

// Query parameters for filtering
export const TaskQuerySchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  search: z.string().optional(),
});

// TypeScript types
export type Task = z.infer<typeof TaskSchema>;
export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskDto = z.infer<typeof UpdateTaskSchema>;
export type TaskQuery = z.infer<typeof TaskQuerySchema>;
```

## Step 3: Create the Repository

The repository handles data storage and retrieval:

```typescript title="src/repositories/task.repository.ts"
import { Repository } from "bootifyjs";
import { Task, TaskStatus, TaskPriority } from "../models/task.model";

@Repository()
export class TaskRepository {
  private tasks: Task[] = [
    {
      id: "1",
      title: "Learn BootifyJS",
      description: "Complete the getting started tutorial",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "2",
      title: "Build an API",
      description: "Create a REST API with BootifyJS",
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  private nextId = 3;

  async findAll(): Promise<Task[]> {
    return [...this.tasks];
  }

  async findById(id: string): Promise<Task | null> {
    return this.tasks.find((task) => task.id === id) || null;
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    return this.tasks.filter((task) => task.status === status);
  }

  async findByPriority(priority: TaskPriority): Promise<Task[]> {
    return this.tasks.filter((task) => task.priority === priority);
  }

  async search(query: string): Promise<Task[]> {
    const lowerQuery = query.toLowerCase();
    return this.tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(lowerQuery) ||
        task.description?.toLowerCase().includes(lowerQuery)
    );
  }

  async create(
    data: Omit<Task, "id" | "createdAt" | "updatedAt">
  ): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: String(this.nextId++),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    return task;
  }

  async update(id: string, data: Partial<Task>): Promise<Task | null> {
    const index = this.tasks.findIndex((task) => task.id === id);
    if (index === -1) return null;

    this.tasks[index] = {
      ...this.tasks[index],
      ...data,
      id: this.tasks[index].id, // Prevent ID change
      updatedAt: new Date().toISOString(),
    };

    return this.tasks[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.tasks.findIndex((task) => task.id === id);
    if (index === -1) return false;

    this.tasks.splice(index, 1);
    return true;
  }

  async count(): Promise<number> {
    return this.tasks.length;
  }
}
```

## Step 4: Create the Service

The service contains business logic:

```typescript title="src/services/task.service.ts"
import { Service, Autowired } from "bootifyjs";
import { TaskRepository } from "../repositories/task.repository";
import {
  Task,
  CreateTaskDto,
  UpdateTaskDto,
  TaskQuery,
  TaskStatus,
  TaskPriority,
} from "../models/task.model";

@Service()
export class TaskService {
  @Autowired()
  private taskRepository!: TaskRepository;

  async getAllTasks(query?: TaskQuery): Promise<Task[]> {
    // If no filters, return all tasks
    if (!query || (!query.status && !query.priority && !query.search)) {
      return this.taskRepository.findAll();
    }

    let tasks = await this.taskRepository.findAll();

    // Apply filters
    if (query.status) {
      tasks = tasks.filter((task) => task.status === query.status);
    }

    if (query.priority) {
      tasks = tasks.filter((task) => task.priority === query.priority);
    }

    if (query.search) {
      const lowerSearch = query.search.toLowerCase();
      tasks = tasks.filter(
        (task) =>
          task.title.toLowerCase().includes(lowerSearch) ||
          task.description?.toLowerCase().includes(lowerSearch)
      );
    }

    return tasks;
  }

  async getTaskById(id: string): Promise<Task> {
    const task = await this.taskRepository.findById(id);
    if (!task) {
      throw new Error(`Task with ID ${id} not found`);
    }
    return task;
  }

  async createTask(data: CreateTaskDto): Promise<Task> {
    // Business logic: validate due date is in the future
    if (data.dueDate) {
      const dueDate = new Date(data.dueDate);
      if (dueDate < new Date()) {
        throw new Error("Due date must be in the future");
      }
    }

    return this.taskRepository.create({
      title: data.title,
      description: data.description,
      status: data.status || TaskStatus.TODO,
      priority: data.priority || TaskPriority.MEDIUM,
      dueDate: data.dueDate,
    });
  }

  async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
    // Check if task exists
    const existingTask = await this.taskRepository.findById(id);
    if (!existingTask) {
      throw new Error(`Task with ID ${id} not found`);
    }

    // Business logic: validate due date
    if (data.dueDate) {
      const dueDate = new Date(data.dueDate);
      if (dueDate < new Date()) {
        throw new Error("Due date must be in the future");
      }
    }

    const updated = await this.taskRepository.update(id, data);
    if (!updated) {
      throw new Error(`Failed to update task ${id}`);
    }

    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    const deleted = await this.taskRepository.delete(id);
    if (!deleted) {
      throw new Error(`Task with ID ${id} not found`);
    }
  }

  async getTaskStats(): Promise<{
    total: number;
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<TaskPriority, number>;
  }> {
    const tasks = await this.taskRepository.findAll();

    const byStatus = {
      [TaskStatus.TODO]: 0,
      [TaskStatus.IN_PROGRESS]: 0,
      [TaskStatus.DONE]: 0,
    };

    const byPriority = {
      [TaskPriority.LOW]: 0,
      [TaskPriority.MEDIUM]: 0,
      [TaskPriority.HIGH]: 0,
    };

    tasks.forEach((task) => {
      byStatus[task.status]++;
      byPriority[task.priority]++;
    });

    return {
      total: tasks.length,
      byStatus,
      byPriority,
    };
  }
}
```

## Step 5: Create the Controller

The controller handles HTTP requests:

```typescript title="src/controllers/task.controller.ts"
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Schema,
  Autowired,
} from "bootifyjs";
import { TaskService } from "../services/task.service";
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  TaskQuerySchema,
  CreateTaskDto,
  UpdateTaskDto,
  TaskQuery,
} from "../models/task.model";

@Controller("/api/tasks")
export class TaskController {
  @Autowired()
  private taskService!: TaskService;

  @Get("/")
  @Schema({
    query: TaskQuerySchema,
  })
  async getAllTasks(@Query() query: TaskQuery) {
    return this.taskService.getAllTasks(query);
  }

  @Get("/stats")
  async getStats() {
    return this.taskService.getTaskStats();
  }

  @Get("/:id")
  async getTaskById(@Param("id") id: string) {
    try {
      return await this.taskService.getTaskById(id);
    } catch (error) {
      throw { statusCode: 404, message: (error as Error).message };
    }
  }

  @Post("/")
  @Schema({
    body: CreateTaskSchema,
  })
  async createTask(@Body() body: CreateTaskDto) {
    try {
      return await this.taskService.createTask(body);
    } catch (error) {
      throw { statusCode: 400, message: (error as Error).message };
    }
  }

  @Put("/:id")
  @Schema({
    body: UpdateTaskSchema,
  })
  async updateTask(@Param("id") id: string, @Body() body: UpdateTaskDto) {
    try {
      return await this.taskService.updateTask(id, body);
    } catch (error) {
      throw { statusCode: 404, message: (error as Error).message };
    }
  }

  @Delete("/:id")
  async deleteTask(@Param("id") id: string) {
    try {
      await this.taskService.deleteTask(id);
      return { message: "Task deleted successfully" };
    } catch (error) {
      throw { statusCode: 404, message: (error as Error).message };
    }
  }
}
```

## Step 6: Bootstrap the Application

Create the main entry point:

```typescript title="src/index.ts"
import "reflect-metadata";
import dotenv from "dotenv";
import { createBootify } from "bootifyjs";
import { z } from "zod";
import { TaskController } from "./controllers/task.controller";

// Load environment variables
dotenv.config();

// Environment schema
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().transform(Number).default("8080"),
});

async function bootstrap() {
  try {
    const { start } = await createBootify()
      .useConfig(envSchema)
      .setPort(process.env.PORT ? parseInt(process.env.PORT) : 8080)
      .useControllers([TaskController])
      .beforeStart(async () => {
        console.log("🚀 Initializing Task Management API...");
      })
      .afterStart(async () => {
        console.log("✅ Task Management API is ready!");
        console.log("📝 Try these endpoints:");
        console.log("   GET    /api/tasks");
        console.log("   GET    /api/tasks/:id");
        console.log("   GET    /api/tasks/stats");
        console.log("   POST   /api/tasks");
        console.log("   PUT    /api/tasks/:id");
        console.log("   DELETE /api/tasks/:id");
      })
      .build();

    await start();
  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
}

bootstrap();
```

Create `.env` file:

```bash title=".env"
NODE_ENV=development
PORT=8080
```

## Step 7: Run and Test

Start the application:

```bash
npm run dev
```

You should see:

```
🚀 Initializing Task Management API...
✓ Server listening at http://localhost:8080
✅ Task Management API is ready!
```

### Test the API

**Get all tasks:**

```bash
curl http://localhost:8080/api/tasks
```

**Get task by ID:**

```bash
curl http://localhost:8080/api/tasks/1
```

**Create a new task:**

```bash
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deploy to production",
    "description": "Deploy the task API to production server",
    "priority": "HIGH",
    "status": "TODO"
  }'
```

**Update a task:**

```bash
curl -X PUT http://localhost:8080/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "DONE"
  }'
```

**Filter tasks by status:**

```bash
curl "http://localhost:8080/api/tasks?status=TODO"
```

**Search tasks:**

```bash
curl "http://localhost:8080/api/tasks?search=deploy"
```

**Get statistics:**

```bash
curl http://localhost:8080/api/tasks/stats
```

**Delete a task:**

```bash
curl -X DELETE http://localhost:8080/api/tasks/1
```

## Step 8: Add Error Handling

Improve error handling with a custom error handler:

```typescript title="src/index.ts"
import { FastifyRequest, FastifyReply } from "fastify";

// Add this before bootstrap()
async function errorHandler(
  error: any,
  request: FastifyRequest,
  reply: FastifyReply
) {
  console.error("Error:", error);

  // Handle validation errors
  if (error.validation) {
    return reply.code(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: "Request validation failed",
      details: error.validation,
    });
  }

  // Handle custom errors
  if (error.statusCode) {
    return reply.code(error.statusCode).send({
      statusCode: error.statusCode,
      error: error.error || "Error",
      message: error.message,
    });
  }

  // Handle unknown errors
  return reply.code(500).send({
    statusCode: 500,
    error: "Internal Server Error",
    message: "An unexpected error occurred",
  });
}

// Update bootstrap function
async function bootstrap() {
  const { start } = await createBootify()
    .useConfig(envSchema)
    .setPort(process.env.PORT ? parseInt(process.env.PORT) : 8080)
    .useErrorHandler(errorHandler) // Add this line
    .useControllers([TaskController]);
  // ... rest of the code
}
```

## Complete Project Structure

Your final project structure should look like this:

```
task-api/
├── src/
│   ├── controllers/
│   │   └── task.controller.ts
│   ├── services/
│   │   └── task.service.ts
│   ├── repositories/
│   │   └── task.repository.ts
│   ├── models/
│   │   └── task.model.ts
│   └── index.ts
├── .env
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## What You've Learned

Congratulations! You've built a complete REST API with BootifyJS. You've learned:

✅ How to structure a BootifyJS application  
✅ Creating models with Zod validation  
✅ Implementing the repository pattern  
✅ Writing services with business logic  
✅ Building controllers with HTTP endpoints  
✅ Using dependency injection with `@Autowired`  
✅ Request validation with `@Schema`  
✅ Error handling  
✅ Query parameters and filtering

## Next Steps

Now that you've built your first application, explore more advanced features:

- **Core Concepts** - Deep dive into framework architecture (coming soon)
- **Events Module** - Add event-driven features (coming soon)
- **Cache Module** - Implement caching (coming soon)
- **Auth Module** - Add authentication (coming soon)
- **Templates** - Explore more code templates (coming soon)

## Full Source Code

The complete source code for this tutorial is available on GitHub:
[BootifyJS Task API Example](https://github.com/piyushpriyadarshi/bootifyjs-examples)

Happy coding! 🚀
