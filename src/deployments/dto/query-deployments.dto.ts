import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsPositive, Max } from "class-validator";
import {
  DeploymentEnvironment,
  DeploymentStatus,
} from "../entities/deployment.enums";

export class QueryDeploymentsDto {
  @ApiPropertyOptional({ enum: DeploymentEnvironment })
  @IsOptional()
  @IsEnum(DeploymentEnvironment)
  environment?: DeploymentEnvironment;

  @ApiPropertyOptional({ enum: DeploymentStatus })
  @IsOptional()
  @IsEnum(DeploymentStatus)
  status?: DeploymentStatus;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit = 20;
}
