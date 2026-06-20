import { IsString, IsOptional, IsNumber, Matches, Length, IsEnum } from "class-validator";
import { Chain } from "../entities/portfolio-asset.entity";

export class PortfolioAssetDto {
  @IsString()
  @Length(3, 10)
  @Matches(/^[A-Z0-9]+$/, { message: "ticker must be 3-10 alphanumeric characters" })
  ticker: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(Chain)
  chain?: Chain;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  costBasis?: number;
}

export class AddAssetToPortfolioDto {
  @IsString()
  @Length(3, 10)
  @Matches(/^[A-Z0-9]+$/, { message: "ticker must be 3-10 alphanumeric characters" })
  ticker: string;

  @IsString()
  name: string;

  @IsEnum(Chain)
  chain: Chain;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  costBasis?: number;
}

export class UpdatePortfolioAssetDto {
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  currentPrice?: number;

  @IsOptional()
  @IsNumber()
  costBasis?: number;

  @IsOptional()
  @IsEnum(Chain)
  chain?: Chain;
}

export class PortfolioAssetResponseDto {
  id: string;
  ticker: string;
  name: string;
  type: string;
  quantity: number;
  currentPrice?: number;
  value: number;
  allocationPercentage: number;
  suggestedAllocation?: number;
  expectedReturn?: number;
  volatility?: number;
  beta?: number;
  unrealizedGain?: number;
  updatedAt: Date;
}
