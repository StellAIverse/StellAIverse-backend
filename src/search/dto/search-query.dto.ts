import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum SearchResourceType {
  USER = "user",
  MESSAGE = "message",
  CONVERSATION = "conversation",
  ALL = "all",
}

export class SearchQueryDto {
  @ApiProperty({
    description: "Full-text search query string",
    example: "alice blockchain",
    maxLength: 256,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(256)
  q: string;

  @ApiPropertyOptional({
    description: "Resource type to search within",
    enum: SearchResourceType,
    default: SearchResourceType.ALL,
  })
  @IsOptional()
  @IsEnum(SearchResourceType)
  type?: SearchResourceType = SearchResourceType.ALL;

  @ApiPropertyOptional({
    description: "Page number (1-based)",
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Results per page (max 50)",
    example: 20,
    minimum: 1,
    maximum: 50,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
