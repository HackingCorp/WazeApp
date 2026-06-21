import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { LeadService } from "../services/lead.service";
import { LeadQueryDto, UpdateLeadStatusDto } from "../dto/lead.dto";

@ApiTags("Leads")
@ApiBearerAuth()
@Controller("leads")
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Get()
  async findAll(@Req() req: any, @Query() query: LeadQueryDto) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.leadService.findAll(organizationId, query);
  }

  @Get("stats")
  async getStats(@Req() req: any) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.leadService.getStats(organizationId);
  }

  @Get(":id")
  async findOne(@Req() req: any, @Param("id") id: string) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.leadService.findOne(id, organizationId);
  }

  @Patch(":id/status")
  async updateStatus(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.leadService.updateStatus(id, organizationId, dto.status);
  }

  @Delete(":id")
  async remove(@Req() req: any, @Param("id") id: string) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.leadService.remove(id, organizationId);
  }
}
