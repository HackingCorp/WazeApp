import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import {
  User,
  Organization,
  OrganizationMember,
  Subscription,
} from "@/common/entities";
import { UserRole, SubscriptionPlan, AuditAction } from "@/common/enums";
import {
  RegisterDto,
  LoginDto,
  AuthResponseDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  RefreshTokenDto,
} from "./dto/auth.dto";
import { JwtPayload } from "./strategies/jwt.strategy";
import { EmailService } from "../email/email.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private organizationMemberRepository: Repository<OrganizationMember>,
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private auditService: AuditService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException("User with this email already exists");
    }

    // Create email verification token
    const emailVerificationToken = randomBytes(32).toString("hex");

    // Create user
    const user = this.userRepository.create({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      emailVerificationToken,
      emailVerified: false,
    });

    await this.userRepository.save(user);

    // Create organization if provided
    let organization: Organization;
    if (dto.organizationName) {
      const slug = this.generateSlug(dto.organizationName);
      organization = this.organizationRepository.create({
        name: dto.organizationName,
        slug,
        owner: user,
        ownerId: user.id,
      });
      await this.organizationRepository.save(organization);

      // Create organization membership
      const membership = this.organizationMemberRepository.create({
        user,
        organization,
        role: UserRole.OWNER,
        invitationAccepted: true,
        joinedAt: new Date(),
      });
      await this.organizationMemberRepository.save(membership);
    }

    // Create free subscription for all users (with or without organization)
    const subscription = this.subscriptionRepository.create({
      userId: user.id.toString(),
      organizationId: organization?.id,
      plan: SubscriptionPlan.FREE,
      startsAt: new Date(),
      limits: {
        maxAgents: 1,
        maxRequestsPerMonth: 100,
        maxStorageBytes: 100 * 1024 * 1024, // 100MB
        maxKnowledgeChars: 50000,
        maxKnowledgeBases: 1,
        maxLLMTokensPerMonth: 10000,
        maxVectorSearches: 500,
        maxConversationsPerMonth: 50,
        maxDocumentsPerKB: 50,
        maxFileUploadSize: 10 * 1024 * 1024, // 10MB
      },
      features: {
        customBranding: false,
        prioritySupport: false,
        analytics: false,
        apiAccess: false,
        whiteLabel: false,
        advancedLLMs: false,
        premiumVectorSearch: false,
        functionCalling: false,
        imageAnalysis: false,
        customEmbeddings: false,
        webhooks: false,
        sso: false,
      },
    });
    await this.subscriptionRepository.save(subscription);

    // Send verification email
    await this.emailService.sendVerificationEmail(
      user.email,
      emailVerificationToken,
    );

    // Log audit event
    await this.auditService.log({
      action: AuditAction.REGISTER,
      resourceType: "user",
      resourceId: user.id,
      userId: user.id,
      organizationId: organization?.id,
      description: "User registered",
    });

    // Generate tokens
    const tokens = await this.generateTokens(user, organization?.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.isActive) {
      throw new UnauthorizedException("User account is deactivated");
    }

    // Update last login
    await this.userRepository.update(user.id, {
      lastLoginAt: new Date(),
    });

    // Get user's primary organization
    const membership = await this.organizationMemberRepository.findOne({
      where: { userId: user.id },
      relations: ["organization"],
      order: { createdAt: "ASC" }, // Get the first organization
    });

    // Log audit event
    await this.auditService.log({
      action: AuditAction.LOGIN,
      resourceType: "user",
      resourceId: user.id,
      userId: user.id,
      organizationId: membership?.organization?.id,
      description: "User logged in",
    });

    // Generate tokens
    const tokens = await this.generateTokens(
      user,
      membership?.organization?.id,
      membership?.role,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    };
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (user && (await user.validatePassword(password))) {
      return user;
    }

    return null;
  }

  async validateUserById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  async refreshToken(dto: RefreshTokenDto): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify(dto.refreshToken, {
        secret: this.configService.get("JWT_REFRESH_SECRET"),
      }) as JwtPayload;

      if (payload.type !== "refresh") {
        throw new UnauthorizedException("Invalid token type");
      }

      const user = await this.validateUserById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException("User not found or inactive");
      }

      // Generate new tokens
      const tokens = await this.generateTokens(
        user,
        payload.organizationId,
        payload.role as UserRole,
      );

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
        },
      };
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      // Don't reveal if user exists
      return;
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await this.userRepository.update(user.id, {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
    });

    // Send reset email
    await this.emailService.sendPasswordResetEmail(user.email, resetToken);

    // Log audit event
    await this.auditService.log({
      action: AuditAction.FORGOT_PASSWORD,
      resourceType: "user",
      resourceId: user.id,
      userId: user.id,
      description: "Password reset requested",
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.userRepository.findOne({
      where: {
        passwordResetToken: dto.token,
      },
    });

    if (
      !user ||
      !user.passwordResetExpires ||
      user.passwordResetExpires < new Date()
    ) {
      throw new BadRequestException("Invalid or expired reset token");
    }

    // Update password and clear reset token
    await this.userRepository.update(user.id, {
      password: dto.password,
      passwordResetToken: null,
      passwordResetExpires: null,
    });

    // Log audit event
    await this.auditService.log({
      action: AuditAction.PASSWORD_RESET,
      resourceType: "user",
      resourceId: user.id,
      userId: user.id,
      description: "Password reset completed",
    });
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { emailVerificationToken: dto.token },
    });

    if (!user) {
      throw new BadRequestException("Invalid verification token");
    }

    await this.userRepository.update(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
    });

    // Log audit event
    await this.auditService.log({
      action: AuditAction.EMAIL_VERIFIED,
      resourceType: "user",
      resourceId: user.id,
      userId: user.id,
      description: "Email verified",
    });
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.emailVerified) {
      throw new BadRequestException("Email is already verified");
    }

    // Generate new verification token
    const emailVerificationToken = randomBytes(32).toString("hex");
    await this.userRepository.update(user.id, {
      emailVerificationToken,
    });

    // Send verification email
    await this.emailService.sendVerificationEmail(
      user.email,
      emailVerificationToken,
    );
  }

  private async generateTokens(
    user: User,
    organizationId?: string,
    role?: UserRole,
  ): Promise<
    Pick<AuthResponseDto, "accessToken" | "refreshToken" | "expiresIn">
  > {
    const accessPayload: Omit<JwtPayload, "iat" | "exp"> = {
      sub: user.id,
      email: user.email,
      organizationId,
      role,
      type: "access",
    };

    const refreshPayload: Omit<JwtPayload, "iat" | "exp"> = {
      sub: user.id,
      email: user.email,
      organizationId,
      role,
      type: "refresh",
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.get("JWT_ACCESS_SECRET"),
      expiresIn: this.configService.get("JWT_ACCESS_EXPIRATION_TIME"),
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get("JWT_REFRESH_SECRET"),
      expiresIn: this.configService.get("JWT_REFRESH_EXPIRATION_TIME"),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  private generateSlug(name: string): string {
    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return `${baseSlug}-${randomBytes(4).toString("hex")}`;
  }

  // OAuth methods
  async handleOAuthUser(
    profile: any,
    provider: "google" | "microsoft" | "facebook",
  ): Promise<AuthResponseDto> {
    let user = await this.userRepository.findOne({
      where: { email: profile.email },
    });

    if (!user) {
      // Create new user from OAuth profile
      user = this.userRepository.create({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        avatar: profile.avatar,
        emailVerified: true,
        password: randomBytes(32).toString("hex"), // Generate random password
        [`${provider}Id`]: profile[`${provider}Id`],
      });
      await this.userRepository.save(user);

      // Log audit event
      await this.auditService.log({
        action: AuditAction.OAUTH_REGISTER,
        resourceType: "user",
        resourceId: user.id,
        userId: user.id,
        description: `User registered via ${provider}`,
        metadata: { provider },
      });
    } else {
      // Update OAuth ID if not set
      if (!user[`${provider}Id`]) {
        await this.userRepository.update(user.id, {
          [`${provider}Id`]: profile[`${provider}Id`],
        });
      }

      // Update last login
      await this.userRepository.update(user.id, {
        lastLoginAt: new Date(),
      });

      // Log audit event
      await this.auditService.log({
        action: AuditAction.OAUTH_LOGIN,
        resourceType: "user",
        resourceId: user.id,
        userId: user.id,
        description: `User logged in via ${provider}`,
        metadata: { provider },
      });
    }

    // Get user's primary organization
    const membership = await this.organizationMemberRepository.findOne({
      where: { userId: user.id },
      relations: ["organization"],
      order: { createdAt: "ASC" },
    });

    // Generate tokens
    const tokens = await this.generateTokens(
      user,
      membership?.organization?.id,
      membership?.role,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: [
        "id",
        "email",
        "firstName",
        "lastName",
        "emailVerified",
        "twoFactorEnabled",
        "createdAt",
        "updatedAt",
      ],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Get user's organization memberships
    const memberships = await this.organizationMemberRepository.find({
      where: { userId },
      relations: ["organization"],
    });

    return {
      user,
      organizations: memberships.map((m) => ({
        id: m.organization.id,
        name: m.organization.name,
        role: m.role,
        createdAt: m.createdAt,
      })),
    };
  }

  async updateProfile(userId: string, updateData: any) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Only allow updating certain fields
    const allowedFields = ["firstName", "lastName"];
    const updateFields: Partial<User> = {};

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updateFields[field] = updateData[field];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return { message: "No valid fields to update" };
    }

    await this.userRepository.update(userId, updateFields);

    // Audit log
    await this.auditService.log({
      action: AuditAction.UPDATE,
      resourceType: "user",
      resourceId: userId,
      userId,
      description: `User profile updated`,
      metadata: { updatedFields: Object.keys(updateFields) },
    });

    return { message: "Profile updated successfully" };
  }
}
