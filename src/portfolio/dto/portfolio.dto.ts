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
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PortfolioStatus, PortfolioType } from "../entities/portfolio.entity";

export class CreatePortfolioDto {
  @ApiProperty({
    description: "Portfolio name (3-100 characters, must be unique)",
    example: "My Growth Fund",
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @Length(3, 100, {
    message: "Portfolio name must be between 3 and 100 characters",
  })
  name: string;

  @ApiPropertyOptional({
    description: "Portfolio description",
    example: "Long-term growth portfolio focused on tech stocks",
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Portfolio type",
    enum: PortfolioType,
    default: PortfolioType.BALANCED,
    example: PortfolioType.AGGRESSIVE,
  })
  @IsOptional()
  @IsEnum(PortfolioType)
  type?: PortfolioType;

  @ApiPropertyOptional({
    description: "Initial total portfolio value",
    example: 100000,
  })
  @IsOptional()
  @IsNumber()
  totalValue?: number;

  @ApiPropertyOptional({
    description: "Initial asset allocation as ticker-to-percentage map",
    example: { BTC: 60, ETH: 40 },
  })
  @IsOptional()
  @IsObject()
  initialAllocation?: Record<string, number>;

  @ApiPropertyOptional({
    description: "Additional portfolio metadata",
    example: { riskLevel: "moderate", benchmark: "SPY" },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: "Enable automatic rebalancing",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  autoRebalanceEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Rebalancing frequency",
    enum: ["daily", "weekly", "monthly", "quarterly"],
    example: "monthly",
  })
  @IsOptional()
  @IsString()
  rebalanceFrequency?: "daily" | "weekly" | "monthly" | "quarterly";

  @ApiPropertyOptional({
    description: "Rebalancing drift threshold percentage (1-50)",
    minimum: 1,
    maximum: 50,
    default: 5,
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  rebalanceThreshold?: number;
}

export class UpdatePortfolioDto {
  @ApiPropertyOptional({
    description: "Updated portfolio name (3-100 characters, must be unique)",
    example: "Renamed Growth Fund",
    minLength: 3,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @Length(3, 100, {
    message: "Portfolio name must be between 3 and 100 characters",
  })
  name?: string;

  @ApiPropertyOptional({
    description: "Updated portfolio description",
    example: "Updated description for long-term growth",
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: "Updated portfolio status",
    enum: PortfolioStatus,
    example: PortfolioStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(PortfolioStatus)
  status?: PortfolioStatus;

  @ApiPropertyOptional({
    description: "Updated portfolio type",
    enum: PortfolioType,
    example: PortfolioType.CONSERVATIVE,
  })
  @IsOptional()
  @IsEnum(PortfolioType)
  type?: PortfolioType;

  @ApiPropertyOptional({
    description: "Updated target allocation as ticker-to-percentage map",
    example: { BTC: 50, ETH: 30, SOL: 20 },
  })
  @IsOptional()
  @IsObject()
  targetAllocation?: Record<string, number>;

  @ApiPropertyOptional({
    description: "Enable/disable automatic rebalancing",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  autoRebalanceEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Updated rebalancing frequency",
    enum: ["daily", "weekly", "monthly", "quarterly"],
    example: "weekly",
  })
  @IsOptional()
  @IsString()
  rebalanceFrequency?: "daily" | "weekly" | "monthly" | "quarterly";

  @ApiPropertyOptional({
    description: "Updated rebalancing drift threshold (1-50%)",
    minimum: 1,
    maximum: 50,
    example: 8,
  })
  @IsOptional()
  @IsNumber()
  rebalanceThreshold?: number;

  @ApiPropertyOptional({
    description: "Updated portfolio metadata",
    example: { notes: "Adjusted risk tolerance" },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class QueryPortfolioDto {
  @ApiPropertyOptional({
    description: "Filter by portfolio status",
    enum: PortfolioStatus,
  })
  @IsOptional()
  @IsEnum(PortfolioStatus)
  status?: PortfolioStatus;

  @ApiPropertyOptional({
    description: "Filter by portfolio type",
    enum: PortfolioType,
  })
  @IsOptional()
  @IsEnum(PortfolioType)
  type?: PortfolioType;

  @ApiPropertyOptional({
    description: "Case-insensitive name search",
    example: "growth",
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "Page number (1-indexed)",
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: "Items per page (1-100)",
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class PaginatedPortfoliosDto {
  @ApiProperty({ description: "List of portfolios", type: [PortfolioResponseDto] })
  data: PortfolioResponseDto[];

  @ApiProperty({ description: "Total number of portfolios", example: 42 })
  total: number;

  @ApiProperty({ description: "Current page number", example: 1 })
  page: number;

  @ApiProperty({ description: "Items per page", example: 20 })
  limit: number;

  @ApiProperty({ description: "Total number of pages", example: 3 })
  totalPages: number;
}

export class PortfolioResponseDto {
  @ApiProperty({ description: "Portfolio UUID", example: "550e8400-e29b-41d4-a716-446655440000" })
  id: string;

  @ApiProperty({ description: "Portfolio name", example: "My Growth Fund" })
  name: string;

  @ApiPropertyOptional({ description: "Portfolio description" })
  description?: string;

  @ApiProperty({ description: "Portfolio status", enum: PortfolioStatus, example: PortfolioStatus.ACTIVE })
  status: PortfolioStatus;

  @ApiProperty({ description: "Portfolio type", enum: PortfolioType, example: PortfolioType.BALANCED })
  type: PortfolioType;

  @ApiProperty({ description: "Total portfolio value in USD", example: 50000 })
  totalValue: number;

  @ApiProperty({ description: "Current asset allocation percentage map", example: { BTC: 60, ETH: 40 } })
  currentAllocation: Record<string, number>;

  @ApiPropertyOptional({ description: "Target allocation from optimization" })
  targetAllocation?: Record<string, number>;

  @ApiPropertyOptional({ description: "Initial allocation at creation" })
  initialAllocation?: Record<string, number>;

  @ApiProperty({ description: "Auto-rebalance enabled", example: false })
  autoRebalanceEnabled: boolean;

  @ApiPropertyOptional({ description: "Rebalancing frequency", example: "monthly" })
  rebalanceFrequency?: string;

  @ApiProperty({ description: "Rebalancing drift threshold", example: 5 })
  rebalanceThreshold: number;

  @ApiPropertyOptional({ description: "Last rebalancing date" })
  lastRebalanceDate?: Date;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt: Date;

  @ApiProperty({ description: "Last update timestamp" })
  updatedAt: Date;
}
