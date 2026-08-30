import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsObject,
  IsInt,
  Min,
  Max,
  Length,
} from "class-validator";
import { Type } from "class-transformer";
import { PortfolioStatus, PortfolioType } from "../entities/portfolio.entity";

export class CreatePortfolioDto {
  @IsString()
  @Length(3, 100, {
    message: "Portfolio name must be between 3 and 100 characters",
  })
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PortfolioType)
  type?: PortfolioType;

  @IsOptional()
  @IsNumber()
  totalValue?: number;

  @IsOptional()
  @IsObject()
  initialAllocation?: Record<string, number>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  autoRebalanceEnabled?: boolean;

  @IsOptional()
  @IsString()
  rebalanceFrequency?: "daily" | "weekly" | "monthly" | "quarterly";

  @IsOptional()
  @IsNumber()
  rebalanceThreshold?: number;
}

export class UpdatePortfolioDto {
  @IsOptional()
  @IsString()
  @Length(3, 100, {
    message: "Portfolio name must be between 3 and 100 characters",
  })
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PortfolioStatus)
  status?: PortfolioStatus;

  @IsOptional()
  @IsEnum(PortfolioType)
  type?: PortfolioType;

  @IsOptional()
  @IsObject()
  targetAllocation?: Record<string, number>;

  @IsOptional()
  @IsBoolean()
  autoRebalanceEnabled?: boolean;

  @IsOptional()
  @IsString()
  rebalanceFrequency?: "daily" | "weekly" | "monthly" | "quarterly";

  @IsOptional()
  @IsNumber()
  rebalanceThreshold?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class QueryPortfolioDto {
  @IsOptional()
  @IsEnum(PortfolioStatus)
  status?: PortfolioStatus;

  @IsOptional()
  @IsEnum(PortfolioType)
  type?: PortfolioType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class PaginatedPortfoliosDto {
  data: PortfolioResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class PortfolioResponseDto {
  id: string;
  name: string;
  description?: string;
  status: PortfolioStatus;
  type: PortfolioType;
  totalValue: number;
  currentAllocation: Record<string, number>;
  targetAllocation?: Record<string, number>;
  initialAllocation?: Record<string, number>;
  autoRebalanceEnabled: boolean;
  rebalanceFrequency?: string;
  rebalanceThreshold: number;
  lastRebalanceDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}
