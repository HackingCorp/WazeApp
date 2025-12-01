import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from "typeorm";
import { ApiProperty } from "@nestjs/swagger";
import { BaseEntity } from "./base.entity";
import { User } from "./user.entity";
import { Organization } from "./organization.entity";
import { UserRole } from "../enums";

@Entity("organization_members")
@Unique("UQ_USER_ORGANIZATION", ["userId", "organizationId"])
@Index("IDX_ORG_MEMBER_USER", ["userId"])
@Index("IDX_ORG_MEMBER_ORG", ["organizationId"])
export class OrganizationMember extends BaseEntity {
  @ApiProperty({ description: "User role in organization", enum: UserRole })
  @Column({ type: "enum", enum: UserRole, default: UserRole.MEMBER })
  role: UserRole;

  @ApiProperty({ description: "Member active status" })
  @Column({ default: true })
  isActive: boolean;

  @ApiProperty({ description: "Invitation accepted status" })
  @Column({ default: false })
  invitationAccepted: boolean;

  @ApiProperty({ description: "Invitation token", required: false })
  @Column({ nullable: true })
  invitationToken?: string;

  @ApiProperty({ description: "Invitation expires at", required: false })
  @Column({ nullable: true })
  invitationExpiresAt?: Date;

  @ApiProperty({ description: "Invited by user ID", required: false })
  @Column({ nullable: true })
  invitedById?: string;

  @ApiProperty({ description: "Date when member joined" })
  @Column({ nullable: true })
  joinedAt?: Date;

  // Relationships
  @ApiProperty({ description: "User" })
  @ManyToOne(() => User, (user) => user.organizationMemberships, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ name: "userId" })
  userId: string;

  @ApiProperty({ description: "Organization" })
  @ManyToOne(() => Organization, (org) => org.organizationMembers, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @Column({ name: "organizationId" })
  organizationId: string;

  @ApiProperty({ description: "User who invited this member", required: false })
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "invitedById" })
  invitedBy?: User;
}
