import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  DeploymentEnvironment,
  DeploymentStatus,
} from "../entities/deployment.enums";

export class CreateDeploymentDto {
  @ApiPropertyOptional({ description: "CI provider's idempotency key" })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalId?: string;

  @ApiProperty({ enum: DeploymentEnvironment })
  @IsEnum(DeploymentEnvironment)
  environment: DeploymentEnvironment;

  @ApiProperty({ example: "2026.08.20.1" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  version: string;

  @ApiProperty({ example: "a1b2c3d4" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  commitSha: string;

  @ApiPropertyOptional({
    enum: DeploymentStatus,
    default: DeploymentStatus.RECEIVED,
  })
  @IsOptional()
  @IsEnum(DeploymentStatus)
  status?: DeploymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
