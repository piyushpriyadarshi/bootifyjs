import { 
  Controller, Get, Post, Put, Delete, Param, Body, Query, UseMiddleware,
  ValidateBody, ValidateQuery, ValidateParams, ValidateResponse,
  ApiTags, ApiOperation, ApiResponse, ApiSecurity
} from '../core/decorators';
import { UserService, CreateUserDto, UpdateUserDto } from '../services/user.service';
import { authMiddleware } from '../middlewares/auth.middleware';
import {
  createUserSchema,
  updateUserSchema,
  userParamsSchema,
  emailParamsSchema,
  paginationSchema,
  userResponseSchema,
  usersListResponseSchema,
  createUserResponseSchema,
  updateUserResponseSchema,
  deleteUserResponseSchema,
  errorResponseSchema,
  validationErrorResponseSchema
} from '../schemas/user.schemas';

@Controller('/users')
@ApiTags('Users', 'User Management')
@ApiResponse(400, {
  description: 'Validation error',
  schema: validationErrorResponseSchema
})
@ApiResponse(500, {
  description: 'Internal server error',
  schema: errorResponseSchema
})
export class UserController {
  constructor(private userService: UserService) {}

  @Get('/')
  @ApiOperation({
    summary: 'Get all users',
    description: 'Retrieve a list of all users with optional pagination',
    operationId: 'getAllUsers'
  })
  @ValidateQuery(paginationSchema)
  @ValidateResponse(usersListResponseSchema)
  @ApiResponse(200, {
    description: 'List of users retrieved successfully',
    schema: usersListResponseSchema
  })
  getAllUsers(@Query('limit') limit?: string) {
    const users = this.userService.getAllUsers();
    
    if (limit) {
      const limitNum = parseInt(limit, 10);
      return users.slice(0, limitNum);
    }
    
    return users;
  }

  @Get('/:id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieve a specific user by their unique identifier',
    operationId: 'getUserById'
  })
  @ValidateParams(userParamsSchema)
  @ValidateResponse(userResponseSchema)
  @ApiResponse(200, {
    description: 'User found successfully',
    schema: userResponseSchema
  })
  @ApiResponse(404, {
    description: 'User not found',
    schema: errorResponseSchema
  })
  getUserById(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }

  @Get('/email/:email')
  @ApiOperation({
    summary: 'Get user by email',
    description: 'Retrieve a specific user by their email address',
    operationId: 'getUserByEmail'
  })
  @ValidateParams(emailParamsSchema)
  @ValidateResponse(userResponseSchema)
  @ApiResponse(200, {
    description: 'User found successfully',
    schema: userResponseSchema
  })
  @ApiResponse(404, {
    description: 'User not found',
    schema: errorResponseSchema
  })
  getUserByEmail(@Param('email') email: string) {
    return this.userService.getUserByEmail(email);
  }

  @Post('/')
  @ApiOperation({
    summary: 'Create new user',
    description: 'Create a new user account with email and name validation',
    operationId: 'createUser'
  })
  @ValidateBody(createUserSchema)
  @ValidateResponse(createUserResponseSchema)
  @ApiResponse(201, {
    description: 'User created successfully',
    schema: createUserResponseSchema
  })
  @ApiResponse(409, {
    description: 'Email already exists',
    schema: errorResponseSchema
  })
  async createUser(@Body() userData: CreateUserDto) {
    return await this.userService.createUser(userData);
  }

  @Put('/:id')
  @UseMiddleware(authMiddleware)
  @ApiOperation({
    summary: 'Update user',
    description: 'Update an existing user\'s information',
    operationId: 'updateUser'
  })
  @ApiSecurity([{ bearerAuth: [] }])
  @ValidateParams(userParamsSchema)
  @ValidateBody(updateUserSchema)
  @ValidateResponse(updateUserResponseSchema)
  @ApiResponse(200, {
    description: 'User updated successfully',
    schema: updateUserResponseSchema
  })
  @ApiResponse(401, {
    description: 'Unauthorized - Invalid or missing token',
    schema: errorResponseSchema
  })
  @ApiResponse(404, {
    description: 'User not found',
    schema: errorResponseSchema
  })
  @ApiResponse(409, {
    description: 'Email already exists',
    schema: errorResponseSchema
  })
  async updateUser(@Param('id') id: string, @Body() userData: UpdateUserDto) {
    return await this.userService.updateUser(id, userData);
  }

  @Delete('/:id')
  @UseMiddleware(authMiddleware)
  @ApiOperation({
    summary: 'Delete user',
    description: 'Delete a user account permanently',
    operationId: 'deleteUser'
  })
  @ApiSecurity([{ bearerAuth: [] }])
  @ValidateParams(userParamsSchema)
  @ValidateResponse(deleteUserResponseSchema)
  @ApiResponse(200, {
    description: 'User deleted successfully',
    schema: deleteUserResponseSchema
  })
  @ApiResponse(401, {
    description: 'Unauthorized - Invalid or missing token',
    schema: errorResponseSchema
  })
  @ApiResponse(404, {
    description: 'User not found',
    schema: errorResponseSchema
  })
  async deleteUser(@Param('id') id: string) {
    await this.userService.deleteUser(id);
    return { message: 'User deleted successfully' };
  }
}