import { Controller, Get, Patch, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AppointmentService } from '../services/appointment.service';
import { UpdateAppointmentStatusDto, AppointmentQueryDto } from '../dto/appointment.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Get()
  async findAll(@Req() req: any, @Query() query: AppointmentQueryDto) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.appointmentService.findAll(organizationId, query);
  }

  @Get('stats')
  async getStats(@Req() req: any) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.appointmentService.getStats(organizationId);
  }

  @Get(':id')
  async findOne(@Req() req: any, @Param('id') id: string) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.appointmentService.findOne(id, organizationId);
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    const organizationId = req.user.organizationId || req.user.organization?.id;
    return this.appointmentService.updateStatus(id, organizationId, dto.status, dto.cancellationReason);
  }
}
