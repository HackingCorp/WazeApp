import {
  Entity,
  Column,
  Index,
  OneToMany,
  ManyToMany,
  JoinTable,
  BeforeInsert,
  BeforeUpdate,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { Exclude } from "class-transformer";
import * as bcrypt from "bcryptjs";
import { BaseEntity } from "./base.entity";
import { Organization } from "./organization.entity";
import { OrganizationMember } from "./organization-member.entity";
import { AuditLog } from "./audit-log.entity";
import { WhatsAppSession } from "./whatsapp-session.entity";

@Entity("users")
@Index("IDX_USER_EMAIL", ["email"])
export class User extends BaseEntity {
  @ApiProperty({ description: "User email address" })
  @Column({ unique: true })
  email: string;

  @ApiProperty({ description: "User password" })
  @Exclude({ toPlainOnly: true })
  @Column()
  password: string;

  @ApiProperty({ description: "User first name" })
  @Column()
  firstName: string;

  @ApiProperty({ description: "User last name" })
  @Column()
  lastName: string;

  @ApiProperty({ description: "User avatar URL", required: false })
  @Column({ nullable: true })
  avatar?: string;

  @ApiProperty({ description: "User phone number", required: false })
  @Column({ nullable: true })
  phone?: string;

  @ApiProperty({ description: "User timezone", required: false })
  @Column({ default: "UTC" })
  timezone: string;

  @ApiProperty({ description: "User language preference", required: false })
  @Column({ default: "en" })
  language: string;

  @ApiProperty({ description: "Email verification status" })
  @Column({ default: false })
  emailVerified: boolean;

  @ApiProperty({ description: "Email verification token", required: false })
  @Exclude({ toPlainOnly: true })
  @Column({ nullable: true })
  emailVerificationToken?: string;

  @ApiProperty({ description: "Password reset token", required: false })
  @Exclude({ toPlainOnly: true })
  @Column({ nullable: true })
  passwordResetToken?: string;

  @ApiProperty({ description: "Password reset token expiry", required: false })
  @Column({ nullable: true })
  passwordResetExpires?: Date;

  @ApiProperty({ description: "2FA secret", required: false })
  @Exclude({ toPlainOnly: true })
  @Column({ nullable: true })
  twoFactorSecret?: string;

  @ApiProperty({ description: "2FA enabled status" })
  @Column({ default: false })
  twoFactorEnabled: boolean;

  @ApiProperty({ description: "Last login timestamp", required: false })
  @Column({ nullable: true })
  lastLoginAt?: Date;

  @ApiProperty({ description: "User active status" })
  @Column({ default: true })
  isActive: boolean;

  @ApiProperty({ description: "Google OAuth ID", required: false })
  @Column({ nullable: true })
  googleId?: string;

  @ApiProperty({ description: "Microsoft OAuth ID", required: false })
  @Column({ nullable: true })
  microsoftId?: string;

  @ApiProperty({ description: "Facebook OAuth ID", required: false })
  @Column({ nullable: true })
  facebookId?: string;

  // Relationships
  @OneToMany(() => Organization, (organization) => organization.owner)
  ownedOrganizations: Organization[];

  @OneToMany(() => OrganizationMember, (member) => member.user)
  organizationMemberships: OrganizationMember[];

  @OneToMany(() => AuditLog, (auditLog) => auditLog.user)
  auditLogs: AuditLog[];

  @OneToMany(() => WhatsAppSession, (session) => session.user)
  whatsappSessions: WhatsAppSession[];

  // Virtual properties
  @ApiProperty({ description: "User full name" })
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  // Current organization for multi-tenant context
  currentOrganizationId?: string;

  // User roles in current organization context
  roles?: string[];

  // Hooks
  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.password && !this.password.startsWith("$2a$")) {
      this.password = await bcrypt.hash(this.password, 12);
    }
  }

  // Methods
  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }

  toJSON() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
      password,
      emailVerificationToken,
      passwordResetToken,
      twoFactorSecret,
      ...result
    } = this;
    return result;
  }
}
