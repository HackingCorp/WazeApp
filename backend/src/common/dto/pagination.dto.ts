import { IsOptional, IsPositive, Min, Max } from "class-validator";
import { Transform, Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class PaginationDto {
  @ApiPropertyOptional({
    description: "Page number (starts from 1)",
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Number of items per page",
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({ description: "Search query" })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  search?: string;
}

export class PaginatedResult<T> {
  @ApiPropertyOptional({ description: "Result items" })
  data: T[];

  @ApiPropertyOptional({ description: "Total number of items" })
  total: number;

  @ApiPropertyOptional({ description: "Current page" })
  page: number;

  @ApiPropertyOptional({ description: "Items per page" })
  limit: number;

  @ApiPropertyOptional({ description: "Total pages" })
  totalPages: number;

  @ApiPropertyOptional({ description: "Has next page" })
  hasNextPage: boolean;

  @ApiPropertyOptional({ description: "Has previous page" })
  hasPrevPage: boolean;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = Math.ceil(total / limit);
    this.hasNextPage = page < this.totalPages;
    this.hasPrevPage = page > 1;
  }
}
