---
id: database-integration
title: Database Integration Template
sidebar_label: Database Integration
description: Database integration patterns with PostgreSQL, MongoDB, and MySQL
keywords: [bootifyjs, database, postgresql, mongodb, mysql, template]
---

# Database Integration Template

This template demonstrates how to integrate various databases with BootifyJS applications, including PostgreSQL, MongoDB, and MySQL.

## PostgreSQL with Prisma

### 1. Install Dependencies

```bash
npm install @prisma/client
npm install --save-dev prisma
npx prisma init
```

### 2. Define Schema

```prisma title="prisma/schema.prisma"
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  name      String
  password  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  posts     Post[]
}

model Post {
  id        String   @id @default(uuid())
  title     String
  content   String?
  published Boolean  @default(false)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 3. Create Database Service

```typescript title="src/services/database.service.ts"
import { Injectable } from "bootifyjs";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class DatabaseService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      log: ["query", "error", "warn"],
    });
  }

  async connect() {
    await this.prisma.$connect();
    console.log("Database connected");
  }

  async disconnect() {
    await this.prisma.$disconnect();
    console.log("Database disconnected");
  }

  getClient() {
    return this.prisma;
  }
}
```

### 4. Create Repository with Prisma

```typescript title="src/repositories/user.repository.ts"
import { Injectable } from "bootifyjs";
import { DatabaseService } from "../services/database.service";

@Injectable()
export class UserRepository {
  constructor(private db: DatabaseService) {}

  async findAll() {
    return this.db.getClient().user.findMany({
      include: { posts: true },
    });
  }

  async findById(id: string) {
    return this.db.getClient().user.findUnique({
      where: { id },
      include: { posts: true },
    });
  }

  async findByEmail(email: string) {
    return this.db.getClient().user.findUnique({
      where: { email },
    });
  }

  async create(data: { email: string; name: string; password: string }) {
    return this.db.getClient().user.create({
      data,
    });
  }

  async update(id: string, data: Partial<{ email: string; name: string }>) {
    return this.db.getClient().user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.db.getClient().user.delete({
      where: { id },
    });
  }

  async findWithPosts(userId: string) {
    return this.db.getClient().user.findUnique({
      where: { id: userId },
      include: {
        posts: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }
}
```

### 5. Create Post Repository

```typescript title="src/repositories/post.repository.ts"
import { Injectable } from "bootifyjs";
import { DatabaseService } from "../services/database.service";

@Injectable()
export class PostRepository {
  constructor(private db: DatabaseService) {}

  async findAll(published?: boolean) {
    return this.db.getClient().post.findMany({
      where: published !== undefined ? { published } : undefined,
      include: { author: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    return this.db.getClient().post.findUnique({
      where: { id },
      include: { author: true },
    });
  }

  async create(data: { title: string; content?: string; authorId: string }) {
    return this.db.getClient().post.create({
      data,
      include: { author: true },
    });
  }

  async update(
    id: string,
    data: Partial<{
      title: string;
      content: string;
      published: boolean;
    }>
  ) {
    return this.db.getClient().post.update({
      where: { id },
      data,
      include: { author: true },
    });
  }

  async delete(id: string) {
    return this.db.getClient().post.delete({
      where: { id },
    });
  }

  async findByAuthor(authorId: string) {
    return this.db.getClient().post.findMany({
      where: { authorId },
      orderBy: { createdAt: "desc" },
    });
  }
}
```

### 6. Environment Configuration

```bash title=".env"
DATABASE_URL="postgresql://user:password@localhost:5432/mydb?schema=public"
```

### 7. Run Migrations

```bash
npx prisma migrate dev --name init
npx prisma generate
```

## MongoDB with Mongoose

### 1. Install Dependencies

```bash
npm install mongoose
npm install --save-dev @types/mongoose
```

### 2. Create Database Service

```typescript title="src/services/mongodb.service.ts"
import { Injectable } from "bootifyjs";
import mongoose from "mongoose";

@Injectable()
export class MongoDBService {
  async connect() {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/mydb";

    await mongoose.connect(uri);
    console.log("MongoDB connected");
  }

  async disconnect() {
    await mongoose.disconnect();
    console.log("MongoDB disconnected");
  }
}
```

### 3. Define Schemas

```typescript title="src/models/user.model.ts"
import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  name: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    password: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export const UserModel = mongoose.model<IUser>("User", UserSchema);
```

```typescript title="src/models/post.model.ts"
import mongoose, { Schema, Document } from "mongoose";

export interface IPost extends Document {
  title: string;
  content?: string;
  published: boolean;
  authorId: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    title: { type: String, required: true },
    content: { type: String },
    published: { type: Boolean, default: false },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
  }
);

export const PostModel = mongoose.model<IPost>("Post", PostSchema);
```

### 4. Create Repository

```typescript title="src/repositories/user.repository.ts"
import { Injectable } from "bootifyjs";
import { UserModel, IUser } from "../models/user.model";

@Injectable()
export class UserRepository {
  async findAll(): Promise<IUser[]> {
    return UserModel.find().exec();
  }

  async findById(id: string): Promise<IUser | null> {
    return UserModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return UserModel.findOne({ email }).exec();
  }

  async create(data: {
    email: string;
    name: string;
    password: string;
  }): Promise<IUser> {
    const user = new UserModel(data);
    return user.save();
  }

  async update(id: string, data: Partial<IUser>): Promise<IUser | null> {
    return UserModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await UserModel.findByIdAndDelete(id).exec();
    return result !== null;
  }

  async search(query: string): Promise<IUser[]> {
    return UserModel.find({
      $or: [
        { name: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
      ],
    }).exec();
  }
}
```

## MySQL with TypeORM

### 1. Install Dependencies

```bash
npm install typeorm mysql2 reflect-metadata
```

### 2. Create Entities

```typescript title="src/entities/user.entity.ts"
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { Post } from "./post.entity";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column()
  password: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Post, (post) => post.author)
  posts: Post[];
}
```

```typescript title="src/entities/post.entity.ts"
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./user.entity";

@Entity("posts")
export class Post {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  title: string;

  @Column({ type: "text", nullable: true })
  content: string;

  @Column({ default: false })
  published: boolean;

  @Column()
  authorId: string;

  @ManyToOne(() => User, (user) => user.posts)
  @JoinColumn({ name: "authorId" })
  author: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 3. Create Database Service

```typescript title="src/services/database.service.ts"
import { Injectable } from "bootifyjs";
import { DataSource } from "typeorm";
import { User } from "../entities/user.entity";
import { Post } from "../entities/post.entity";

@Injectable()
export class DatabaseService {
  private dataSource: DataSource;

  constructor() {
    this.dataSource = new DataSource({
      type: "mysql",
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "3306"),
      username: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "mydb",
      entities: [User, Post],
      synchronize: process.env.NODE_ENV === "development",
      logging: process.env.NODE_ENV === "development",
    });
  }

  async connect() {
    await this.dataSource.initialize();
    console.log("Database connected");
  }

  async disconnect() {
    await this.dataSource.destroy();
    console.log("Database disconnected");
  }

  getDataSource() {
    return this.dataSource;
  }
}
```

### 4. Create Repository

```typescript title="src/repositories/user.repository.ts"
import { Injectable } from "bootifyjs";
import { DatabaseService } from "../services/database.service";
import { User } from "../entities/user.entity";

@Injectable()
export class UserRepository {
  constructor(private db: DatabaseService) {}

  private getRepository() {
    return this.db.getDataSource().getRepository(User);
  }

  async findAll(): Promise<User[]> {
    return this.getRepository().find({
      relations: ["posts"],
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.getRepository().findOne({
      where: { id },
      relations: ["posts"],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.getRepository().findOne({
      where: { email },
    });
  }

  async create(data: {
    email: string;
    name: string;
    password: string;
  }): Promise<User> {
    const user = this.getRepository().create(data);
    return this.getRepository().save(user);
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    await this.getRepository().update(id, data);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.getRepository().delete(id);
    return (result.affected || 0) > 0;
  }

  async search(query: string): Promise<User[]> {
    return this.getRepository()
      .createQueryBuilder("user")
      .where("user.name LIKE :query OR user.email LIKE :query", {
        query: `%${query}%`,
      })
      .getMany();
  }
}
```

## Transaction Support

### Prisma Transactions

```typescript
async createUserWithPost(userData: any, postData: any) {
  return this.db.getClient().$transaction(async (prisma) => {
    const user = await prisma.user.create({
      data: userData,
    });

    const post = await prisma.post.create({
      data: {
        ...postData,
        authorId: user.id,
      },
    });

    return { user, post };
  });
}
```

### Mongoose Transactions

```typescript
async createUserWithPost(userData: any, postData: any) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await UserModel.create([userData], { session });
    const post = await PostModel.create([{
      ...postData,
      authorId: user[0]._id,
    }], { session });

    await session.commitTransaction();
    return { user: user[0], post: post[0] };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

### TypeORM Transactions

```typescript
async createUserWithPost(userData: any, postData: any) {
  return this.db.getDataSource().transaction(async (manager) => {
    const user = manager.create(User, userData);
    await manager.save(user);

    const post = manager.create(Post, {
      ...postData,
      authorId: user.id,
    });
    await manager.save(post);

    return { user, post };
  });
}
```

## Connection Pooling

```typescript title="src/config/database.config.ts"
export const databaseConfig = {
  // PostgreSQL with Prisma
  prisma: {
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    pool: {
      min: 2,
      max: 10,
    },
  },

  // MongoDB
  mongodb: {
    uri: process.env.MONGODB_URI,
    options: {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    },
  },

  // MySQL with TypeORM
  typeorm: {
    type: "mysql",
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306"),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    extra: {
      connectionLimit: 10,
    },
  },
};
```

## Best Practices

- **Connection Management**: Properly manage database connections
- **Transactions**: Use transactions for multi-step operations
- **Indexing**: Add indexes for frequently queried fields
- **Validation**: Validate data before database operations
- **Error Handling**: Handle database errors gracefully
- **Connection Pooling**: Use connection pools for better performance
- **Migrations**: Use migrations for schema changes
- **Soft Deletes**: Consider soft deletes for important data

## Next Steps

- Add database migrations
- Implement database seeding
- Add query optimization
- Set up read replicas
- Implement caching layer
- Add database monitoring
- Set up backup strategies

:::tip
Choose the database that best fits your use case. PostgreSQL for relational data, MongoDB for flexible schemas, MySQL for traditional applications.
:::
