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
import { randomBytes, randomUUID, createHash } from "crypto";
import * as bcrypt from "bcryptjs";
import {
  User,
  Organization,
  OrganizationMember,
  Subscription,
} from "@/common/entities";
import { UserRole, SubscriptionPlan, AuditAction } from "@/common/enums";
import { PlanService } from "../subscriptions/plan.service";
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
import { PostHogService } from "../posthog/posthog.service";

interface TempAuthCode {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  private tempAuthCodes = new Map<string, TempAuthCode>();

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
    private planService: PlanService,
    private posthogService: PostHogService,
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
    // Store selected plan in metadata - will be upgraded after payment if paid plan selected
    // Use database-driven plan limits and features
    const selectedPlan = dto.plan?.toUpperCase() || 'FREE';
    const subscription = this.subscriptionRepository.create({
      userId: user.id.toString(),
      organizationId: organization?.id,
      plan: SubscriptionPlan.FREE,
      startsAt: new Date(),
      limits: this.planService.getPlanLimits('free'),
      features: this.planService.getPlanFeatures('free'),
      metadata: selectedPlan !== 'FREE' ? {
        pendingUpgrade: {
          plan: selectedPlan,
          requestedAt: new Date().toISOString(),
        },
      } : {},
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

    // PostHog: identify and track registration
    this.posthogService.identify(user.id, {
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      plan: selectedPlan,
    });
    this.posthogService.capture(user.id, 'user_registered', {
      plan: selectedPlan,
      hasOrganization: !!dto.organizationName,
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

    // PostHog: track login
    this.posthogService.capture(user.id, 'user_logged_in');

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

      // Verify refresh token hash
      const tokenHash = this.hashRefreshToken(dto.refreshToken);
      if (!user.refreshTokenHash || user.refreshTokenHash !== tokenHash) {
        throw new UnauthorizedException("Invalid refresh token");
      }

      // Generate new tokens (this will rotate the refresh token hash)
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

    // Update password (hash manually since update() doesn't trigger @BeforeUpdate hooks)
    // Also invalidate refresh token for security
    const hashedPassword = await bcrypt.hash(dto.password, 12);
    await this.userRepository.update(user.id, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
      refreshTokenHash: null,
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

    // PostHog: track email verified
    this.posthogService.capture(user.id, 'email_verified');

    // Send welcome email
    await this.emailService.sendWelcomeEmail(user.email, user.firstName);

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

    // Hash and save the refresh token
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    await this.userRepository.update(user.id, {
      refreshTokenHash,
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

  private hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async logout(userId: string): Promise<void> {
    // Invalidate the refresh token by clearing the hash
    await this.userRepository.update(userId, {
      refreshTokenHash: null,
    });

    // Log audit event
    await this.auditService.log({
      action: AuditAction.LOGOUT,
      resourceType: "user",
      resourceId: userId,
      userId,
      description: "User logged out",
    });
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
    // Note: currentOrganizationId is a virtual property, not a DB column
    // We'll set it based on organization memberships below
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

    // Get current organization details - use the first membership
    // Note: currentOrganizationId is a virtual property, not stored in DB
    let currentOrganization = null;
    let currentOrganizationId = null;

    if (memberships.length > 0) {
      // Use the first organization as the current one
      const primaryMembership = memberships[0];
      currentOrganization = {
        id: primaryMembership.organization.id,
        name: primaryMembership.organization.name,
        role: primaryMembership.role,
      };
      currentOrganizationId = primaryMembership.organization.id;
    }

    return {
      user: {
        ...user,
        currentOrganizationId,
        currentOrganization,
      },
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

  /**
   * Create a redirect code for cross-domain auth (e.g., marketing site -> dashboard)
   * Loads the user, generates fresh tokens, and wraps them in a temp code
   */
  async createRedirectCode(userId: string, organizationId?: string, role?: UserRole): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    const tokens = await this.generateTokens(user, organizationId, role);
    return this.generateTempCode(tokens);
  }

  /**
   * Generate a temporary auth code for OAuth callbacks
   * The code expires in 60 seconds and can only be used once
   */
  generateTempCode(tokens: {
    accessToken: string;
    refreshToken: string;
  }): string {
    const code = randomUUID();
    const expiresAt = Date.now() + 60 * 1000; // 60 seconds

    this.tempAuthCodes.set(code, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt,
    });

    // Cleanup after expiration
    setTimeout(() => {
      this.tempAuthCodes.delete(code);
    }, 60 * 1000);

    return code;
  }

  /**
   * Exchange a temporary auth code for actual tokens
   * The code is single-use and deleted after exchange
   */
  async exchangeTempCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const tempCode = this.tempAuthCodes.get(code);

    if (!tempCode) {
      throw new UnauthorizedException("Invalid or expired auth code");
    }

    if (Date.now() > tempCode.expiresAt) {
      this.tempAuthCodes.delete(code);
      throw new UnauthorizedException("Auth code has expired");
    }

    // Delete the code after use (single-use)
    this.tempAuthCodes.delete(code);

    return {
      accessToken: tempCode.accessToken,
      refreshToken: tempCode.refreshToken,
    };
  }
}
