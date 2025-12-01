import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, FindOptionsWhere, ILike } from "typeorm";
import { User, OrganizationMember } from "@/common/entities";
import { UserRole, AuditAction } from "@/common/enums";
import {
  CreateUserDto,
  UpdateUserDto,
  UserQueryDto,
  ChangePasswordDto,
} from "./dto/user.dto";
import { PaginatedResult } from "@/common/dto/pagination.dto";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(OrganizationMember)
    private organizationMemberRepository: Repository<OrganizationMember>,
    private auditService: AuditService,
  ) {}

  async findAll(
    query: UserQueryDto,
    currentUserId: string,
    organizationId?: string,
  ): Promise<PaginatedResult<User>> {
    const { page = 1, limit = 10, search, isActive, emailVerified } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository.createQueryBuilder("user");

    // If organization context provided, filter by organization members
    if (organizationId) {
      queryBuilder
        .innerJoin("user.organizationMemberships", "membership")
        .where("membership.organizationId = :organizationId", {
          organizationId,
        });
    }

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        "(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    if (typeof isActive === "boolean") {
      queryBuilder.andWhere("user.isActive = :isActive", { isActive });
    }

    if (typeof emailVerified === "boolean") {
      queryBuilder.andWhere("user.emailVerified = :emailVerified", {
        emailVerified,
      });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated results
    const users = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy("user.createdAt", "DESC")
      .getMany();

    return new PaginatedResult(users, total, page, limit);
  }

  async findOne(
    id: string,
    currentUserId: string,
    organizationId?: string,
  ): Promise<User> {
    const queryBuilder = this.userRepository
      .createQueryBuilder("user")
      .where("user.id = :id", { id });

    // If organization context provided, ensure user is a member
    if (organizationId) {
      queryBuilder
        .innerJoin("user.organizationMemberships", "membership")
        .andWhere("membership.organizationId = :organizationId", {
          organizationId,
        });
    }

    const user = await queryBuilder.getOne();

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
    });
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    currentUserId: string,
    organizationId?: string,
  ): Promise<User> {
    // Check if user exists and is accessible
    const user = await this.findOne(id, currentUserId, organizationId);

    // Users can only update themselves unless they have admin privileges
    if (id !== currentUserId) {
      // Check if current user has admin privileges in the organization
      if (organizationId) {
        const currentMembership =
          await this.organizationMemberRepository.findOne({
            where: {
              userId: currentUserId,
              organizationId,
            },
          });

        if (
          !currentMembership ||
          !["owner", "admin"].includes(currentMembership.role)
        ) {
          throw new ForbiddenException(
            "Insufficient permissions to update this user",
          );
        }
      } else {
        throw new ForbiddenException("Can only update your own profile");
      }
    }

    // Check for email conflicts if email is being updated
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(updateUserDto.email);
      if (existingUser && existingUser.id !== id) {
        throw new ConflictException("Email already in use");
      }
    }

    // Update user
    await this.userRepository.update(id, updateUserDto);
    const updatedUser = await this.findOne(id, currentUserId, organizationId);

    // Log audit event
    await this.auditService.log({
      action: AuditAction.UPDATE,
      resourceType: "user",
      resourceId: id,
      userId: currentUserId,
      organizationId,
      description: `User ${user.email} updated`,
      metadata: { updatedFields: Object.keys(updateUserDto) },
    });

    return updatedUser;
  }

  async changePassword(
    id: string,
    changePasswordDto: ChangePasswordDto,
    currentUserId: string,
  ): Promise<void> {
    // Users can only change their own password
    if (id !== currentUserId) {
      throw new ForbiddenException("Can only change your own password");
    }

    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Verify current password
    const isCurrentPasswordValid = await user.validatePassword(
      changePasswordDto.currentPassword,
    );
    if (!isCurrentPasswordValid) {
      throw new BadRequestException("Current password is incorrect");
    }

    // Update password
    await this.userRepository.update(id, {
      password: changePasswordDto.newPassword,
    });

    // Log audit event
    await this.auditService.log({
      action: AuditAction.UPDATE,
      resourceType: "user",
      resourceId: id,
      userId: currentUserId,
      description: "Password changed",
    });
  }

  async deactivate(
    id: string,
    currentUserId: string,
    organizationId?: string,
  ): Promise<void> {
    // Cannot deactivate yourself
    if (id === currentUserId) {
      throw new BadRequestException("Cannot deactivate your own account");
    }

    // Check permissions
    if (organizationId) {
      const currentMembership = await this.organizationMemberRepository.findOne(
        {
          where: {
            userId: currentUserId,
            organizationId,
          },
        },
      );

      if (!currentMembership || currentMembership.role !== UserRole.OWNER) {
        throw new ForbiddenException(
          "Only organization owners can deactivate users",
        );
      }
    }

    const user = await this.findOne(id, currentUserId, organizationId);

    await this.userRepository.update(id, { isActive: false });

    // Log audit event
    await this.auditService.log({
      action: AuditAction.UPDATE,
      resourceType: "user",
      resourceId: id,
      userId: currentUserId,
      organizationId,
      description: `User ${user.email} deactivated`,
    });
  }

  async reactivate(
    id: string,
    currentUserId: string,
    organizationId?: string,
  ): Promise<void> {
    // Check permissions
    if (organizationId) {
      const currentMembership = await this.organizationMemberRepository.findOne(
        {
          where: {
            userId: currentUserId,
            organizationId,
          },
        },
      );

      if (!currentMembership || currentMembership.role !== UserRole.OWNER) {
        throw new ForbiddenException(
          "Only organization owners can reactivate users",
        );
      }
    }

    const user = await this.findOne(id, currentUserId, organizationId);

    await this.userRepository.update(id, { isActive: true });

    // Log audit event
    await this.auditService.log({
      action: AuditAction.UPDATE,
      resourceType: "user",
      resourceId: id,
      userId: currentUserId,
      organizationId,
      description: `User ${user.email} reactivated`,
    });
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: [
        "organizationMemberships",
        "organizationMemberships.organization",
      ],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  async getUserStats(userId: string, organizationId?: string): Promise<any> {
    // Get user's organizations count
    const organizationsCount = await this.organizationMemberRepository.count({
      where: { userId },
    });

    // Get user's audit logs count
    const activityCount = await this.auditService.getUserActivityCount(
      userId,
      organizationId,
    );

    return {
      organizationsCount,
      activityCount,
      memberSince: (
        await this.userRepository.findOne({ where: { id: userId } })
      )?.createdAt,
    };
  }
}
