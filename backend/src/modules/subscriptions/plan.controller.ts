import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { PlanService } from './plan.service';
import { Plan } from '../../common/entities';

@ApiTags('Plans')
@Controller('plans')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Get()
  @ApiOperation({ summary: 'Get all available plans' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Plans retrieved successfully',
  })
  async getAllPlans(): Promise<Plan[]> {
    return this.planService.getAllPlans();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get plan by code' })
  @ApiParam({ name: 'code', description: 'Plan code (free, standard, pro, enterprise)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Plan retrieved successfully',
  })
  async getPlan(@Param('code') code: string): Promise<Plan | null> {
    return this.planService.getPlanByCodeFromDb(code);
  }

  @Put(':code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update plan (admin only)' })
  @ApiParam({ name: 'code', description: 'Plan code' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Plan updated successfully',
  })
  async updatePlan(
    @Param('code') code: string,
    @Body() updates: Partial<Plan>,
  ): Promise<Plan | null> {
    return this.planService.updatePlan(code, updates);
  }
}
