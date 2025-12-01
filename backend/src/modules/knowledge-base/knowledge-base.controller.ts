import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { UserRole } from "../../common/enums";
import { User } from "../../common/entities";
import { KnowledgeBaseService } from "./knowledge-base.service";
import {
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  KnowledgeBaseQueryDto,
  KnowledgeBaseStatsDto,
} from "./dto/knowledge-base.dto";

@ApiTags("Knowledge Base")
@Controller("knowledge-bases")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Post()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Create a new knowledge base" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Knowledge base created successfully",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "Knowledge base limit reached",
  })
  async create(
    @CurrentUser() user: User,
    @Body() createKnowledgeBaseDto: CreateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.createForUser(
      user.currentOrganizationId || null,
      user.id,
      createKnowledgeBaseDto,
    );
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get all knowledge bases for organization" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Knowledge bases retrieved successfully",
  })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: KnowledgeBaseQueryDto,
  ) {
    return this.knowledgeBaseService.findAll(
      user.currentOrganizationId || null,
      user.id,
      query
    );
  }

  @Get("stats")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get knowledge base statistics" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Knowledge base statistics retrieved successfully",
    type: KnowledgeBaseStatsDto,
  })
  async getStats(@CurrentUser() user: User): Promise<KnowledgeBaseStatsDto> {
    console.log("🔍 STATS REQUEST - user.currentOrganizationId:", user.currentOrganizationId);
    console.log("🔍 STATS REQUEST - user.id:", user.id);
    
    const stats = await this.knowledgeBaseService.getStats(user.currentOrganizationId);
    
    console.log("🔍 STATS RESPONSE - totalCharacters:", stats.totalCharacters);
    console.log("🔍 STATS RESPONSE - totalDocuments:", stats.totalDocuments);
    console.log("🔍 STATS RESPONSE - full response:", JSON.stringify(stats, null, 2));
    
    return stats;
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get knowledge base by ID" })
  @ApiParam({ name: "id", description: "Knowledge base ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Knowledge base retrieved successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Knowledge base not found",
  })
  async findOne(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.knowledgeBaseService.findOne(user.currentOrganizationId, id);
  }

  @Patch(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Update knowledge base" })
  @ApiParam({ name: "id", description: "Knowledge base ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Knowledge base updated successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Knowledge base not found",
  })
  async update(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateKnowledgeBaseDto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.update(
      user.currentOrganizationId,
      user.id,
      id,
      updateKnowledgeBaseDto,
    );
  }

  @Delete(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: "Delete knowledge base" })
  @ApiParam({ name: "id", description: "Knowledge base ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Knowledge base deleted successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Knowledge base not found",
  })
  async remove(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.knowledgeBaseService.delete(
      user.currentOrganizationId,
      user.id,
      id,
    );
    return { message: "Knowledge base deleted successfully" };
  }

  @Post(":id/rebuild")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Rebuild knowledge base (reprocess all documents)" })
  @ApiParam({ name: "id", description: "Knowledge base ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Knowledge base rebuild started",
  })
  async rebuild(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    // This would trigger reprocessing of all documents in the knowledge base
    // Implementation would go in the service
    return { message: "Knowledge base rebuild started" };
  }

  @Post(":id/refresh-stats")
  @Public()
  @ApiOperation({ summary: "Refresh knowledge base statistics" })
  @ApiParam({ name: "id", description: "Knowledge base ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Knowledge base statistics refreshed",
  })
  async refreshStats(
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.knowledgeBaseService.updateStats(id);
    return { message: "Knowledge base statistics refreshed successfully" };
  }

  @Get("debug/:id")
  @Public()
  @ApiOperation({ summary: "Debug endpoint to check KB data" })
  async debugKB(@Param("id") id: string) {
    try {
      const kb = await this.knowledgeBaseService.findOne(null, id);
      return { 
        id: kb.id,
        name: kb.name,
        totalCharacters: kb.totalCharacters,
        documentCount: kb.documentCount,
        organizationId: kb.organizationId,
        documentsLength: kb.documents?.length,
        documents: kb.documents?.map(doc => ({
          id: doc.id,
          characterCount: doc.characterCount,
          status: doc.status
        }))
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  @Get("debug-stats/:orgId")
  @Public()
  @ApiOperation({ summary: "Debug stats endpoint" })
  async debugStats(@Param("orgId") orgId: string) {
    try {
      const stats = await this.knowledgeBaseService.getStats(orgId);
      console.log("🔍 DEBUG STATS - organizationId:", orgId);
      console.log("🔍 DEBUG STATS - totalCharacters:", stats.totalCharacters);
      console.log("🔍 DEBUG STATS - totalDocuments:", stats.totalDocuments);
      console.log("🔍 DEBUG STATS - full stats:", JSON.stringify(stats, null, 2));
      return { stats, orgId };
    } catch (error) {
      console.log("❌ DEBUG STATS ERROR:", error.message);
      return { error: error.message };
    }
  }
  
}
