---
id: crud-operations
title: CRUD Operations Template
sidebar_label: CRUD Operations
description: Reusable CRUD operations template with generic patterns
keywords: [bootifyjs, crud, database, template, generic]
---

# CRUD Operations Template

This template provides reusable patterns for implementing CRUD (Create, Read, Update, Delete) operations with BootifyJS, including generic base classes and common patterns.

## Generic Base Repository

Create a reusable base repository that can be extended for any entity:

```typescript title="src/repositories/base.repository.ts"
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class BaseRepository<T extends BaseEntity> {
  protected items: Map<string, T> = new Map();
  protected idCounter = 1;

  async findAll(): Promise<T[]> {
    return Array.from(this.items.values());
  }

  async findById(id: string): Promise<T | null> {
    return this.items.get(id) || null;
  }

  async findMany(ids: string[]): Promise<T[]> {
    return ids
      .map((id) => this.items.get(id))
      .filter((item): item is T => item !== null);
  }

  async create(data: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T> {
    const entity = {
      ...data,
      id: (this.idCounter++).toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as T;

    this.items.set(entity.id, entity);
    return entity;
  }

  async update(
    id: string,
    data: Partial<Omit<T, "id" | "createdAt">>
  ): Promise<T | null> {
    const entity = this.items.get(id);
    if (!entity) return null;

    const updated = {
      ...entity,
      ...data,
      updatedAt: new Date(),
    } as T;

    this.items.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.items.has(id);
  }

  async count(): Promise<number> {
    return this.items.size;
  }

  async clear(): Promise<void> {
    this.items.clear();
  }

  // Pagination
  async findPaginated(
    page: number = 1,
    limit: number = 10
  ): Promise<{
    items: T[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const all = Array.from(this.items.values());
    const total = all.length;
    const totalPages = Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = all.slice(start, start + limit);

    return { items, total, page, totalPages };
  }

  // Filtering
  protected filter(predicate: (item: T) => boolean): T[] {
    return Array.from(this.items.values()).filter(predicate);
  }

  // Sorting
  protected sort(
    items: T[],
    field: keyof T,
    order: "asc" | "desc" = "asc"
  ): T[] {
    return items.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal < bVal) return order === "asc" ? -1 : 1;
      if (aVal > bVal) return order === "asc" ? 1 : -1;
      return 0;
    });
  }
}
```

## Generic Base Service

Create a reusable base service with common CRUD operations:

```typescript title="src/services/base.service.ts"
import { BaseRepository, BaseEntity } from "../repositories/base.repository";

export abstract class BaseService<T extends BaseEntity> {
  constructor(protected repository: BaseRepository<T>) {}

  async getAll(): Promise<T[]> {
    return this.repository.findAll();
  }

  async getById(id: string): Promise<T> {
    const entity = await this.repository.findById(id);
    if (!entity) {
      throw new Error(`${this.getEntityName()} with id ${id} not found`);
    }
    return entity;
  }

  async getMany(ids: string[]): Promise<T[]> {
    return this.repository.findMany(ids);
  }

  async create(data: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T> {
    await this.validateCreate(data);
    return this.repository.create(data);
  }

  async update(
    id: string,
    data: Partial<Omit<T, "id" | "createdAt">>
  ): Promise<T> {
    const exists = await this.repository.exists(id);
    if (!exists) {
      throw new Error(`${this.getEntityName()} with id ${id} not found`);
    }

    await this.validateUpdate(id, data);
    const updated = await this.repository.update(id, data);

    if (!updated) {
      throw new Error(`Failed to update ${this.getEntityName()} ${id}`);
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    const exists = await this.repository.exists(id);
    if (!exists) {
      throw new Error(`${this.getEntityName()} with id ${id} not found`);
    }

    await this.beforeDelete(id);
    await this.repository.delete(id);
    await this.afterDelete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.repository.exists(id);
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async getPaginated(page: number = 1, limit: number = 10) {
    return this.repository.findPaginated(page, limit);
  }

  // Hooks for subclasses to override
  protected async validateCreate(data: any): Promise<void> {
    // Override in subclass for custom validation
  }

  protected async validateUpdate(id: string, data: any): Promise<void> {
    // Override in subclass for custom validation
  }

  protected async beforeDelete(id: string): Promise<void> {
    // Override in subclass for pre-delete logic
  }

  protected async afterDelete(id: string): Promise<void> {
    // Override in subclass for post-delete logic
  }

  protected abstract getEntityName(): string;
}
```

## Example: Book CRUD Implementation

### 1. Define Book Model

```typescript title="src/models/book.model.ts"
import { z } from "zod";
import { BaseEntity } from "../repositories/base.repository";

export const BookSchema = z.object({
  title: z.string().min(1).max(200),
  author: z.string().min(1).max(100),
  isbn: z.string().regex(/^\d{13}$/),
  publishedYear: z.number().int().min(1000).max(new Date().getFullYear()),
  genre: z.string(),
  available: z.boolean().default(true),
});

export const UpdateBookSchema = BookSchema.partial();

export interface Book extends BaseEntity {
  title: string;
  author: string;
  isbn: string;
  publishedYear: number;
  genre: string;
  available: boolean;
}

export type CreateBookDto = z.infer<typeof BookSchema>;
export type UpdateBookDto = z.infer<typeof UpdateBookSchema>;
```

### 2. Create Book Repository

```typescript title="src/repositories/book.repository.ts"
import { Injectable } from "bootifyjs";
import { BaseRepository } from "./base.repository";
import { Book } from "../models/book.model";

@Injectable()
export class BookRepository extends BaseRepository<Book> {
  async findByAuthor(author: string): Promise<Book[]> {
    return this.filter((book) => book.author === author);
  }

  async findByGenre(genre: string): Promise<Book[]> {
    return this.filter((book) => book.genre === genre);
  }

  async findByIsbn(isbn: string): Promise<Book | null> {
    return this.filter((book) => book.isbn === isbn)[0] || null;
  }

  async findAvailable(): Promise<Book[]> {
    return this.filter((book) => book.available);
  }

  async search(query: string): Promise<Book[]> {
    const lowerQuery = query.toLowerCase();
    return this.filter(
      (book) =>
        book.title.toLowerCase().includes(lowerQuery) ||
        book.author.toLowerCase().includes(lowerQuery)
    );
  }
}
```

### 3. Create Book Service

```typescript title="src/services/book.service.ts"
import { Injectable } from "bootifyjs";
import { BaseService } from "./base.service";
import { BookRepository } from "../repositories/book.repository";
import { Book, CreateBookDto, UpdateBookDto } from "../models/book.model";

@Injectable()
export class BookService extends BaseService<Book> {
  constructor(protected repository: BookRepository) {
    super(repository);
  }

  protected getEntityName(): string {
    return "Book";
  }

  async getByAuthor(author: string): Promise<Book[]> {
    return this.repository.findByAuthor(author);
  }

  async getByGenre(genre: string): Promise<Book[]> {
    return this.repository.findByGenre(genre);
  }

  async getByIsbn(isbn: string): Promise<Book> {
    const book = await this.repository.findByIsbn(isbn);
    if (!book) {
      throw new Error(`Book with ISBN ${isbn} not found`);
    }
    return book;
  }

  async getAvailable(): Promise<Book[]> {
    return this.repository.findAvailable();
  }

  async search(query: string): Promise<Book[]> {
    return this.repository.search(query);
  }

  async borrowBook(id: string): Promise<Book> {
    const book = await this.getById(id);
    if (!book.available) {
      throw new Error("Book is not available");
    }
    return this.update(id, { available: false });
  }

  async returnBook(id: string): Promise<Book> {
    return this.update(id, { available: true });
  }

  // Override validation hooks
  protected async validateCreate(data: CreateBookDto): Promise<void> {
    const existing = await this.repository.findByIsbn(data.isbn);
    if (existing) {
      throw new Error(`Book with ISBN ${data.isbn} already exists`);
    }
  }

  protected async validateUpdate(
    id: string,
    data: UpdateBookDto
  ): Promise<void> {
    if (data.isbn) {
      const existing = await this.repository.findByIsbn(data.isbn);
      if (existing && existing.id !== id) {
        throw new Error(`Book with ISBN ${data.isbn} already exists`);
      }
    }
  }
}
```

### 4. Create Book Controller

```typescript title="src/controllers/book.controller.ts"
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Validate,
  Param,
  Body,
  Query,
} from "bootifyjs";
import { BookService } from "../services/book.service";
import {
  BookSchema,
  UpdateBookSchema,
  CreateBookDto,
  UpdateBookDto,
} from "../models/book.model";

@Controller("/api/books")
export class BookController {
  constructor(private bookService: BookService) {}

  @Get("/")
  async getBooks(
    @Query("author") author?: string,
    @Query("genre") genre?: string,
    @Query("search") search?: string,
    @Query("available") available?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    // Filter by specific criteria
    if (author) {
      return this.bookService.getByAuthor(author);
    }
    if (genre) {
      return this.bookService.getByGenre(genre);
    }
    if (search) {
      return this.bookService.search(search);
    }
    if (available === "true") {
      return this.bookService.getAvailable();
    }

    // Pagination
    if (page || limit) {
      const pageNum = parseInt(page || "1");
      const limitNum = parseInt(limit || "10");
      return this.bookService.getPaginated(pageNum, limitNum);
    }

    return this.bookService.getAll();
  }

  @Get("/:id")
  async getBook(@Param("id") id: string) {
    try {
      return await this.bookService.getById(id);
    } catch (error) {
      throw { statusCode: 404, message: error.message };
    }
  }

  @Get("/isbn/:isbn")
  async getBookByIsbn(@Param("isbn") isbn: string) {
    try {
      return await this.bookService.getByIsbn(isbn);
    } catch (error) {
      throw { statusCode: 404, message: error.message };
    }
  }

  @Post("/")
  @Validate(BookSchema)
  async createBook(@Body() data: CreateBookDto) {
    try {
      const book = await this.bookService.create(data);
      return {
        statusCode: 201,
        data: book,
        message: "Book created successfully",
      };
    } catch (error) {
      throw { statusCode: 400, message: error.message };
    }
  }

  @Put("/:id")
  @Validate(UpdateBookSchema)
  async updateBook(@Param("id") id: string, @Body() data: UpdateBookDto) {
    try {
      const book = await this.bookService.update(id, data);
      return {
        data: book,
        message: "Book updated successfully",
      };
    } catch (error) {
      throw { statusCode: 404, message: error.message };
    }
  }

  @Delete("/:id")
  async deleteBook(@Param("id") id: string) {
    try {
      await this.bookService.delete(id);
      return { message: "Book deleted successfully" };
    } catch (error) {
      throw { statusCode: 404, message: error.message };
    }
  }

  @Post("/:id/borrow")
  async borrowBook(@Param("id") id: string) {
    try {
      const book = await this.bookService.borrowBook(id);
      return {
        data: book,
        message: "Book borrowed successfully",
      };
    } catch (error) {
      throw { statusCode: 400, message: error.message };
    }
  }

  @Post("/:id/return")
  async returnBook(@Param("id") id: string) {
    try {
      const book = await this.bookService.returnBook(id);
      return {
        data: book,
        message: "Book returned successfully",
      };
    } catch (error) {
      throw { statusCode: 400, message: error.message };
    }
  }
}
```

## Advanced Patterns

### Soft Delete

```typescript
export interface SoftDeletableEntity extends BaseEntity {
  deletedAt: Date | null;
}

export abstract class SoftDeleteRepository<
  T extends SoftDeletableEntity
> extends BaseRepository<T> {
  async findAll(): Promise<T[]> {
    return this.filter((item) => item.deletedAt === null);
  }

  async findAllIncludingDeleted(): Promise<T[]> {
    return Array.from(this.items.values());
  }

  async softDelete(id: string): Promise<boolean> {
    const entity = this.items.get(id);
    if (!entity) return false;

    entity.deletedAt = new Date();
    entity.updatedAt = new Date();
    return true;
  }

  async restore(id: string): Promise<boolean> {
    const entity = this.items.get(id);
    if (!entity) return false;

    entity.deletedAt = null;
    entity.updatedAt = new Date();
    return true;
  }
}
```

### Bulk Operations

```typescript
export abstract class BulkOperationsRepository<
  T extends BaseEntity
> extends BaseRepository<T> {
  async createMany(
    items: Omit<T, "id" | "createdAt" | "updatedAt">[]
  ): Promise<T[]> {
    return Promise.all(items.map((item) => this.create(item)));
  }

  async updateMany(updates: { id: string; data: Partial<T> }[]): Promise<T[]> {
    const results: T[] = [];
    for (const { id, data } of updates) {
      const updated = await this.update(id, data);
      if (updated) results.push(updated);
    }
    return results;
  }

  async deleteMany(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (await this.delete(id)) count++;
    }
    return count;
  }
}
```

## Best Practices

- **Generic Base Classes**: Use base classes to avoid code duplication
- **Type Safety**: Leverage TypeScript generics for type-safe operations
- **Validation Hooks**: Override validation methods for custom business logic
- **Error Handling**: Throw meaningful errors with context
- **Pagination**: Always support pagination for list endpoints
- **Filtering**: Provide flexible filtering options
- **Soft Delete**: Consider soft delete for important data
- **Bulk Operations**: Support bulk operations for efficiency

## Next Steps

- Add transaction support
- Implement optimistic locking
- Add audit logging
- Implement caching layer
- Add full-text search
- Support complex queries
- Add data export/import

:::tip
These generic base classes can be extended for any entity type, reducing boilerplate code and ensuring consistency across your application.
:::
