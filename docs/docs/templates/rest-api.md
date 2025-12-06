---
id: rest-api
title: REST API Template
sidebar_label: REST API
description: Complete REST API template with CRUD operations
keywords: [bootifyjs, rest api, crud, template]
---

# REST API Template

This template provides a complete REST API implementation with CRUD operations, validation, error handling, and best practices.

## Complete Example

### 1. Define Data Model and Validation Schema

```typescript title="src/models/product.model.ts"
import { z } from "zod";

// Validation schema
export const ProductSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  price: z.number().positive(),
  category: z.string(),
  inStock: z.boolean().default(true),
});

export const UpdateProductSchema = ProductSchema.partial();

// TypeScript types
export type Product = z.infer<typeof ProductSchema> & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateProductDto = z.infer<typeof ProductSchema>;
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;
```

### 2. Create Repository Layer

```typescript title="src/repositories/product.repository.ts"
import { Injectable } from "bootifyjs";
import {
  Product,
  CreateProductDto,
  UpdateProductDto,
} from "../models/product.model";

@Injectable()
export class ProductRepository {
  private products: Map<string, Product> = new Map();
  private idCounter = 1;

  async findAll(): Promise<Product[]> {
    return Array.from(this.products.values());
  }

  async findById(id: string): Promise<Product | null> {
    return this.products.get(id) || null;
  }

  async findByCategory(category: string): Promise<Product[]> {
    return Array.from(this.products.values()).filter(
      (p) => p.category === category
    );
  }

  async create(data: CreateProductDto): Promise<Product> {
    const product: Product = {
      id: (this.idCounter++).toString(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.products.set(product.id, product);
    return product;
  }

  async update(id: string, data: UpdateProductDto): Promise<Product | null> {
    const product = this.products.get(id);
    if (!product) return null;

    const updated: Product = {
      ...product,
      ...data,
      updatedAt: new Date(),
    };

    this.products.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.products.delete(id);
  }

  async exists(id: string): Promise<boolean> {
    return this.products.has(id);
  }
}
```

### 3. Create Service Layer

```typescript title="src/services/product.service.ts"
import { Injectable } from "bootifyjs";
import { ProductRepository } from "../repositories/product.repository";
import {
  CreateProductDto,
  UpdateProductDto,
  Product,
} from "../models/product.model";

@Injectable()
export class ProductService {
  constructor(private productRepository: ProductRepository) {}

  async getAllProducts(): Promise<Product[]> {
    return this.productRepository.findAll();
  }

  async getProductById(id: string): Promise<Product> {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new Error(`Product with id ${id} not found`);
    }
    return product;
  }

  async getProductsByCategory(category: string): Promise<Product[]> {
    return this.productRepository.findByCategory(category);
  }

  async createProduct(data: CreateProductDto): Promise<Product> {
    // Additional business logic can go here
    return this.productRepository.create(data);
  }

  async updateProduct(id: string, data: UpdateProductDto): Promise<Product> {
    const exists = await this.productRepository.exists(id);
    if (!exists) {
      throw new Error(`Product with id ${id} not found`);
    }

    const updated = await this.productRepository.update(id, data);
    if (!updated) {
      throw new Error(`Failed to update product ${id}`);
    }

    return updated;
  }

  async deleteProduct(id: string): Promise<void> {
    const exists = await this.productRepository.exists(id);
    if (!exists) {
      throw new Error(`Product with id ${id} not found`);
    }

    await this.productRepository.delete(id);
  }

  async checkStock(id: string): Promise<boolean> {
    const product = await this.getProductById(id);
    return product.inStock;
  }
}
```

### 4. Create Controller with REST Endpoints

```typescript title="src/controllers/product.controller.ts"
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
import { ProductService } from "../services/product.service";
import {
  ProductSchema,
  UpdateProductSchema,
  CreateProductDto,
  UpdateProductDto,
} from "../models/product.model";

@Controller("/api/products")
export class ProductController {
  constructor(private productService: ProductService) {}

  // GET /api/products - Get all products
  @Get("/")
  async getAllProducts(@Query("category") category?: string) {
    if (category) {
      return this.productService.getProductsByCategory(category);
    }
    return this.productService.getAllProducts();
  }

  // GET /api/products/:id - Get product by ID
  @Get("/:id")
  async getProduct(@Param("id") id: string) {
    try {
      return await this.productService.getProductById(id);
    } catch (error) {
      throw {
        statusCode: 404,
        message: error.message,
      };
    }
  }

  // POST /api/products - Create new product
  @Post("/")
  @Validate(ProductSchema)
  async createProduct(@Body() data: CreateProductDto) {
    const product = await this.productService.createProduct(data);
    return {
      statusCode: 201,
      data: product,
      message: "Product created successfully",
    };
  }

  // PUT /api/products/:id - Update product
  @Put("/:id")
  @Validate(UpdateProductSchema)
  async updateProduct(@Param("id") id: string, @Body() data: UpdateProductDto) {
    try {
      const product = await this.productService.updateProduct(id, data);
      return {
        data: product,
        message: "Product updated successfully",
      };
    } catch (error) {
      throw {
        statusCode: 404,
        message: error.message,
      };
    }
  }

  // DELETE /api/products/:id - Delete product
  @Delete("/:id")
  async deleteProduct(@Param("id") id: string) {
    try {
      await this.productService.deleteProduct(id);
      return {
        message: "Product deleted successfully",
      };
    } catch (error) {
      throw {
        statusCode: 404,
        message: error.message,
      };
    }
  }

  // GET /api/products/:id/stock - Check stock status
  @Get("/:id/stock")
  async checkStock(@Param("id") id: string) {
    try {
      const inStock = await this.productService.checkStock(id);
      return {
        productId: id,
        inStock,
      };
    } catch (error) {
      throw {
        statusCode: 404,
        message: error.message,
      };
    }
  }
}
```

### 5. Bootstrap Application

```typescript title="src/index.ts"
import { BootifyApp } from "bootifyjs";
import { ProductController } from "./controllers/product.controller";
import { ProductService } from "./services/product.service";
import { ProductRepository } from "./repositories/product.repository";

const app = new BootifyApp({
  port: 3000,
  controllers: [ProductController],
  providers: [ProductService, ProductRepository],
});

app.start();
```

## API Endpoints

| Method | Endpoint                             | Description              |
| ------ | ------------------------------------ | ------------------------ |
| GET    | `/api/products`                      | Get all products         |
| GET    | `/api/products?category=electronics` | Get products by category |
| GET    | `/api/products/:id`                  | Get product by ID        |
| POST   | `/api/products`                      | Create new product       |
| PUT    | `/api/products/:id`                  | Update product           |
| DELETE | `/api/products/:id`                  | Delete product           |
| GET    | `/api/products/:id/stock`            | Check stock status       |

## Example Requests

### Create Product

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Laptop",
    "description": "High-performance laptop",
    "price": 999.99,
    "category": "electronics",
    "inStock": true
  }'
```

### Update Product

```bash
curl -X PUT http://localhost:3000/api/products/1 \
  -H "Content-Type: application/json" \
  -d '{
    "price": 899.99,
    "inStock": false
  }'
```

### Get Products by Category

```bash
curl http://localhost:3000/api/products?category=electronics
```

## Best Practices

- **Layered Architecture**: Separate concerns into Repository, Service, and Controller layers
- **Validation**: Use Zod schemas with `@Validate` decorator for request validation
- **Error Handling**: Throw appropriate HTTP errors with meaningful messages
- **Type Safety**: Use TypeScript types derived from Zod schemas
- **RESTful Design**: Follow REST conventions for endpoint naming and HTTP methods
- **Response Format**: Return consistent response structures with status codes and messages

## Next Steps

- Add pagination for list endpoints
- Implement filtering and sorting
- Add authentication and authorization
- Integrate with a real database
- Add comprehensive error handling middleware
- Implement request logging and monitoring

:::tip
For production applications, replace the in-memory Map with a real database like PostgreSQL, MongoDB, or MySQL. See the [Database Integration Template](./database-integration.md) for examples.
:::
