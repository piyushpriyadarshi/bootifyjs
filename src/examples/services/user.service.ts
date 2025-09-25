import { User } from '../../auth/types';

/**
 * Mock User Repository
 * In a real application, this would connect to your database
 */
export class UserRepository {
  private users: User[] = [
    {
      id: '1',
      username: 'admin',
      email: 'admin@example.com',
      roles: ['admin', 'user'],
      permissions: ['read', 'write', 'delete', 'admin'],
      createdAt: new Date('2024-01-01'),
      lastLoginAt: new Date(),
      metadata: {
        password: 'admin123', // In real app, this would be hashed
        firstName: 'Admin',
        lastName: 'User'
      }
    },
    {
      id: '2',
      username: 'user',
      email: 'user@example.com',
      roles: ['user'],
      permissions: ['read', 'write'],
      createdAt: new Date('2024-01-15'),
      lastLoginAt: new Date(),
      metadata: {
        password: 'user123', // In real app, this would be hashed
        firstName: 'Regular',
        lastName: 'User'
      }
    },
    {
      id: '3',
      username: 'guest',
      email: 'guest@example.com',
      roles: ['guest'],
      permissions: ['read'],
      createdAt: new Date('2024-02-01'),
      lastLoginAt: new Date(),
      metadata: {
        password: 'guest123', // In real app, this would be hashed
        firstName: 'Guest',
        lastName: 'User'
      }
    }
  ];

  /**
   * Find user by username
   */
  async findByUsername(username: string): Promise<User | null> {
    const user = this.users.find(u => u.username === username);
    return user || null;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const user = this.users.find(u => u.email === email);
    return user || null;
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    const user = this.users.find(u => u.id === id);
    return user || null;
  }

  /**
   * Validate user credentials
   */
  async validateCredentials(username: string, password: string): Promise<User | null> {
    const user = await this.findByUsername(username);
    if (!user || user.metadata?.password !== password) {
      return null;
    }
    
    // Update last login
    user.lastLoginAt = new Date();
    
    return user;
  }

  /**
   * Create a new user
   */
  async create(userData: Omit<User, 'id'>): Promise<User> {
    const newUser: User = {
      ...userData,
      id: (this.users.length + 1).toString(),
      createdAt: new Date(),
      lastLoginAt: new Date(),
      metadata: {
        ...userData.metadata
      }
    };
    
    this.users.push(newUser);
    return newUser;
  }

  /**
   * Update user information
   */
  async update(id: string, updates: Partial<User>): Promise<User | null> {
    const userIndex = this.users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      return null;
    }
    
    this.users[userIndex] = {
      ...this.users[userIndex],
      ...updates,
      id // Ensure ID doesn't change
    };
    
    return this.users[userIndex];
  }

  /**
   * Delete user
   */
  async delete(id: string): Promise<boolean> {
    const userIndex = this.users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      return false;
    }
    
    this.users.splice(userIndex, 1);
    return true;
  }

  /**
   * Get all users (admin only)
   */
  async findAll(): Promise<User[]> {
    return this.users.map(user => ({
      ...user,
      metadata: {
        ...user.metadata,
        password: undefined // Don't expose passwords
      }
    }));
  }

  /**
   * Check if user has specific role
   */
  async hasRole(userId: string, role: string): Promise<boolean> {
    const user = await this.findById(userId);
    return user ? user.roles.includes(role) : false;
  }

  /**
   * Check if user has specific permission
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const user = await this.findById(userId);
    return user ? user.permissions.includes(permission) : false;
  }

  /**
   * Add role to user
   */
  async addRole(userId: string, role: string): Promise<User | null> {
    const user = await this.findById(userId);
    if (!user || user.roles.includes(role)) {
      return user;
    }
    
    return this.update(userId, {
      roles: [...user.roles, role]
    });
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, role: string): Promise<User | null> {
    const user = await this.findById(userId);
    if (!user || !user.roles.includes(role)) {
      return user;
    }
    
    return this.update(userId, {
      roles: user.roles.filter(r => r !== role)
    });
  }

  /**
   * Add permission to user
   */
  async addPermission(userId: string, permission: string): Promise<User | null> {
    const user = await this.findById(userId);
    if (!user || user.permissions.includes(permission)) {
      return user;
    }
    
    return this.update(userId, {
      permissions: [...user.permissions, permission]
    });
  }

  /**
   * Remove permission from user
   */
  async removePermission(userId: string, permission: string): Promise<User | null> {
    const user = await this.findById(userId);
    if (!user || !user.permissions.includes(permission)) {
      return user;
    }
    
    return this.update(userId, {
      permissions: user.permissions.filter(p => p !== permission)
    });
  }
}

/**
 * User Service
 * Business logic layer for user operations
 */
export class UserService {
  constructor(public userRepository: UserRepository) {}

  /**
   * Authenticate user with username/password
   */
  async authenticate(username: string, password: string): Promise<User | null> {
    return this.userRepository.validateCredentials(username, password);
  }

  /**
   * Get user profile (without sensitive data)
   */
  async getUserProfile(userId: string): Promise<Omit<User, 'metadata'> | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return null;
    }

    const { metadata, ...profile } = user;
    return profile;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: {
    email?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<User | null> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return null;
    }

    return this.userRepository.update(userId, {
      email: updates.email || user.email,
      metadata: {
        ...user.metadata,
        firstName: updates.firstName || user.metadata?.firstName,
        lastName: updates.lastName || user.metadata?.lastName
      }
    });
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user || user.metadata?.password !== currentPassword) {
      return false;
    }

    await this.userRepository.update(userId, {
      metadata: {
        ...user.metadata,
        password: newPassword // In real app, hash this
      }
    });

    return true;
  }

  /**
   * Check if user can access resource
   */
  async canAccess(userId: string, requiredRoles: string[], requiredPermissions: string[]): Promise<boolean> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return false;
    }

    const hasRole = requiredRoles.length === 0 || requiredRoles.some(role => user.roles.includes(role));
    const hasPermission = requiredPermissions.length === 0 || requiredPermissions.some(permission => user.permissions.includes(permission));

    return hasRole && hasPermission;
  }
}

// Export singleton instances
export const userRepository = new UserRepository();
export const userService = new UserService(userRepository);