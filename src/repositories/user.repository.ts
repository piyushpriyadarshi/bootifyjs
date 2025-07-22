import { Repository } from '../core/decorators'
import { Logger, Log, LoggerService } from '../logging'

export interface User {
  id: string
  email: string
  name: string
  createdAt: Date
}

@Repository()
@Logger('UserRepository')
export class UserRepository {
  private logger!: LoggerService // Injected by @Logger decorator

  private users: User[] = [
    {
      id: '1',
      email: 'john@example.com',
      name: 'John Doe',
      createdAt: new Date('2023-01-01'),
    },
    {
      id: '2',
      email: 'jane@example.com',
      name: 'Jane Smith',
      createdAt: new Date('2023-01-02'),
    },
  ]

  @Log({ logDuration: true, level: 'debug' })
  findAll(): User[] {
    this.logger.debug('Fetching all users', { count: this.users.length })
    return this.users
  }

  @Log({ logArgs: true, logDuration: true, level: 'debug' })
  findById(id: string): User | undefined {
    return this.users.find((user) => user.id === id)
  }

  // @Log({ logArgs: true, logDuration: true, level: 'debug' })
  findByEmail(email: string): User | undefined {
    this.logger.info('Searching user by email', { email })
    return this.users.find((user) => user.email === email)
  }

  // @Log({ logArgs: true, logDuration: true, level: 'debug' })
  create(userData: Omit<User, 'id' | 'createdAt'>): User {
    const newUser: User = {
      id: Date.now().toString(),
      createdAt: new Date(),
      ...userData,
    }

    this.users.push(newUser)
    this.logger.debug('User created in repository', { userId: newUser.id })
    return newUser
  }

  // @Log({ logArgs: true, logDuration: true, level: 'debug' })
  update(id: string, userData: Partial<Omit<User, 'id' | 'createdAt'>>): User | undefined {
    const userIndex = this.users.findIndex((user) => user.id === id)
    if (userIndex === -1) return undefined

    this.users[userIndex] = { ...this.users[userIndex], ...userData }
    this.logger.debug('User updated in repository', { userId: id })
    return this.users[userIndex]
  }

  @Log({ logArgs: true, logDuration: true, level: 'debug' })
  delete(id: string): boolean {
    const userIndex = this.users.findIndex((user) => user.id === id)
    if (userIndex === -1) return false

    this.users.splice(userIndex, 1)
    this.logger.debug('User deleted from repository', { userId: id })
    return true
  }
}
