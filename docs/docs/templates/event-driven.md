---
id: event-driven
title: Event-Driven Architecture Template
sidebar_label: Event-Driven
description: Event-driven architecture template with event bus, handlers, and patterns
keywords: [bootifyjs, events, event-driven, event bus, template]
---

# Event-Driven Architecture Template

This template demonstrates how to build event-driven applications using BootifyJS's event system, including event definitions, handlers, and common patterns.

## Complete Example

### 1. Define Events

```typescript title="src/events/order.events.ts"
export class OrderCreatedEvent {
  constructor(
    public readonly orderId: string,
    public readonly userId: string,
    public readonly items: Array<{
      productId: string;
      quantity: number;
      price: number;
    }>,
    public readonly totalAmount: number,
    public readonly timestamp: Date = new Date()
  ) {}
}

export class OrderConfirmedEvent {
  constructor(
    public readonly orderId: string,
    public readonly confirmedAt: Date = new Date()
  ) {}
}

export class OrderShippedEvent {
  constructor(
    public readonly orderId: string,
    public readonly trackingNumber: string,
    public readonly shippedAt: Date = new Date()
  ) {}
}

export class OrderCancelledEvent {
  constructor(
    public readonly orderId: string,
    public readonly reason: string,
    public readonly cancelledAt: Date = new Date()
  ) {}
}

export class PaymentProcessedEvent {
  constructor(
    public readonly orderId: string,
    public readonly paymentId: string,
    public readonly amount: number,
    public readonly method: string,
    public readonly processedAt: Date = new Date()
  ) {}
}

export class InventoryReservedEvent {
  constructor(
    public readonly orderId: string,
    public readonly items: Array<{ productId: string; quantity: number }>,
    public readonly reservedAt: Date = new Date()
  ) {}
}
```

### 2. Create Event Handlers

```typescript title="src/handlers/order.handlers.ts"
import { EventHandler, OnEvent } from "bootifyjs";
import {
  OrderCreatedEvent,
  OrderConfirmedEvent,
  OrderShippedEvent,
  PaymentProcessedEvent,
} from "../events/order.events";
import { EmailService } from "../services/email.service";
import { InventoryService } from "../services/inventory.service";
import { NotificationService } from "../services/notification.service";

@EventHandler()
export class OrderEventHandlers {
  constructor(
    private emailService: EmailService,
    private inventoryService: InventoryService,
    private notificationService: NotificationService
  ) {}

  @OnEvent(OrderCreatedEvent)
  async handleOrderCreated(event: OrderCreatedEvent) {
    console.log(`Order created: ${event.orderId}`);

    // Send confirmation email
    await this.emailService.sendOrderConfirmation(
      event.userId,
      event.orderId,
      event.items,
      event.totalAmount
    );

    // Reserve inventory
    await this.inventoryService.reserveItems(event.orderId, event.items);

    // Send notification
    await this.notificationService.notify(
      event.userId,
      "Order Created",
      `Your order #${event.orderId} has been created successfully`
    );
  }

  @OnEvent(OrderConfirmedEvent)
  async handleOrderConfirmed(event: OrderConfirmedEvent) {
    console.log(`Order confirmed: ${event.orderId}`);

    // Update order status
    // Trigger payment processing
    // Send confirmation notification
  }

  @OnEvent(OrderShippedEvent)
  async handleOrderShipped(event: OrderShippedEvent) {
    console.log(`Order shipped: ${event.orderId}`);

    // Send shipping notification with tracking number
    await this.notificationService.notifyShipping(
      event.orderId,
      event.trackingNumber
    );
  }

  @OnEvent(PaymentProcessedEvent)
  async handlePaymentProcessed(event: PaymentProcessedEvent) {
    console.log(`Payment processed for order: ${event.orderId}`);

    // Update order payment status
    // Trigger fulfillment process
  }
}
```

### 3. Create Services that Emit Events

```typescript title="src/services/order.service.ts"
import { Injectable } from "bootifyjs";
import { EventBus } from "bootifyjs/events";
import { OrderRepository } from "../repositories/order.repository";
import {
  OrderCreatedEvent,
  OrderConfirmedEvent,
  OrderShippedEvent,
  OrderCancelledEvent,
} from "../events/order.events";

export interface CreateOrderDto {
  userId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
}

@Injectable()
export class OrderService {
  constructor(
    private orderRepository: OrderRepository,
    private eventBus: EventBus
  ) {}

  async createOrder(data: CreateOrderDto) {
    // Calculate total
    const totalAmount = data.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    // Create order
    const order = await this.orderRepository.create({
      userId: data.userId,
      items: data.items,
      totalAmount,
      status: "pending",
    });

    // Emit event
    await this.eventBus.publish(
      new OrderCreatedEvent(
        order.id,
        order.userId,
        order.items,
        order.totalAmount
      )
    );

    return order;
  }

  async confirmOrder(orderId: string) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Update order status
    await this.orderRepository.update(orderId, { status: "confirmed" });

    // Emit event
    await this.eventBus.publish(new OrderConfirmedEvent(orderId));

    return order;
  }

  async shipOrder(orderId: string, trackingNumber: string) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Update order status
    await this.orderRepository.update(orderId, {
      status: "shipped",
      trackingNumber,
    });

    // Emit event
    await this.eventBus.publish(new OrderShippedEvent(orderId, trackingNumber));

    return order;
  }

  async cancelOrder(orderId: string, reason: string) {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Update order status
    await this.orderRepository.update(orderId, { status: "cancelled" });

    // Emit event
    await this.eventBus.publish(new OrderCancelledEvent(orderId, reason));

    return order;
  }
}
```

### 4. Create Supporting Services

```typescript title="src/services/email.service.ts"
import { Injectable } from "bootifyjs";

@Injectable()
export class EmailService {
  async sendOrderConfirmation(
    userId: string,
    orderId: string,
    items: any[],
    totalAmount: number
  ) {
    console.log(`Sending order confirmation email to user ${userId}`);
    // Email sending logic here
  }

  async sendShippingNotification(
    userId: string,
    orderId: string,
    trackingNumber: string
  ) {
    console.log(`Sending shipping notification to user ${userId}`);
    // Email sending logic here
  }
}
```

```typescript title="src/services/inventory.service.ts"
import { Injectable } from "bootifyjs";
import { EventBus } from "bootifyjs/events";
import { InventoryReservedEvent } from "../events/order.events";

@Injectable()
export class InventoryService {
  private inventory: Map<string, number> = new Map();

  constructor(private eventBus: EventBus) {
    // Initialize with some inventory
    this.inventory.set("product-1", 100);
    this.inventory.set("product-2", 50);
  }

  async reserveItems(
    orderId: string,
    items: Array<{ productId: string; quantity: number }>
  ) {
    // Check availability
    for (const item of items) {
      const available = this.inventory.get(item.productId) || 0;
      if (available < item.quantity) {
        throw new Error(`Insufficient inventory for product ${item.productId}`);
      }
    }

    // Reserve items
    for (const item of items) {
      const current = this.inventory.get(item.productId) || 0;
      this.inventory.set(item.productId, current - item.quantity);
    }

    // Emit event
    await this.eventBus.publish(new InventoryReservedEvent(orderId, items));

    console.log(`Inventory reserved for order ${orderId}`);
  }

  async releaseItems(items: Array<{ productId: string; quantity: number }>) {
    for (const item of items) {
      const current = this.inventory.get(item.productId) || 0;
      this.inventory.set(item.productId, current + item.quantity);
    }
    console.log("Inventory released");
  }
}
```

```typescript title="src/services/notification.service.ts"
import { Injectable } from "bootifyjs";

@Injectable()
export class NotificationService {
  async notify(userId: string, title: string, message: string) {
    console.log(`Notification to ${userId}: ${title} - ${message}`);
    // Push notification logic here
  }

  async notifyShipping(orderId: string, trackingNumber: string) {
    console.log(
      `Shipping notification for order ${orderId}: ${trackingNumber}`
    );
    // Notification logic here
  }
}
```

### 5. Create Order Controller

```typescript title="src/controllers/order.controller.ts"
import { Controller, Post, Get, Put, Param, Body, Validate } from "bootifyjs";
import { z } from "zod";
import { OrderService } from "../services/order.service";

const CreateOrderSchema = z.object({
  userId: z.string(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().positive(),
      price: z.number().positive(),
    })
  ),
});

const ShipOrderSchema = z.object({
  trackingNumber: z.string(),
});

const CancelOrderSchema = z.object({
  reason: z.string(),
});

@Controller("/api/orders")
export class OrderController {
  constructor(private orderService: OrderService) {}

  @Post("/")
  @Validate(CreateOrderSchema)
  async createOrder(@Body() data: any) {
    const order = await this.orderService.createOrder(data);
    return {
      statusCode: 201,
      data: order,
      message: "Order created successfully",
    };
  }

  @Put("/:id/confirm")
  async confirmOrder(@Param("id") id: string) {
    const order = await this.orderService.confirmOrder(id);
    return {
      data: order,
      message: "Order confirmed",
    };
  }

  @Put("/:id/ship")
  @Validate(ShipOrderSchema)
  async shipOrder(@Param("id") id: string, @Body() data: any) {
    const order = await this.orderService.shipOrder(id, data.trackingNumber);
    return {
      data: order,
      message: "Order shipped",
    };
  }

  @Put("/:id/cancel")
  @Validate(CancelOrderSchema)
  async cancelOrder(@Param("id") id: string, @Body() data: any) {
    const order = await this.orderService.cancelOrder(id, data.reason);
    return {
      data: order,
      message: "Order cancelled",
    };
  }
}
```

### 6. Bootstrap Application

```typescript title="src/index.ts"
import { BootifyApp } from "bootifyjs";
import { OrderController } from "./controllers/order.controller";
import { OrderService } from "./services/order.service";
import { OrderRepository } from "./repositories/order.repository";
import { EmailService } from "./services/email.service";
import { InventoryService } from "./services/inventory.service";
import { NotificationService } from "./services/notification.service";
import { OrderEventHandlers } from "./handlers/order.handlers";

const app = new BootifyApp({
  port: 3000,
  controllers: [OrderController],
  providers: [
    OrderService,
    OrderRepository,
    EmailService,
    InventoryService,
    NotificationService,
  ],
  eventHandlers: [OrderEventHandlers],
});

app.start();
```

## Event Patterns

### 1. Event Chaining

Events can trigger other events, creating a chain of reactions:

```typescript
@EventHandler()
export class PaymentEventHandlers {
  constructor(private eventBus: EventBus) {}

  @OnEvent(OrderCreatedEvent)
  async handleOrderCreated(event: OrderCreatedEvent) {
    // Process payment
    const paymentId = await this.processPayment(
      event.orderId,
      event.totalAmount
    );

    // Emit payment processed event
    await this.eventBus.publish(
      new PaymentProcessedEvent(
        event.orderId,
        paymentId,
        event.totalAmount,
        "credit_card"
      )
    );
  }

  private async processPayment(
    orderId: string,
    amount: number
  ): Promise<string> {
    // Payment processing logic
    return "payment-" + Date.now();
  }
}
```

### 2. Event Aggregation

Combine multiple events to trigger an action:

```typescript
@EventHandler()
export class OrderFulfillmentHandler {
  private orderStatus: Map<string, { payment: boolean; inventory: boolean }> =
    new Map();

  @OnEvent(PaymentProcessedEvent)
  async handlePaymentProcessed(event: PaymentProcessedEvent) {
    this.updateStatus(event.orderId, "payment", true);
    await this.checkFulfillment(event.orderId);
  }

  @OnEvent(InventoryReservedEvent)
  async handleInventoryReserved(event: InventoryReservedEvent) {
    this.updateStatus(event.orderId, "inventory", true);
    await this.checkFulfillment(event.orderId);
  }

  private updateStatus(
    orderId: string,
    type: "payment" | "inventory",
    value: boolean
  ) {
    const status = this.orderStatus.get(orderId) || {
      payment: false,
      inventory: false,
    };
    status[type] = value;
    this.orderStatus.set(orderId, status);
  }

  private async checkFulfillment(orderId: string) {
    const status = this.orderStatus.get(orderId);
    if (status?.payment && status?.inventory) {
      console.log(`Order ${orderId} ready for fulfillment`);
      // Trigger fulfillment process
      this.orderStatus.delete(orderId);
    }
  }
}
```

### 3. Event Replay and Audit

Store events for replay and auditing:

```typescript
@Injectable()
export class EventStore {
  private events: Array<{ event: any; timestamp: Date }> = [];

  async store(event: any) {
    this.events.push({
      event,
      timestamp: new Date(),
    });
  }

  async getEvents(orderId: string) {
    return this.events.filter((e) => e.event.orderId === orderId);
  }

  async replay(orderId: string, eventBus: EventBus) {
    const events = await this.getEvents(orderId);
    for (const { event } of events) {
      await eventBus.publish(event);
    }
  }
}

@EventHandler()
export class EventAuditHandler {
  constructor(private eventStore: EventStore) {}

  @OnEvent(OrderCreatedEvent)
  @OnEvent(OrderConfirmedEvent)
  @OnEvent(OrderShippedEvent)
  @OnEvent(OrderCancelledEvent)
  async auditEvent(event: any) {
    await this.eventStore.store(event);
  }
}
```

## Buffered Events for High Performance

For high-throughput scenarios, use buffered events:

```typescript title="src/events/analytics.events.ts"
export class UserActionEvent {
  constructor(
    public readonly userId: string,
    public readonly action: string,
    public readonly metadata: Record<string, any>,
    public readonly timestamp: Date = new Date()
  ) {}
}
```

```typescript title="src/handlers/analytics.handlers.ts"
import { EventHandler, OnEvent } from "bootifyjs";
import { UserActionEvent } from "../events/analytics.events";

@EventHandler()
export class AnalyticsHandler {
  @OnEvent(UserActionEvent, { buffered: true })
  async handleUserAction(events: UserActionEvent[]) {
    console.log(`Processing ${events.length} user actions in batch`);

    // Batch process analytics events
    // Send to analytics service
    // Store in database
  }
}
```

## Best Practices

- **Event Naming**: Use past tense for event names (OrderCreated, not CreateOrder)
- **Immutable Events**: Events should be immutable and contain all necessary data
- **Event Versioning**: Include version information for event schema changes
- **Idempotency**: Event handlers should be idempotent
- **Error Handling**: Handle errors gracefully in event handlers
- **Async Processing**: Use buffered events for high-volume scenarios
- **Event Store**: Consider storing events for audit and replay
- **Loose Coupling**: Services should communicate through events, not direct calls

## Next Steps

- Add event versioning and migration
- Implement event sourcing pattern
- Add dead letter queue for failed events
- Implement saga pattern for distributed transactions
- Add event replay functionality
- Integrate with message queues (RabbitMQ, Kafka)
- Add event monitoring and metrics

:::tip
Use buffered events for high-throughput scenarios like analytics, logging, or metrics collection. This batches events and processes them efficiently in worker threads.
:::
