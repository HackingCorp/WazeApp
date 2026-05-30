import { Controller, Post, Body, BadRequestException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';
import { OpenApiDiscoveryService } from './openapi-discovery.service';

class DiscoverToolsDto {
  @IsString()
  baseUrl: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsIn(['bearer', 'api-key-header', 'query-param', 'basic', 'none'])
  authType: 'bearer' | 'api-key-header' | 'query-param' | 'basic' | 'none';

  @IsOptional()
  @IsString()
  authHeaderName?: string;
}

@ApiTags('tools')
@Controller('tools')
export class OpenApiDiscoveryController {
  private readonly logger = new Logger(OpenApiDiscoveryController.name);

  constructor(
    private readonly discoveryService: OpenApiDiscoveryService,
  ) {}

  @Post('discover')
  @ApiOperation({ summary: 'Discover API endpoints from an OpenAPI/Swagger spec' })
  @ApiResponse({ status: 200, description: 'Tools discovered successfully' })
  @ApiResponse({ status: 400, description: 'Could not discover tools' })
  async discoverTools(@Body() dto: DiscoverToolsDto) {
    try {
      const result = await this.discoveryService.discoverTools(
        dto.baseUrl,
        dto.apiKey,
        dto.authType,
        dto.authHeaderName,
      );

      return {
        success: true,
        tools: result.tools,
        specVersion: result.specVersion,
        count: result.tools.length,
      };
    } catch (error) {
      this.logger.warn(`Tool discovery failed for ${dto.baseUrl}: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }
}
