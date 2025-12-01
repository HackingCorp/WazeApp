import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomBytes } from "crypto";
import {
  Organization,
  OrganizationMember,
  User,
  Subscription,
  WhatsAppSession,
  UsageMetric,
} from "@/common/entities";
import {
  UserRole,
  SubscriptionPlan,
  UsageMetricType,
  AuditAction,
} from "@/common/enums";
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  OrganizationQueryDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
} from "./dto/organization.dto";
import { PaginatedResult } from "@/common/dto/pagination.dto";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../email/email.service";

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private organizationMemberRepository: Repository<OrganizationMember>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    @InjectRepository(WhatsAppSession)
    private whatsappSessionRepository: Repository<WhatsAppSession>,
    @InjectRepository(UsageMetric)
    private usageMetricRepository: Repository<UsageMetric>,
    private auditService: AuditService,
    private emailService: EmailService,
  ) {}

  async create(
    createDto: CreateOrganizationDto,
    ownerId: string,
  ): Promise<Organization> {
    // Generate unique slug
    const slug = await this.generateUniqueSlug(createDto.name);

    // Create organization
    const organization = this.organizationRepository.create({
      ...createDto,
      slug,
      ownerId,
      timezone: createDto.timezone || "UTC",
    });

    const savedOrganization =
      await this.organizationRepository.save(organization);

    // Create owner membership
    const membership = this.organizationMemberRepository.create({
      userId: ownerId,
      organizationId: savedOrganization.id,
      role: UserRole.OWNER,
      invitationAccepted: true,
      joinedAt: new Date(),
    });
    await this.organizationMemberRepository.save(membership);

    // Create default free subscription
    const subscription = this.subscriptionRepository.create({
      organizationId: savedOrganization.id,
      plan: SubscriptionPlan.FREE,
      startsAt: new Date(),
      limits: {
        maxAgents: 1,
        maxRequestsPerMonth: 100,
        maxStorageBytes: 100 * 1024 * 1024, // 100MB
        maxKnowledgeChars: 50000,
      },
      features: {
        customBranding: false,
        prioritySupport: false,
        analytics: false,
        apiAccess: false,
        whiteLabel: false,
      },
    });
    await this.subscriptionRepository.save(subscription);

    // Log audit event
    await this.auditService.log({
      action: AuditAction.CREATE,
      resourceType: "organization",
      resourceId: savedOrganization.id,
      userId: ownerId,
      organizationId: savedOrganization.id,
      description: `Organization ${savedOrganization.name} created`,
    });

    return this.findOne(savedOrganization.id, ownerId);
  }

  async findAll(
    query: OrganizationQueryDto,
    userId: string,
  ): Promise<PaginatedResult<Organization>> {
    const { page = 1, limit = 10, search, isActive, ownerId } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.organizationRepository
      .createQueryBuilder("org")
      .innerJoin("org.organizationMembers", "member")
      .where("member.userId = :userId", { userId })
      .leftJoinAndSelect("org.owner", "owner");

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        "(org.name ILIKE :search OR org.description ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    if (typeof isActive === "boolean") {
      queryBuilder.andWhere("org.isActive = :isActive", { isActive });
    }

    if (ownerId) {
      queryBuilder.andWhere("org.ownerId = :ownerId", { ownerId });
    }

    // Get total count
    const total = await queryBuilder.getCount();

    // Get paginated results
    const organizations = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy("org.createdAt", "DESC")
      .getMany();

    return new PaginatedResult(organizations, total, page, limit);
  }

  async findOne(id: string, userId: string): Promise<Organization> {
    const organization = await this.organizationRepository
      .createQueryBuilder("org")
      .innerJoin("org.organizationMembers", "member")
      .where("org.id = :id", { id })
      .andWhere("member.userId = :userId", { userId })
      .leftJoinAndSelect("org.owner", "owner")
      .getOne();

    if (!organization) {
      throw new NotFoundException("Organization not found");
    }

    return organization;
  }

  async update(
    id: string,
    updateDto: UpdateOrganizationDto,
    userId: string,
  ): Promise<Organization> {
    const organization = await this.findOne(id, userId);

    // Check if user has permission to update
    const membership = await this.organizationMemberRepository.findOne({
      where: { userId, organizationId: id },
    });

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new ForbiddenException(
        "Insufficient permissions to update organization",
      );
    }

    await this.organizationRepository.update(id, updateDto);

    // Log audit event
    await this.auditService.log({
      action: AuditAction.UPDATE,
      resourceType: "organization",
      resourceId: id,
      userId,
      organizationId: id,
      description: `Organization ${organization.name} updated`,
      metadata: { updatedFields: Object.keys(updateDto) },
    });

    return this.findOne(id, userId);
  }

  async delete(id: string, userId: string): Promise<void> {
    const organization = await this.findOne(id, userId);

    // Only owner can delete organization
    if (organization.ownerId !== userId) {
      throw new ForbiddenException(
        "Only organization owner can delete the organization",
      );
    }

    await this.organizationRepository.delete(id);

    // Log audit event
    await this.auditService.log({
      action: AuditAction.DELETE,
      resourceType: "organization",
      resourceId: id,
      userId,
      organizationId: id,
      description: `Organization ${organization.name} deleted`,
    });
  }

  async getMembers(id: string, userId: string): Promise<OrganizationMember[]> {
    // Verify user has access to organization
    await this.findOne(id, userId);

    return this.organizationMemberRepository.find({
      where: { organizationId: id },
      relations: ["user"],
      order: { createdAt: "ASC" },
    });
  }

  async inviteMember(
    id: string,
    inviteDto: InviteMemberDto,
    inviterId: string,
  ): Promise<void> {
    // Verify organization access and permissions
    await this.findOne(id, inviterId);

    const inviterMembership = await this.organizationMemberRepository.findOne({
      where: { userId: inviterId, organizationId: id },
    });

    if (
      !inviterMembership ||
      !["owner", "admin"].includes(inviterMembership.role)
    ) {
      throw new ForbiddenException(
        "Insufficient permissions to invite members",
      );
    }

    // Check if user already exists
    let user = await this.userRepository.findOne({
      where: { email: inviteDto.email },
    });

    // Check if already a member
    if (user) {
      const existingMembership =
        await this.organizationMemberRepository.findOne({
          where: { userId: user.id, organizationId: id },
        });

      if (existingMembership) {
        throw new ConflictException(
          "User is already a member of this organization",
        );
      }
    }

    // Generate invitation token
    const invitationToken = randomBytes(32).toString("hex");
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    if (user) {
      // Create membership for existing user
      const membership = this.organizationMemberRepository.create({
        userId: user.id,
        organizationId: id,
        role: inviteDto.role,
        invitationToken,
        invitationExpiresAt,
        invitedById: inviterId,
        invitationAccepted: false,
      });
      await this.organizationMemberRepository.save(membership);
    } else {
      // Create placeholder membership for non-existing user
      const membership = this.organizationMemberRepository.create({
        organizationId: id,
        role: inviteDto.role,
        invitationToken,
        invitationExpiresAt,
        invitedById: inviterId,
        invitationAccepted: false,
      });
      // Note: userId will be set when user registers
      await this.organizationMemberRepository.save(membership);
    }

    // Send invitation email
    const organization = await this.organizationRepository.findOne({
      where: { id },
    });
    await this.emailService.sendInvitationEmail(
      inviteDto.email,
      invitationToken,
      organization.name,
    );

    // Log audit event
    await this.auditService.log({
      action: AuditAction.INVITE,
      resourceType: "organization_member",
      userId: inviterId,
      organizationId: id,
      description: `User ${inviteDto.email} invited to organization`,
      metadata: {
        email: inviteDto.email,
        role: inviteDto.role,
        message: inviteDto.message,
      },
    });
  }

  async updateMemberRole(
    organizationId: string,
    memberId: string,
    updateDto: UpdateMemberRoleDto,
    userId: string,
  ): Promise<void> {
    // Verify organization access
    await this.findOne(organizationId, userId);

    const currentUserMembership =
      await this.organizationMemberRepository.findOne({
        where: { userId, organizationId },
      });

    if (
      !currentUserMembership ||
      currentUserMembership.role !== UserRole.OWNER
    ) {
      throw new ForbiddenException(
        "Only organization owner can change member roles",
      );
    }

    const targetMembership = await this.organizationMemberRepository.findOne({
      where: { id: memberId, organizationId },
      relations: ["user"],
    });

    if (!targetMembership) {
      throw new NotFoundException("Member not found");
    }

    // Cannot change owner role
    if (targetMembership.role === UserRole.OWNER) {
      throw new BadRequestException("Cannot change owner role");
    }

    await this.organizationMemberRepository.update(memberId, {
      role: updateDto.role,
    });

    // Log audit event
    await this.auditService.log({
      action: AuditAction.UPDATE,
      resourceType: "organization_member",
      resourceId: memberId,
      userId,
      organizationId,
      description: `Member role updated to ${updateDto.role}`,
      metadata: {
        targetUserId: targetMembership.userId,
        previousRole: targetMembership.role,
        newRole: updateDto.role,
      },
    });
  }

  async removeMember(
    organizationId: string,
    memberId: string,
    userId: string,
  ): Promise<void> {
    // Verify organization access
    await this.findOne(organizationId, userId);

    const currentUserMembership =
      await this.organizationMemberRepository.findOne({
        where: { userId, organizationId },
      });

    if (
      !currentUserMembership ||
      !["owner", "admin"].includes(currentUserMembership.role)
    ) {
      throw new ForbiddenException(
        "Insufficient permissions to remove members",
      );
    }

    const targetMembership = await this.organizationMemberRepository.findOne({
      where: { id: memberId, organizationId },
      relations: ["user"],
    });

    if (!targetMembership) {
      throw new NotFoundException("Member not found");
    }

    // Cannot remove owner
    if (targetMembership.role === UserRole.OWNER) {
      throw new BadRequestException("Cannot remove organization owner");
    }

    // Admin cannot remove another admin unless current user is owner
    if (
      targetMembership.role === UserRole.ADMIN &&
      currentUserMembership.role !== UserRole.OWNER
    ) {
      throw new ForbiddenException("Only owner can remove admin members");
    }

    await this.organizationMemberRepository.delete(memberId);

    // Log audit event
    await this.auditService.log({
      action: AuditAction.DELETE,
      resourceType: "organization_member",
      resourceId: memberId,
      userId,
      organizationId,
      description: `Member removed from organization`,
      metadata: {
        targetUserId: targetMembership.userId,
        targetRole: targetMembership.role,
      },
    });
  }

  async leaveOrganization(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const membership = await this.organizationMemberRepository.findOne({
      where: { userId, organizationId },
    });

    if (!membership) {
      throw new NotFoundException("You are not a member of this organization");
    }

    // Owner cannot leave organization
    if (membership.role === UserRole.OWNER) {
      throw new BadRequestException(
        "Organization owner cannot leave the organization",
      );
    }

    await this.organizationMemberRepository.delete(membership.id);

    // Log audit event
    await this.auditService.log({
      action: AuditAction.LEAVE,
      resourceType: "organization_member",
      resourceId: membership.id,
      userId,
      organizationId,
      description: "User left organization",
    });
  }

  async getStats(organizationId: string, userId: string): Promise<any> {
    // Verify access
    await this.findOne(organizationId, userId);

    // Get member counts
    const membersCount = await this.organizationMemberRepository.count({
      where: { organizationId, invitationAccepted: true },
    });

    const activeMembersCount = await this.organizationMemberRepository.count({
      where: { organizationId, invitationAccepted: true, isActive: true },
    });

    const pendingInvitationsCount =
      await this.organizationMemberRepository.count({
        where: { organizationId, invitationAccepted: false },
      });

    // Get WhatsApp session counts
    const whatsappSessionsCount = await this.whatsappSessionRepository.count({
      where: { organizationId },
    });

    const activeWhatsappSessionsCount =
      await this.whatsappSessionRepository.count({
        where: { organizationId, isActive: true },
      });

    // Get current subscription
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
      order: { createdAt: "DESC" },
    });

    // Get current month's usage
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const monthlyUsage = await this.getMonthlyUsage(
      organizationId,
      currentMonth,
    );

    return {
      membersCount,
      activeMembersCount,
      pendingInvitationsCount,
      whatsappSessionsCount,
      activeWhatsappSessionsCount,
      subscriptionPlan: subscription?.plan || SubscriptionPlan.FREE,
      monthlyUsage,
      usageLimits: subscription?.limits || {},
    };
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    let slug = baseSlug;
    let counter = 1;

    while (await this.organizationRepository.findOne({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  private async getMonthlyUsage(
    organizationId: string,
    month: string,
  ): Promise<any> {
    const usage = await this.usageMetricRepository
      .createQueryBuilder("usage")
      .where("usage.organizationId = :organizationId", { organizationId })
      .andWhere("DATE_TRUNC('month', usage.date::date) = :month", {
        month: `${month}-01`,
      })
      .select("usage.type, SUM(usage.value) as total")
      .groupBy("usage.type")
      .getRawMany();

    const result = {
      apiRequests: 0,
      storageUsed: 0,
      knowledgeChars: 0,
      whatsappMessages: 0,
    };

    usage.forEach((item) => {
      switch (item.type) {
        case UsageMetricType.API_REQUESTS:
          result.apiRequests = parseInt(item.total);
          break;
        case UsageMetricType.STORAGE_USED:
          result.storageUsed = parseInt(item.total);
          break;
        case UsageMetricType.KNOWLEDGE_CHARS:
          result.knowledgeChars = parseInt(item.total);
          break;
        case UsageMetricType.WHATSAPP_MESSAGES:
          result.whatsappMessages = parseInt(item.total);
          break;
      }
    });

    return result;
  }
}
