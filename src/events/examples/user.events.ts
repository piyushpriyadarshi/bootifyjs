import { BaseEvent, DomainEvent } from '../types/event.types';
import { Event } from '../decorators/event.decorators';

@Event('user.created')
export class UserCreatedEvent implements DomainEvent {
  id!: string;
  type = 'user.created';
  timestamp!: Date;
  version = 1;
  aggregateId!: string;
  aggregateType = 'User';
  aggregateVersion!: number;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, any>;

  // User-specific data
  userId!: string;
  email!: string;
  name!: string;
  createdBy?: string;

  constructor(data?: Partial<UserCreatedEvent>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}

@Event('user.updated')
export class UserUpdatedEvent implements DomainEvent {
  id!: string;
  type = 'user.updated';
  timestamp!: Date;
  version = 1;
  aggregateId!: string;
  aggregateType = 'User';
  aggregateVersion!: number;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, any>;

  // User-specific data
  userId!: string;
  oldValues!: Record<string, any>;
  newValues!: Record<string, any>;
  updatedBy?: string;

  constructor(data?: Partial<UserUpdatedEvent>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}

@Event('user.deleted')
export class UserDeletedEvent implements DomainEvent {
  id!: string;
  type = 'user.deleted';
  timestamp!: Date;
  version = 1;
  aggregateId!: string;
  aggregateType = 'User';
  aggregateVersion!: number;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, any>;

  // User-specific data
  userId!: string;
  email!: string;
  name!: string;
  deletedBy?: string;

  constructor(data?: Partial<UserDeletedEvent>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}

@Event('user.login')
export class UserLoginEvent implements BaseEvent {
  id!: string;
  type = 'user.login';
  timestamp!: Date;
  version = 1;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, any>;

  // Login-specific data
  userId!: string;
  email!: string;
  ipAddress?: string;
  userAgent?: string;
  success!: boolean;
  failureReason?: string;

  constructor(data?: Partial<UserLoginEvent>) {
    if (data) {
      Object.assign(this, data);
    }
  }
}