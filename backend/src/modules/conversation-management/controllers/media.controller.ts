import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { UserRole, MediaType, MediaQuality } from "../../../common/enums";
import { User } from "../../../common/entities";
import { MediaHandlingService } from "../services/media-handling.service";
import { ExternalMediaService } from "../services/external-media.service";

class MediaSearchDto {
  query: string;
  mediaType: MediaType;
  limit?: number = 10;
  safeSearch?: boolean = true;
}

class ImportMediaDto {
  mediaResults: any[];
  tags?: string[];
  isTemplate?: boolean = false;
}

@ApiTags("media")
@Controller("media")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MediaController {
  constructor(
    private mediaHandlingService: MediaHandlingService,
    private externalMediaService: ExternalMediaService,
  ) {}

  @Post("upload")
  @ApiOperation({ summary: "Upload media file" })
  @ApiConsumes("multipart/form-data")
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Media uploaded successfully",
  })
  @UseInterceptors(FileInterceptor("file"))
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async uploadMedia(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    options: {
      tags?: string;
      altText?: string;
      isTemplate?: string;
      quality?: MediaQuality;
      generateVariants?: string;
    },
  ) {
    if (!file) {
      throw new BadRequestException("No file provided");
    }

    const uploadOptions = {
      organizationId: user.currentOrganizationId!,
      userId: user.id,
      tags: options.tags
        ? options.tags.split(",").map((t) => t.trim())
        : undefined,
      altText: options.altText,
      isTemplate: options.isTemplate === "true",
      quality: options.quality,
      generateVariants: options.generateVariants !== "false",
    };

    const result = await this.mediaHandlingService.uploadMedia(
      file,
      uploadOptions,
    );

    return {
      success: true,
      asset: result.asset,
      uploadUrl: result.uploadUrl,
      thumbnailUrl: result.thumbnailUrl,
      variants: result.variants,
    };
  }

  @Get("gallery")
  @ApiOperation({ summary: "Get media gallery" })
  @ApiQuery({ name: "mediaType", required: false, enum: MediaType })
  @ApiQuery({ name: "tags", required: false, type: String })
  @ApiQuery({ name: "isTemplate", required: false, type: Boolean })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Gallery retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getGallery(
    @CurrentUser() user: User,
    @Query("mediaType") mediaType?: MediaType,
    @Query("tags") tags?: string,
    @Query("isTemplate") isTemplate?: boolean,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ) {
    const filters = {
      mediaType,
      tags: tags ? tags.split(",").map((t) => t.trim()) : undefined,
      isTemplate,
      limit,
      offset,
    };

    const gallery = await this.mediaHandlingService.getMediaGallery(
      user.currentOrganizationId!,
      filters,
    );

    return {
      success: true,
      ...gallery,
    };
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete media asset" })
  @ApiParam({ name: "id", description: "Media asset ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Media deleted successfully",
  })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async deleteMedia(@CurrentUser() user: User, @Param("id") id: string) {
    await this.mediaHandlingService.deleteMedia(
      id,
      user.currentOrganizationId!,
    );

    return {
      success: true,
      message: "Media asset deleted successfully",
    };
  }

  @Get("templates")
  @ApiOperation({ summary: "Get quick response templates" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Templates retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getTemplates(@CurrentUser() user: User) {
    const templates = await this.mediaHandlingService.getQuickResponseTemplates(
      user.currentOrganizationId!,
    );

    return {
      success: true,
      templates,
    };
  }

  @Post("search")
  @ApiOperation({ summary: "Search external media" })
  @ApiResponse({ status: HttpStatus.OK, description: "Media search completed" })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async searchMedia(
    @CurrentUser() user: User,
    @Body() searchDto: MediaSearchDto,
  ) {
    const searchRequest = {
      ...searchDto,
      organizationId: user.currentOrganizationId!,
    };

    const results = await this.externalMediaService.searchMedia(searchRequest);

    return {
      success: true,
      ...results,
    };
  }

  @Get("search/suggestions")
  @ApiOperation({ summary: "Get search suggestions" })
  @ApiQuery({ name: "query", description: "Search query" })
  @ApiQuery({ name: "mediaType", enum: MediaType })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Suggestions retrieved successfully",
  })
  @Roles(UserRole.VIEWER, UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async getSearchSuggestions(
    @CurrentUser() user: User,
    @Query("query") query: string,
    @Query("mediaType") mediaType: MediaType,
  ) {
    if (!query || !mediaType) {
      throw new BadRequestException("Query and mediaType are required");
    }

    const suggestions = await this.externalMediaService.getSearchSuggestions(
      query,
      mediaType,
      user.currentOrganizationId!,
    );

    return {
      success: true,
      suggestions,
    };
  }

  @Post("import")
  @ApiOperation({ summary: "Import external media to gallery" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Media imported successfully",
  })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async importMedia(
    @CurrentUser() user: User,
    @Body() importDto: ImportMediaDto,
  ) {
    const importedAssets = await this.externalMediaService.importMedia(
      user.currentOrganizationId!,
      importDto.mediaResults,
      {
        tags: importDto.tags,
        isTemplate: importDto.isTemplate,
      },
    );

    return {
      success: true,
      imported: importedAssets.length,
      assets: importedAssets,
    };
  }

  @Post(":id/use")
  @ApiOperation({ summary: "Record media usage" })
  @ApiParam({ name: "id", description: "Media asset ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Usage recorded successfully",
  })
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  async recordUsage(@CurrentUser() user: User, @Param("id") id: string) {
    await this.mediaHandlingService.recordUsage(id);

    return {
      success: true,
      message: "Usage recorded successfully",
    };
  }
}
