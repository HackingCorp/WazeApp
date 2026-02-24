import { Controller, Get, Put, Post, Delete, Param, Query, Body, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AvailabilityService } from '../services/availability.service';
import { SetBusinessHoursDto, AddDayOffDto } from '../dto/availability.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments/availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('hours')
  async getBusinessHours(@Req() req: any, @Query('agentId') agentId?: string) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.availabilityService.getBusinessHours(organizationId, agentId);
  }

  @Put('hours')
  async setBusinessHours(@Req() req: any, @Body() dto: SetBusinessHoursDto) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.availabilityService.setBusinessHours(organizationId, dto.hours, dto.agentId);
  }

  @Get('days-off')
  async getDaysOff(@Req() req: any, @Query('agentId') agentId?: string) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.availabilityService.getDaysOff(organizationId, agentId);
  }

  @Post('days-off')
  async addDayOff(@Req() req: any, @Body() dto: AddDayOffDto) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.availabilityService.addDayOff(organizationId, dto);
  }

  @Delete('days-off/:id')
  async removeDayOff(@Req() req: any, @Param('id') id: string) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.availabilityService.removeDayOff(id, organizationId);
  }

  @Get('slots')
  async getAvailableSlots(
    @Req() req: any,
    @Query('date') date: string,
    @Query('agentId') agentId?: string,
  ) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.availabilityService.getAvailableSlots(organizationId, date, agentId);
  }
}
