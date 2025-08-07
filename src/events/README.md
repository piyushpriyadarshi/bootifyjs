# Events Module

The Events module provides a robust event-driven architecture for the Bootify framework, allowing components to communicate through a publish-subscribe pattern.

## Features

- **Event Bus**: Central event dispatcher with retry capabilities
- **Event Handlers**: Declarative event handling with decorators
- **Dead Letter Queue**: Automatic handling of failed events
- **Typed Events**: Type-safe event definitions

## Usage

### Defining Events

```typescript
import { IEvent } from 'bootify/events';

// Define an event type
export class UserCreatedEvent implements IEvent {
  type = 'user.created'; // Event type identifier
  
  constructor(public readonly userId: string, public readonly email: string) {}
}
```

### Creating Event Handlers

```typescript
import { EventHandler, HandleEvent } from 'bootify/events';
import { UserCreatedEvent } from './events/user-events';

@EventHandler()
export class UserNotificationHandler {
  @HandleEvent(UserCreatedEvent)
  async handleUserCreated(event: UserCreatedEvent) {
    console.log(`Sending welcome email to ${event.email}`);
    // Send welcome email logic
  }
}
```

### Publishing Events

```typescript
import { EventBusService } from 'bootify/events';
import { Service, Autowired } from 'bootify/core';
import { UserCreatedEvent } from './events/user-events';

@Service()
export class UserService {
  constructor(@Autowired() private eventBus: EventBusService) {}
  
  async createUser(email: string, password: string) {
    // Create user logic
    const userId = 'user-123';
    
    // Publish event
    await this.eventBus.publish(new UserCreatedEvent(userId, email));
    
    return { userId, email };
  }
}
```

### Event Handler with Error Handling

```typescript
import { EventHandler, HandleEvent } from 'bootify/events';
import { PaymentProcessedEvent } from './events/payment-events';

@EventHandler()
export class InventoryHandler {
  @HandleEvent(PaymentProcessedEvent)
  async updateInventory(event: PaymentProcessedEvent) {
    try {
      // Update inventory logic
      console.log(`Updating inventory for order ${event.orderId}`);
    } catch (error) {
      // The event bus will automatically retry this handler
      // up to the configured max retries
      throw new Error(`Failed to update inventory: ${error.message}`);
    }
  }
}
```

### Accessing Dead Letter Queue

```typescript
import { EventBusService } from 'bootify/events';
import { Service, Autowired } from 'bootify/core';

@Service()
export class EventMonitorService {
  constructor(@Autowired() private eventBus: EventBusService) {}
  
  getFailedEvents() {
    return this.eventBus.getDeadLetterQueue();
  }
  
  async retryEvent(eventIndex: number) {
    // Retry a specific failed event
    const events = this.eventBus.getDeadLetterQueue();
    if (events[eventIndex]) {
      await this.eventBus.publish(events[eventIndex]);
      // Remove from DLQ if successful
    }
  }
}
```

## API Reference

### Decorators

- `@EventHandler()`: Register a class as an event handler
- `@HandleEvent(EventType)`: Register a method to handle a specific event type

### EventBusService

- `publish(event: IEvent)`: Publish an event to all registered handlers
- `subscribe(eventType: string, handler: IEventHandler)`: Manually subscribe a handler
- `getDeadLetterQueue()`: Get all failed events