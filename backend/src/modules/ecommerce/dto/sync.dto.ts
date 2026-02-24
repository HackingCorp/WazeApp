import { IsString, IsOptional, IsEnum } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class TriggerSyncDto {
  @ApiPropertyOptional({ description: "Sync type" })
  @IsOptional()
  @IsString()
  type?: "full" | "incremental";
}
