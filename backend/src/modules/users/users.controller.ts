import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { UsersService } from "./users.service";
import {
  UpdateUserDto,
  UserQueryDto,
  ChangePasswordDto,
  UserResponseDto,
} from "./dto/user.dto";
import { PaginatedResult } from "@/common/dto/pagination.dto";
import {
  CurrentUser,
  AuthenticatedRequest,
} from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@/common/enums";

@ApiTags("Users")
@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: "Get all users" })
  @ApiResponse({ status: 200, description: "Users retrieved successfully" })
  async findAll(
    @Query() query: UserQueryDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<PaginatedResult<UserResponseDto>> {
    return this.usersService.findAll(query, user.userId, user.organizationId);
  }

  @Get("profile")
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({
    status: 200,
    description: "Profile retrieved successfully",
    type: UserResponseDto,
  })
  async getProfile(
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    return this.usersService.getProfile(user.userId);
  }

  @Get("stats")
  @ApiOperation({ summary: "Get user statistics" })
  @ApiResponse({
    status: 200,
    description: "Statistics retrieved successfully",
  })
  async getUserStats(@CurrentUser() user: AuthenticatedRequest) {
    return this.usersService.getUserStats(user.userId, user.organizationId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by ID" })
  @ApiResponse({
    status: 200,
    description: "User found",
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: "User not found" })
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    return this.usersService.findOne(id, user.userId, user.organizationId);
  }

  @Put("profile")
  @ApiOperation({ summary: "Update current user profile" })
  @ApiResponse({
    status: 200,
    description: "Profile updated successfully",
    type: UserResponseDto,
  })
  async updateProfile(
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    return this.usersService.update(
      user.userId,
      updateUserDto,
      user.userId,
      user.organizationId,
    );
  }

  @Put(":id")
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: "Update user by ID" })
  @ApiResponse({
    status: 200,
    description: "User updated successfully",
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: "User not found" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    return this.usersService.update(
      id,
      updateUserDto,
      user.userId,
      user.organizationId,
    );
  }

  @Put("profile/change-password")
  @ApiOperation({ summary: "Change current user password" })
  @ApiResponse({ status: 200, description: "Password changed successfully" })
  @ApiResponse({ status: 400, description: "Invalid current password" })
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.usersService.changePassword(
      user.userId,
      changePasswordDto,
      user.userId,
    );
    return { message: "Password changed successfully" };
  }

  @Put(":id/deactivate")
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Deactivate user" })
  @ApiResponse({ status: 200, description: "User deactivated successfully" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 400, description: "Cannot deactivate yourself" })
  async deactivate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.usersService.deactivate(id, user.userId, user.organizationId);
    return { message: "User deactivated successfully" };
  }

  @Put(":id/reactivate")
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Reactivate user" })
  @ApiResponse({ status: 200, description: "User reactivated successfully" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  async reactivate(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.usersService.reactivate(id, user.userId, user.organizationId);
    return { message: "User reactivated successfully" };
  }
}
