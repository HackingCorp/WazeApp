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
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { UserRole } from "../../common/enums";
import { User } from "../../common/entities";
import { DocumentService } from "./document.service";
import {
  UploadDocumentDto,
  UploadUrlDocumentDto,
  UploadMultipleUrlsDocumentDto,
  UpdateDocumentDto,
  DocumentQueryDto,
  DocumentSearchDto,
  DocumentStatsDto,
  CreateRichTextDocumentDto,
} from "./dto/document.dto";

@ApiTags("Knowledge Base - Documents")
@Controller("documents")
@ApiBearerAuth()
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post("upload")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload a document file" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
        title: {
          type: "string",
        },
        type: {
          type: "string",
          enum: ["pdf", "docx", "txt", "md", "image", "video", "audio"],
        },
        knowledgeBaseId: {
          type: "string",
          format: "uuid",
        },
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Document uploaded successfully",
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Invalid file or quota exceeded",
  })
  async uploadFile(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadDto: UploadDocumentDto,
  ) {
    return this.documentService.uploadFile(
      user.currentOrganizationId || null,
      user.id,
      file,
      uploadDto,
    );
  }

  @Post("upload-url")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Upload document from URL" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "URL document created successfully",
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid URL" })
  async uploadFromUrl(
    @CurrentUser() user: User,
    @Body() uploadDto: UploadUrlDocumentDto,
  ) {
    return this.documentService.uploadFromUrl(
      user.currentOrganizationId || null,
      user.id,
      uploadDto,
    );
  }

  @Post("scrape-url")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Scrape URL content in real-time" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "URL content scraped successfully",
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid URL or scraping failed" })
  async scrapeUrl(
    @CurrentUser() user: User,
    @Body() body: { url: string; options?: any },
  ) {
    return this.documentService.scrapeUrlContent(body.url, body.options);
  }

  @Post("deep-crawl-url")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Deep crawl website to get all pages content" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Website deep crawl completed successfully",
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid URL or crawling failed" })
  async deepCrawlUrl(
    @CurrentUser() user: User,
    @Body() body: { 
      url: string; 
      options?: {
        maxPages?: number;
        maxDepth?: number;
        sameDomainOnly?: boolean;
        excludePatterns?: string[];
        includeImages?: boolean;
        delay?: number;
      }
    },
  ) {
    return this.documentService.deepCrawlUrlContent(body.url, body.options);
  }

  @Post("upload-multiple-urls")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Upload documents from multiple URLs" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Multiple URL documents created successfully",
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid URLs" })
  async uploadFromMultipleUrls(
    @CurrentUser() user: User,
    @Body() uploadDto: UploadMultipleUrlsDocumentDto,
  ) {
    return this.documentService.uploadFromMultipleUrls(
      user.currentOrganizationId || null,
      user.id,
      uploadDto,
    );
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Create rich text document" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Rich text document created successfully",
  })
  @ApiResponse({ 
    status: HttpStatus.BAD_REQUEST, 
    description: "Invalid content or quota exceeded" 
  })
  async createRichText(
    @CurrentUser() user: User,
    @Body() createDto: CreateRichTextDocumentDto,
  ) {
    return this.documentService.createRichTextDocument(
      user.currentOrganizationId || null,
      user.id,
      createDto,
    );
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get all documents for user" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Documents retrieved successfully",
  })
  async findAll(@CurrentUser() user: User, @Query() query: DocumentQueryDto) {
    return this.documentService.findAll(
      user.currentOrganizationId || null,
      query,
    );
  }

  @Get("stats")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get document statistics" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Document statistics retrieved successfully",
    type: DocumentStatsDto,
  })
  async getStats(@CurrentUser() user: User): Promise<DocumentStatsDto> {
    return this.documentService.getStats(user.currentOrganizationId || null);
  }

  @Post("search")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Search documents and chunks" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Search results retrieved successfully",
  })
  async search(
    @CurrentUser() user: User,
    @Body() searchDto: DocumentSearchDto,
  ) {
    return this.documentService.search(
      user.currentOrganizationId || null,
      searchDto,
    );
  }

  @Get(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get document by ID" })
  @ApiParam({ name: "id", description: "Document ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Document retrieved successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Document not found",
  })
  async findOne(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.documentService.findOne(user.currentOrganizationId || null, id);
  }

  @Patch(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Update document" })
  @ApiParam({ name: "id", description: "Document ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Document updated successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Document not found",
  })
  async update(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
  ) {
    return this.documentService.update(
      user.currentOrganizationId || null,
      user.id,
      id,
      updateDocumentDto,
    );
  }

  @Delete(":id")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Delete document" })
  @ApiParam({ name: "id", description: "Document ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Document deleted successfully",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Document not found",
  })
  async remove(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    await this.documentService.delete(
      user.currentOrganizationId || null,
      user.id,
      id,
    );
    return { message: "Document deleted successfully" };
  }

  @Post(":id/reprocess")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  @ApiOperation({ summary: "Reprocess document" })
  @ApiParam({ name: "id", description: "Document ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Document reprocessing started",
  })
  async reprocess(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    // This would trigger reprocessing of a specific document
    // Implementation would go in the service
    return { message: "Document reprocessing started" };
  }

  @Get(":id/chunks")
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER)
  @ApiOperation({ summary: "Get document chunks" })
  @ApiParam({ name: "id", description: "Document ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Document chunks retrieved successfully",
  })
  async getChunks(
    @CurrentUser() user: User,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    const document = await this.documentService.findOne(
      user.currentOrganizationId || null,
      id,
    );
    return document.chunks || [];
  }
}
