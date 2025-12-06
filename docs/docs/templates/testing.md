---
id: testing
title: Testing Template
sidebar_label: Testing
description: Comprehensive testing strategies and examples
keywords: [bootifyjs, testing, unit tests, integration tests, template]
---

# Testing Template

This template provides comprehensive testing strategies for BootifyJS applications, including unit tests, integration tests, and end-to-end tests.

## Setup

### Install Testing Dependencies

```bash
npm install --save-dev jest @types/jest ts-jest supertest @types/supertest
```

### Jest Configuration

```javascript title="jest.config.js"
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/**/index.ts"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

## Unit Testing

### Testing Services

```typescript title="tests/unit/services/user.service.test.ts"
import { UserService } from "../../../src/services/user.service";
import { UserRepository } from "../../../src/repositories/user.repository";
import {
  NotFoundError,
  ConflictError,
} from "../../../src/errors/custom-errors";

describe("UserService", () => {
  let userService: UserService;
  let userRepository: jest.Mocked<UserRepository>;

  beforeEach(() => {
    // Create mock repository
    userRepository = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;

    userService = new UserService(userRepository);
  });

  describe("getUserById", () => {
    it("should return user when found", async () => {
      const mockUser = {
        id: "1",
        email: "test@example.com",
        name: "Test User",
      };

      userRepository.findById.mockResolvedValue(mockUser);

      const result = await userService.getUserById("1");

      expect(result).toEqual(mockUser);
      expect(userRepository.findById).toHaveBeenCalledWith("1");
    });

    it("should throw NotFoundError when user not found", async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(userService.getUserById("999")).rejects.toThrow(
        NotFoundError
      );
      expect(userRepository.findById).toHaveBeenCalledWith("999");
    });
  });

  describe("createUser", () => {
    it("should create user successfully", async () => {
      const userData = {
        email: "new@example.com",
        name: "New User",
        password: "password123",
      };

      const createdUser = {
        id: "1",
        ...userData,
      };

      userRepository.findByEmail.mockResolvedValue(null);
      userRepository.create.mockResolvedValue(createdUser);

      const result = await userService.createUser(userData);

      expect(result).toEqual(createdUser);
      expect(userRepository.findByEmail).toHaveBeenCalledWith(userData.email);
      expect(userRepository.create).toHaveBeenCalledWith(userData);
    });

    it("should throw ConflictError when email already exists", async () => {
      const userData = {
        email: "existing@example.com",
        name: "User",
        password: "password123",
      };

      userRepository.findByEmail.mockResolvedValue({ id: "1" } as any);

      await expect(userService.createUser(userData)).rejects.toThrow(
        ConflictError
      );
      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("updateUser", () => {
    it("should update user successfully", async () => {
      const existingUser = {
        id: "1",
        email: "old@example.com",
        name: "Old Name",
      };

      const updateData = {
        name: "New Name",
      };

      const updatedUser = {
        ...existingUser,
        ...updateData,
      };

      userRepository.findById.mockResolvedValue(existingUser);
      userRepository.update.mockResolvedValue(updatedUser);

      const result = await userService.updateUser("1", updateData);

      expect(result).toEqual(updatedUser);
      expect(userRepository.update).toHaveBeenCalledWith("1", updateData);
    });

    it("should throw ConflictError when updating to existing email", async () => {
      const existingUser = {
        id: "1",
        email: "user1@example.com",
        name: "User 1",
      };

      const otherUser = {
        id: "2",
        email: "user2@example.com",
        name: "User 2",
      };

      userRepository.findById.mockResolvedValue(existingUser);
      userRepository.findByEmail.mockResolvedValue(otherUser);

      await expect(
        userService.updateUser("1", { email: "user2@example.com" })
      ).rejects.toThrow(ConflictError);
    });
  });

  describe("deleteUser", () => {
    it("should delete user successfully", async () => {
      const user = { id: "1", email: "test@example.com", name: "Test" };

      userRepository.findById.mockResolvedValue(user);
      userRepository.delete.mockResolvedValue(true);

      await userService.deleteUser("1");

      expect(userRepository.delete).toHaveBeenCalledWith("1");
    });

    it("should throw NotFoundError when user does not exist", async () => {
      userRepository.findById.mockResolvedValue(null);

      await expect(userService.deleteUser("999")).rejects.toThrow(
        NotFoundError
      );
      expect(userRepository.delete).not.toHaveBeenCalled();
    });
  });
});
```

### Testing Repositories

```typescript title="tests/unit/repositories/user.repository.test.ts"
import { UserRepository } from "../../../src/repositories/user.repository";

describe("UserRepository", () => {
  let repository: UserRepository;

  beforeEach(() => {
    repository = new UserRepository();
  });

  describe("create", () => {
    it("should create and return user", async () => {
      const userData = {
        email: "test@example.com",
        name: "Test User",
        passwordHash: "hashed",
      };

      const user = await repository.create(userData);

      expect(user).toMatchObject(userData);
      expect(user.id).toBeDefined();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("findById", () => {
    it("should return user when found", async () => {
      const user = await repository.create({
        email: "test@example.com",
        name: "Test",
        passwordHash: "hash",
      });

      const found = await repository.findById(user.id);

      expect(found).toEqual(user);
    });

    it("should return null when not found", async () => {
      const found = await repository.findById("nonexistent");

      expect(found).toBeNull();
    });
  });

  describe("findByEmail", () => {
    it("should return user when found", async () => {
      const user = await repository.create({
        email: "test@example.com",
        name: "Test",
        passwordHash: "hash",
      });

      const found = await repository.findByEmail("test@example.com");

      expect(found).toEqual(user);
    });

    it("should return null when not found", async () => {
      const found = await repository.findByEmail("nonexistent@example.com");

      expect(found).toBeNull();
    });
  });

  describe("update", () => {
    it("should update and return user", async () => {
      const user = await repository.create({
        email: "test@example.com",
        name: "Old Name",
        passwordHash: "hash",
      });

      const updated = await repository.update(user.id, { name: "New Name" });

      expect(updated?.name).toBe("New Name");
      expect(updated?.email).toBe("test@example.com");
    });

    it("should return null when user not found", async () => {
      const updated = await repository.update("nonexistent", { name: "New" });

      expect(updated).toBeNull();
    });
  });

  describe("delete", () => {
    it("should delete user and return true", async () => {
      const user = await repository.create({
        email: "test@example.com",
        name: "Test",
        passwordHash: "hash",
      });

      const deleted = await repository.delete(user.id);

      expect(deleted).toBe(true);
      expect(await repository.findById(user.id)).toBeNull();
    });

    it("should return false when user not found", async () => {
      const deleted = await repository.delete("nonexistent");

      expect(deleted).toBe(false);
    });
  });
});
```

## Integration Testing

### Testing Controllers

```typescript title="tests/integration/controllers/user.controller.test.ts"
import { BootifyApp } from "bootifyjs";
import request from "supertest";
import { UserController } from "../../../src/controllers/user.controller";
import { UserService } from "../../../src/services/user.service";
import { UserRepository } from "../../../src/repositories/user.repository";

describe("UserController Integration Tests", () => {
  let app: BootifyApp;
  let server: any;

  beforeAll(async () => {
    app = new BootifyApp({
      port: 0, // Random port
      controllers: [UserController],
      providers: [UserService, UserRepository],
    });

    server = await app.start();
  });

  afterAll(async () => {
    await app.stop();
  });

  describe("POST /api/users", () => {
    it("should create user successfully", async () => {
      const userData = {
        email: "test@example.com",
        name: "Test User",
        password: "password123",
      };

      const response = await request(server)
        .post("/api/users")
        .send(userData)
        .expect(201);

      expect(response.body).toMatchObject({
        statusCode: 201,
        message: "User created successfully",
      });
      expect(response.body.data).toMatchObject({
        email: userData.email,
        name: userData.name,
      });
      expect(response.body.data.id).toBeDefined();
    });

    it("should return 400 for invalid data", async () => {
      const response = await request(server)
        .post("/api/users")
        .send({
          email: "invalid-email",
          name: "T", // Too short
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it("should return 409 for duplicate email", async () => {
      const userData = {
        email: "duplicate@example.com",
        name: "User",
        password: "password123",
      };

      // Create first user
      await request(server).post("/api/users").send(userData).expect(201);

      // Try to create duplicate
      const response = await request(server)
        .post("/api/users")
        .send(userData)
        .expect(409);

      expect(response.body.error.code).toBe("CONFLICT");
    });
  });

  describe("GET /api/users/:id", () => {
    it("should return user when found", async () => {
      // Create user first
      const createResponse = await request(server).post("/api/users").send({
        email: "get@example.com",
        name: "Get User",
        password: "password123",
      });

      const userId = createResponse.body.data.id;

      // Get user
      const response = await request(server)
        .get(`/api/users/${userId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: userId,
        email: "get@example.com",
        name: "Get User",
      });
    });

    it("should return 404 when user not found", async () => {
      const response = await request(server)
        .get("/api/users/nonexistent")
        .expect(404);

      expect(response.body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PUT /api/users/:id", () => {
    it("should update user successfully", async () => {
      // Create user
      const createResponse = await request(server).post("/api/users").send({
        email: "update@example.com",
        name: "Old Name",
        password: "password123",
      });

      const userId = createResponse.body.data.id;

      // Update user
      const response = await request(server)
        .put(`/api/users/${userId}`)
        .send({ name: "New Name" })
        .expect(200);

      expect(response.body.data.name).toBe("New Name");
      expect(response.body.message).toBe("User updated successfully");
    });
  });

  describe("DELETE /api/users/:id", () => {
    it("should delete user successfully", async () => {
      // Create user
      const createResponse = await request(server).post("/api/users").send({
        email: "delete@example.com",
        name: "Delete User",
        password: "password123",
      });

      const userId = createResponse.body.data.id;

      // Delete user
      await request(server).delete(`/api/users/${userId}`).expect(200);

      // Verify user is deleted
      await request(server).get(`/api/users/${userId}`).expect(404);
    });
  });
});
```

### Testing with Authentication

```typescript title="tests/integration/auth/protected-routes.test.ts"
import { BootifyApp } from "bootifyjs";
import request from "supertest";
import { AuthController } from "../../../src/controllers/auth.controller";
import { ProfileController } from "../../../src/controllers/profile.controller";

describe("Protected Routes", () => {
  let app: BootifyApp;
  let server: any;
  let accessToken: string;

  beforeAll(async () => {
    app = new BootifyApp({
      port: 0,
      controllers: [AuthController, ProfileController],
      providers: [
        /* auth providers */
      ],
    });

    server = await app.start();

    // Register and login to get token
    await request(server).post("/api/auth/register").send({
      email: "test@example.com",
      name: "Test User",
      password: "password123",
    });

    const loginResponse = await request(server).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });

    accessToken = loginResponse.body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await app.stop();
  });

  it("should access protected route with valid token", async () => {
    const response = await request(server)
      .get("/api/profile")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      email: "test@example.com",
      name: "Test User",
    });
  });

  it("should reject request without token", async () => {
    await request(server).get("/api/profile").expect(401);
  });

  it("should reject request with invalid token", async () => {
    await request(server)
      .get("/api/profile")
      .set("Authorization", "Bearer invalid-token")
      .expect(401);
  });
});
```

## Testing Event Handlers

```typescript title="tests/unit/handlers/order.handlers.test.ts"
import { OrderEventHandlers } from "../../../src/handlers/order.handlers";
import { OrderCreatedEvent } from "../../../src/events/order.events";
import { EmailService } from "../../../src/services/email.service";
import { InventoryService } from "../../../src/services/inventory.service";

describe("OrderEventHandlers", () => {
  let handlers: OrderEventHandlers;
  let emailService: jest.Mocked<EmailService>;
  let inventoryService: jest.Mocked<InventoryService>;

  beforeEach(() => {
    emailService = {
      sendOrderConfirmation: jest.fn(),
    } as any;

    inventoryService = {
      reserveItems: jest.fn(),
    } as any;

    handlers = new OrderEventHandlers(emailService, inventoryService);
  });

  describe("handleOrderCreated", () => {
    it("should send email and reserve inventory", async () => {
      const event = new OrderCreatedEvent(
        "order-1",
        "user-1",
        [{ productId: "prod-1", quantity: 2, price: 10 }],
        20
      );

      await handlers.handleOrderCreated(event);

      expect(emailService.sendOrderConfirmation).toHaveBeenCalledWith(
        "user-1",
        "order-1",
        event.items,
        20
      );

      expect(inventoryService.reserveItems).toHaveBeenCalledWith(
        "order-1",
        event.items
      );
    });
  });
});
```

## Test Utilities

### Test Data Factories

```typescript title="tests/utils/factories.ts"
export class UserFactory {
  static create(overrides?: Partial<any>) {
    return {
      id: Math.random().toString(),
      email: `user${Math.random()}@example.com`,
      name: "Test User",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createMany(count: number, overrides?: Partial<any>) {
    return Array.from({ length: count }, () => this.create(overrides));
  }
}
```

### Mock Helpers

```typescript title="tests/utils/mocks.ts"
export function createMockRepository<T>() {
  return {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  } as jest.Mocked<T>;
}

export function createMockLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
}
```

## Best Practices

- **Isolation**: Test units in isolation with mocks
- **Coverage**: Aim for high test coverage (80%+)
- **Descriptive Names**: Use clear, descriptive test names
- **Arrange-Act-Assert**: Follow AAA pattern
- **One Assertion**: Focus on one thing per test
- **Fast Tests**: Keep tests fast and independent
- **Clean Up**: Clean up resources after tests
- **Test Edge Cases**: Test error conditions and edge cases

## Running Tests

```json title="package.json"
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration"
  }
}
```

:::tip
Write tests as you develop features. Test-driven development (TDD) can help you write better, more maintainable code.
:::
