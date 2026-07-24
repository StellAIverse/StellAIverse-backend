import {
  IsString,
  IsOptional,
  IsNumber,
  IsObject,
  Min,
  Max,
  IsEnum,
} from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";

export class BackoffDto {
  @ApiPropertyOptional({ enum: ["exponential", "fixed", "linear"] })
  @IsEnum(["exponential", "fixed", "linear"])
  type: "exponential" | "fixed" | "linear";

  @ApiPropertyOptional({ description: "Initial delay in milliseconds" })
  @IsNumber()
  @Min(100)
  delay: number;
}

export class CreateJobDto {
  @ApiPropertyOptional({
    description: "Idempotency key to prevent duplicate processing",
    example: "user-123-email-welcome",
  })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: "Job priority (1=highest, 100=lowest)",
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({
    description: "Delay in milliseconds before the job is processed",
    example: 5000,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  delay?: number;

  @ApiPropertyOptional({
    description: "Maximum number of retry attempts",
    minimum: 1,
    maximum: 10,
    default: 3,
  })
  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  maxAttempts?: number;

  @ApiPropertyOptional({
    description: "Custom backoff strategy",
  })
  @IsObject()
  @IsOptional()
  @Type(() => BackoffDto)
  backoff?: BackoffDto;

  @ApiPropertyOptional({
    description: "Custom job ID for deduplication",
  })
  @IsString()
  @IsOptional()
  jobId?: string;

  @ApiPropertyOptional({
    description: "Additional metadata to attach to the job",
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
