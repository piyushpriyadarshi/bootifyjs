import { Service } from '../core/decorators';
import { Logger, Log, LoggerService, Audit } from '../logging';
import { EventEmitter } from '../events';
import { UserCreatedEvent, UserUpdatedEvent, UserDeletedEvent } from '../events/examples/user.events';
import { UserRepository, User } from '../repositories/user.repository';
import { NotFoundError, ValidationError } from '../core/errors';

export interface CreateUserDto {
  email: string;
  name: string;
}

export interface UpdateUserDto {
  email?: string;
  name?: string;
}

@Service()
@EventEmitter()
@Logger('UserService')
export class UserService {
  private logger!: LoggerService; // Injected by @Logger decorator
  private eventBus: any; // Injected by @EventEmitter decorator

  constructor(private userRepository: UserRepository) {}

  @Log({ logArgs: false, logDuration: true, level: 'info' })
  getAllUsers(): User[] {
    return this.userRepository.findAll();
  }

  @Log({ logArgs: true, logDuration: true, level: 'info' })
  getUserById(id: string): User {
    const user = this.userRepository.findById(id);
    if (!user) {
      this.logger.warn('User not found', { userId: id });
      throw new NotFoundError(`User with id ${id} not found`);
    }
    return user;
  }

  @Log({ logArgs: true, logDuration: true, level: 'info' })
  getUserByEmail(email: string): User {
    const user = this.userRepository.findByEmail(email);
    if (!user) {
      this.logger.warn('User not found by email', { email });
      throw new NotFoundError(`User with email ${email} not found`);
    }
    return user;
  }

  @Log({ logArgs: true, logDuration: true, level: 'info' })
  @Audit({
    action: 'USER_CREATE',
    resource: 'user',
    resourceIdPath: 'result.id',
    newValuesPath: 'args.0'
  })
  async createUser(userData: CreateUserDto): Promise<User> {
    this.logger.info('Creating new user', { email: userData.email });
    
    // Validate email
    if (!userData.email || !userData.email.includes('@')) {
      throw new ValidationError('Valid email is required');
    }

    // Validate name
    if (!userData.name || userData.name.trim().length < 2) {
      throw new ValidationError('Name must be at least 2 characters long');
    }

    // Check if email already exists
    const existingUser = this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      this.logger.warn('Attempt to create user with existing email', { email: userData.email });
      throw new ValidationError('User with this email already exists');
    }

    const user = this.userRepository.create(userData);
    
    // Emit domain event
    await this.eventBus.emit('user.created', {
      aggregateId: user.id,
      aggregateVersion: 1,
      userId: user.id,
      email: user.email,
      name: user.name,
      correlationId: `user-creation-${user.id}`
    });
    
    this.logger.audit({
      action: 'USER_CREATED',
      resource: 'user',
      resourceId: user.id,
      newValues: { email: user.email, name: user.name }
    });

    this.logger.event({
      eventName: 'user.created',
      eventType: 'business',
      status: 'success',
      metadata: { userId: user.id }
    });

    return user;
  }

  @Log({ logArgs: true, logDuration: true, level: 'info' })
  @Audit({
    action: 'USER_UPDATE',
    resource: 'user',
    resourceIdPath: 'args.0',
    oldValuesPath: 'result',
    newValuesPath: 'args.1'
  })
  async updateUser(id: string, userData: UpdateUserDto): Promise<User> {
    const existingUser = this.userRepository.findById(id);
    if (!existingUser) {
      this.logger.warn('Attempt to update non-existent user', { userId: id });
      throw new NotFoundError(`User with id ${id} not found`);
    }

    // Validate email if provided
    if (userData.email && !userData.email.includes('@')) {
      throw new ValidationError('Valid email is required');
    }

    // Validate name if provided
    if (userData.name && userData.name.trim().length < 2) {
      throw new ValidationError('Name must be at least 2 characters long');
    }

    // Check if email already exists for another user
    if (userData.email) {
      const existingEmailUser = this.userRepository.findByEmail(userData.email);
      if (existingEmailUser && existingEmailUser.id !== id) {
        this.logger.warn('Attempt to update user with existing email', { 
          userId: id, 
          email: userData.email 
        });
        throw new ValidationError('User with this email already exists');
      }
    }

    const updatedUser = this.userRepository.update(id, userData);
    
    // Emit domain event
    await this.eventBus.emit('user.updated', {
      aggregateId: id,
      aggregateVersion: existingUser.createdAt ? 2 : 1, // Simple versioning
      userId: id,
      oldValues: { email: existingUser.email, name: existingUser.name },
      newValues: userData,
      correlationId: `user-update-${id}`
    });
    
    this.logger.audit({
      action: 'USER_UPDATED',
      resource: 'user',
      resourceId: id,
      oldValues: { email: existingUser.email, name: existingUser.name },
      newValues: userData
    });

    return updatedUser!;
  }

  @Log({ logArgs: true, logDuration: true, level: 'info' })
  @Audit({
    action: 'USER_DELETE',
    resource: 'user',
    resourceIdPath: 'args.0',
    oldValuesPath: 'result'
  })
  async deleteUser(id: string): Promise<void> {
    const existingUser = this.userRepository.findById(id);
    if (!existingUser) {
      this.logger.warn('Attempt to delete non-existent user', { userId: id });
      throw new NotFoundError(`User with id ${id} not found`);
    }
    
    const deleted = this.userRepository.delete(id);
    if (!deleted) {
      throw new NotFoundError(`User with id ${id} not found`);
    }
    
    // Emit domain event
    await this.eventBus.emit('user.deleted', {
      aggregateId: id,
      aggregateVersion: existingUser.createdAt ? 3 : 1, // Simple versioning
      userId: id,
      email: existingUser.email,
      name: existingUser.name,
      correlationId: `user-deletion-${id}`
    });
    
    this.logger.audit({
      action: 'USER_DELETED',
      resource: 'user',
      resourceId: id,
      oldValues: { email: existingUser.email, name: existingUser.name }
    });

    this.logger.event({
      eventName: 'user.deleted',
      eventType: 'business',
      status: 'success',
      metadata: { userId: id }
    });
  }
}