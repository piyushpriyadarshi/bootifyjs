---
slug: mastering-dependency-injection
title: Mastering Dependency Injection in BootifyJS
authors: [bootifyjs]
tags: [tutorial, architecture, typescript]
---

Dependency Injection (DI) is at the heart of BootifyJS. In this guide, we'll explore how to leverage the powerful DI container to build loosely coupled, testable applications.

<!-- truncate -->

## What is Dependency Injection?

Dependency Injection is a design pattern where objects receive their dependencies from external sources rather than creating them internally. This leads to:

- **Loose coupling** - Components don't depend on concrete implementations
- **Testability** - Easy to mock dependencies in tests
- **Maintainability** - Changes to dependencies don't ripple through the codebase

## Basic Usage

### Registering Services

Use the `@Injectable()` decorator to mark a class as injectable:

```typescript
import { Injectable } from "bootifyjs";

@Injectable()
class EmailService {
  send(to: string, subject: string, body: string) {
    console.log(`Sending email to ${to}: ${subject}`);
  }
}

@Injectable()
class UserService {
  constructor(private emailService: EmailService) {}

  createUser(email: string) {
    // Create user logic...
    this.emailService.send(email, "Welcome!", "Thanks for signing up!");
  }
}
```

The DI container automatically resolves `EmailService` when creating `UserService`.

## Interface Binding

For better abstraction, bind interfaces to implementations:

```typescript
import { Injectable, Inject } from "bootifyjs";

// Define the interface
interface IEmailService {
  send(to: string, subject: string, body: string): Promise<void>;
}

// Implementation
@Injectable()
class SmtpEmailService implements IEmailService {
  async send(to: string, subject: string, body: string) {
    // SMTP implementation
  }
}

// Use with injection token
@Injectable()
class NotificationService {
  constructor(@Inject("IEmailService") private emailService: IEmailService) {}
}
```

Register the binding in your app configuration:

```typescript
container.bind("IEmailService", SmtpEmailService);
```

## Scopes

BootifyJS supports different injection scopes:

### Singleton (Default)

One instance shared across the entire application:

```typescript
@Injectable({ scope: "singleton" })
class ConfigService {
  // Single instance for all consumers
}
```

### Transient

New instance created for each injection:

```typescript
@Injectable({ scope: "transient" })
class RequestLogger {
  // Fresh instance every time
}
```

### Request

One instance per HTTP request:

```typescript
@Injectable({ scope: "request" })
class RequestContext {
  // Unique per request
}
```

## Property Injection

For cases where constructor injection isn't suitable:

```typescript
@Injectable()
class ReportService {
  @Inject()
  private logger: LoggerService;

  @Inject("IEmailService")
  private emailService: IEmailService;
}
```

## Eager Loading

Load services at startup instead of lazily:

```typescript
@Injectable({ eager: true })
class DatabaseConnection {
  constructor() {
    // Connect immediately on app start
  }
}
```

## Testing with DI

The DI container makes testing straightforward:

```typescript
import { createTestingModule } from "bootifyjs/testing";

describe("UserService", () => {
  let userService: UserService;
  let mockEmailService: jest.Mocked<IEmailService>;

  beforeEach(async () => {
    mockEmailService = {
      send: jest.fn(),
    };

    const module = await createTestingModule({
      providers: [
        UserService,
        { provide: "IEmailService", useValue: mockEmailService },
      ],
    });

    userService = module.get(UserService);
  });

  it("should send welcome email on user creation", async () => {
    await userService.createUser("test@example.com");

    expect(mockEmailService.send).toHaveBeenCalledWith(
      "test@example.com",
      "Welcome!",
      expect.any(String)
    );
  });
});
```

## Best Practices

1. **Prefer constructor injection** - It makes dependencies explicit
2. **Use interfaces for external services** - Easier to mock and swap implementations
3. **Keep services focused** - Single responsibility principle
4. **Use appropriate scopes** - Don't make everything singleton
5. **Avoid circular dependencies** - Refactor if you encounter them

## Conclusion

BootifyJS's DI container provides enterprise-grade dependency injection with a clean, decorator-based API. By following these patterns, you'll build applications that are easy to test, maintain, and scale.

Check out the [DI documentation](/docs/core-concepts/dependency-injection) for more details.
