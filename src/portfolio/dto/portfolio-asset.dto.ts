import {
  IsString,
  IsOptional,
  IsNumber,
  Matches,
  Length,
  IsEnum,
  Min,
  Max,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Chain } from "../entities/portfolio-asset.entity";

export class PortfolioAssetDto {
  @ApiProperty({
    description: "Asset ticker symbol (3-10 uppercase alphanumeric characters)",
    example: "BTC",
    minLength: 3,
    maxLength: 10,
  })
  @IsString()
  @Length(3, 10)
  @Matches(/^[A-Z0-9]+$/, {
    message: "ticker must be 3-10 alphanumeric characters",
  })
  ticker: string;

  @ApiProperty({
    description: "Asset name",
    example: "Bitcoin",
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: "Blockchain chain",
    enum: Chain,
    default: Chain.ETHEREUM,
  })
  @IsOptional()
  @IsEnum(Chain)
  chain?: Chain;

  @ApiPropertyOptional({
    description: "Quantity held",
    example: 1.5,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({
    description: "Current price per unit in USD",
    example: 45000,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @ApiPropertyOptional({
    description: "Total cost basis in USD",
    example: 44000,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  costBasis?: number;
}

export class AddAssetToPortfolioDto {
  @ApiProperty({
    description: "Asset ticker symbol (3-10 uppercase alphanumeric characters)",
    example: "ETH",
    minLength: 3,
    maxLength: 10,
  })
  @IsString()
  @Length(3, 10)
  @Matches(/^[A-Z0-9]+$/, {
    message: "ticker must be 3-10 alphanumeric characters",
  })
  ticker: string;

  @ApiProperty({
    description: "Asset name",
    example: "Ethereum",
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: "Blockchain chain",
    enum: Chain,
    example: Chain.ETHEREUM,
  })
  @IsEnum(Chain)
  chain: Chain;

  @ApiProperty({
    description: "Quantity to add (must be non-negative)",
    example: 10,
    minimum: 0,
  })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({
    description: "Current price per unit in USD",
    example: 3000,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @ApiPropertyOptional({
    description: "Cost basis in USD",
    example: 2900,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  costBasis?: number;
}

export class UpdatePortfolioAssetDto {
  @ApiPropertyOptional({
    description: "Updated quantity (must be non-negative)",
    example: 15,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({
    description: "Updated current price per unit",
    example: 3200,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @ApiPropertyOptional({
    description: "Updated cost basis",
    example: 3000,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  costBasis?: number;

  @ApiPropertyOptional({
    description: "Update blockchain chain",
    enum: Chain,
    example: Chain.POLYGON,
  })
  @IsOptional()
  @IsEnum(Chain)
  chain?: Chain;
}

export class PortfolioAssetResponseDto {
  @ApiProperty({ description: "Asset UUID" })
  id: string;

  @ApiProperty({ description: "Asset ticker", example: "BTC" })
  ticker: string;

  @ApiProperty({ description: "Asset name", example: "Bitcoin" })
  name: string;

  @ApiProperty({ description: "Asset type" })
  type: string;

  @ApiProperty({ description: "Quantity held", example: 1.5 })
  quantity: number;

  @ApiPropertyOptional({ description: "Current price per unit" })
  currentPrice?: number;

  @ApiProperty({ description: "Total value in USD", example: 67500 })
  value: number;

  @ApiProperty({ description: "Portfolio allocation percentage", example: 30.5 })
  allocationPercentage: number;

  @ApiPropertyOptional({ description: "Optimization-suggested allocation" })
  suggestedAllocation?: number;

  @ApiPropertyOptional({ description: "Expected annual return" })
  expectedReturn?: number;

  @ApiPropertyOptional({ description: "Annual volatility" })
  volatility?: number;

  @ApiPropertyOptional({ description: "Market beta" })
  beta?: number;

  @ApiPropertyOptional({ description: "Unrealized gain/loss in USD" })
  unrealizedGain?: number;

  @ApiProperty({ description: "Last update timestamp" })
  updatedAt: Date;
}
