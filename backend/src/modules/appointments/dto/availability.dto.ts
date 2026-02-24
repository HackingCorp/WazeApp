import { IsEnum, IsOptional, IsString, IsBoolean, IsInt, Min, Max, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DayOfWeek } from '@/common/enums';

export class BusinessHoursItemDto {
  @ApiProperty({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @ApiProperty()
  @IsBoolean()
  isOpen: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  openTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closeTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  breakStartTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  breakEndTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  slotDurationMinutes?: number;
}

export class SetBusinessHoursDto {
  @ApiProperty({ type: [BusinessHoursItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessHoursItemDto)
  hours: BusinessHoursItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;
}

export class AddDayOffDto {
  @ApiProperty()
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;
}
