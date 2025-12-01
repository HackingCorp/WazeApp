import {
  Controller,
  Get,
  Post,
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
import { OrganizationsService } from "./organizations.service";
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  OrganizationQueryDto,
  InviteMemberDto,
  UpdateMemberRoleDto,
  OrganizationResponseDto,
  OrganizationMemberResponseDto,
  OrganizationStatsDto,
} from "./dto/organization.dto";
import { PaginatedResult } from "@/common/dto/pagination.dto";
import {
  CurrentUser,
  AuthenticatedRequest,
} from "@/common/decorators/current-user.decorator";
import { JwtAuthGuard } from "@/common/guards/jwt-auth.guard";
import { RolesGuard } from "@/common/guards/roles.guard";
import { Roles } from "@/common/decorators/roles.decorator";
import { UserRole } from "@/common/enums";

@ApiTags("Organizations")
@Controller("organizations")
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: "Create new organization" })
  @ApiResponse({
    status: 201,
    description: "Organization created successfully",
    type: OrganizationResponseDto,
  })
  async create(
    @Body() createDto: CreateOrganizationDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.create(createDto, user.userId);
  }

  @Get()
  @ApiOperation({ summary: "Get user organizations" })
  @ApiResponse({
    status: 200,
    description: "Organizations retrieved successfully",
  })
  async findAll(
    @Query() query: OrganizationQueryDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<PaginatedResult<OrganizationResponseDto>> {
    return this.organizationsService.findAll(query, user.userId);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get organization by ID" })
  @ApiResponse({
    status: 200,
    description: "Organization found",
    type: OrganizationResponseDto,
  })
  @ApiResponse({ status: 404, description: "Organization not found" })
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.findOne(id, user.userId);
  }

  @Put(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Update organization" })
  @ApiResponse({
    status: 200,
    description: "Organization updated successfully",
    type: OrganizationResponseDto,
  })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateOrganizationDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<OrganizationResponseDto> {
    return this.organizationsService.update(id, updateDto, user.userId);
  }

  @Delete(":id")
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Delete organization" })
  @ApiResponse({
    status: 200,
    description: "Organization deleted successfully",
  })
  @ApiResponse({
    status: 403,
    description: "Only owner can delete organization",
  })
  async delete(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.organizationsService.delete(id, user.userId);
    return { message: "Organization deleted successfully" };
  }

  @Get(":id/members")
  @ApiOperation({ summary: "Get organization members" })
  @ApiResponse({
    status: 200,
    description: "Members retrieved successfully",
    type: [OrganizationMemberResponseDto],
  })
  async getMembers(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<OrganizationMemberResponseDto[]> {
    return this.organizationsService.getMembers(id, user.userId);
  }

  @Post(":id/invite")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Invite user to organization" })
  @ApiResponse({ status: 201, description: "Invitation sent successfully" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  @ApiResponse({ status: 409, description: "User already a member" })
  async inviteMember(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() inviteDto: InviteMemberDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.organizationsService.inviteMember(id, inviteDto, user.userId);
    return { message: "Invitation sent successfully" };
  }

  @Put(":id/members/:memberId/role")
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Update member role" })
  @ApiResponse({ status: 200, description: "Member role updated successfully" })
  @ApiResponse({ status: 403, description: "Only owner can change roles" })
  async updateMemberRole(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
    @Body() updateDto: UpdateMemberRoleDto,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.organizationsService.updateMemberRole(
      id,
      memberId,
      updateDto,
      user.userId,
    );
    return { message: "Member role updated successfully" };
  }

  @Delete(":id/members/:memberId")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Remove member from organization" })
  @ApiResponse({ status: 200, description: "Member removed successfully" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  async removeMember(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.organizationsService.removeMember(id, memberId, user.userId);
    return { message: "Member removed successfully" };
  }

  @Delete(":id/leave")
  @ApiOperation({ summary: "Leave organization" })
  @ApiResponse({ status: 200, description: "Left organization successfully" })
  @ApiResponse({ status: 400, description: "Owner cannot leave organization" })
  async leaveOrganization(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    await this.organizationsService.leaveOrganization(id, user.userId);
    return { message: "Left organization successfully" };
  }

  @Get(":id/stats")
  @ApiOperation({ summary: "Get organization statistics" })
  @ApiResponse({
    status: 200,
    description: "Statistics retrieved successfully",
    type: OrganizationStatsDto,
  })
  async getStats(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedRequest,
  ): Promise<OrganizationStatsDto> {
    return this.organizationsService.getStats(id, user.userId);
  }
}
