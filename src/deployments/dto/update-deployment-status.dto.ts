import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { DeploymentStatus } from "../entities/deployment.enums";

export class UpdateDeploymentStatusDto {
  @ApiProperty({ enum: DeploymentStatus })
  @IsEnum(DeploymentStatus)
  status: DeploymentStatus;

  @ApiPropertyOptional({ description: "Failure or transition message" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
