import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
  IsArray,
  Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BacktestStatus } from "../entities/backtest-result.entity";

export class CreateBacktestDto {
  @ApiProperty({
    description: "Backtest name",
    example: "BTC/ETH 60/40 Strategy Test",
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: "Backtest description",
    example: "Testing balanced crypto allocation over 1 year",
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: "Backtest start date (ISO 8601)",
    example: "2025-01-01",
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: "Backtest end date (ISO 8601)",
    example: "2026-01-01",
  })
  @IsDateString()
  endDate: string;

  @ApiProperty({
    description: "Initial capital in USD",
    example: 100000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  initialCapital: number;

  @ApiProperty({
    description: "Strategy name or description",
    example: "equal_weight",
  })
  @IsString()
  strategy: string;

  @ApiProperty({
    description: "Asset weights for backtest",
    example: [
      { ticker: "BTC", weight: 60 },
      { ticker: "ETH", weight: 40 },
    ],
  })
  @IsArray()
  assets: Array<{ ticker: string; weight: number }>;

  @ApiPropertyOptional({
    description: "Benchmark ticker for comparison",
    example: "SPY",
  })
  @IsOptional()
  @IsString()
  benchmarkTicker?: string;

  @ApiPropertyOptional({
    description: "Rebalancing frequency in months",
    example: 3,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  rebalanceFrequency?: number;
}

export class BacktestResultResponseDto {
  @ApiProperty({ description: "Backtest UUID" })
  id: string;

  @ApiProperty({ description: "Backtest name" })
  name: string;

  @ApiPropertyOptional({ description: "Backtest description" })
  description?: string;

  @ApiProperty({ description: "Backtest status", enum: BacktestStatus })
  status: BacktestStatus;

  @ApiProperty({ description: "Backtest start date" })
  startDate: Date;

  @ApiProperty({ description: "Backtest end date" })
  endDate: Date;

  @ApiProperty({ description: "Initial capital in USD" })
  initialCapital: number;

  @ApiPropertyOptional({ description: "Final portfolio value in USD" })
  finalValue?: number;

  @ApiPropertyOptional({ description: "Total return percentage" })
  totalReturn?: number;

  @ApiPropertyOptional({ description: "Annualized return percentage" })
  annualizedReturn?: number;

  @ApiPropertyOptional({ description: "Annualized volatility" })
  volatility?: number;

  @ApiPropertyOptional({ description: "Sharpe ratio" })
  sharpeRatio?: number;

  @ApiPropertyOptional({ description: "Sortino ratio" })
  sortinoRatio?: number;

  @ApiPropertyOptional({ description: "Maximum drawdown percentage" })
  maxDrawdown?: number;

  @ApiPropertyOptional({ description: "Benchmark total return" })
  benchmarkReturn?: number;

  @ApiPropertyOptional({ description: "Alpha vs benchmark" })
  alpha?: number;

  @ApiPropertyOptional({ description: "Beta vs benchmark" })
  beta?: number;

  @ApiPropertyOptional({ description: "Correlation with benchmark" })
  Correlation?: number;

  @ApiPropertyOptional({ description: "Total number of trades" })
  totalTrades?: number;

  @ApiPropertyOptional({ description: "Win rate (0-1)" })
  winRate?: number;

  @ApiPropertyOptional({ description: "Profit factor" })
  profitFactor?: number;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt: Date;

  @ApiPropertyOptional({ description: "Completion timestamp" })
  completedAt?: Date;
}
