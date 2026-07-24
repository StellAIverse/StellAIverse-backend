import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
  IsDateString,
  IsEnum,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { CreateJobDto } from "./create-job.dto";

export class CreateAnalyticsJobDto extends CreateJobDto {
  @ApiProperty({
    description: "Type of analytics event to aggregate",
    example: "user_login",
  })
  @IsString()
  eventType: string;

  @ApiProperty({
    description: "Aggregation function",
    enum: ["sum", "count", "avg", "min", "max"],
  })
  @IsEnum(["sum", "count", "avg", "min", "max"])
  aggregationType: "sum" | "count" | "avg" | "min" | "max";

  @ApiProperty({
    description: "Start of the time range",
    example: "2024-01-01T00:00:00Z",
  })
  @IsDateString()
  startDate: Date;

  @ApiProperty({
    description: "End of the time range",
    example: "2024-01-31T23:59:59Z",
  })
  @IsDateString()
  endDate: Date;

  @ApiPropertyOptional({
    description: "Dimensions to group by",
    example: ["country", "deviceType"],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dimensions?: string[];

  @ApiPropertyOptional({
    description: "Filters to apply",
    example: { country: "US", planType: "premium" },
  })
  @IsObject()
  @IsOptional()
  filters?: Record<string, any>;
}
