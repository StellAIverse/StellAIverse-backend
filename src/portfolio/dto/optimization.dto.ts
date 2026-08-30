import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsJSON,
  IsDateString,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  OptimizationMethod,
  OptimizationStatus,
} from "../entities/optimization-history.entity";

export class CreateOptimizationDto {
  @ApiProperty({
    description: "Portfolio optimization method",
    enum: OptimizationMethod,
    example: OptimizationMethod.MEAN_VARIANCE,
  })
  @IsEnum(OptimizationMethod)
  method: OptimizationMethod;

  @ApiProperty({
    description: "Portfolio UUID to optimize",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsString()
  portfolioId: string;

  @ApiPropertyOptional({
    description: "Custom optimization parameters",
    example: { riskFreeRate: 0.02, maxIterations: 1000 },
  })
  @IsOptional()
  @IsJSON()
  parameters?: Record<string, any>;

  @ApiPropertyOptional({
    description: "Risk profile UUID to apply",
    example: "660e8400-e29b-41d4-a716-446655440001",
  })
  @IsOptional()
  @IsString()
  riskProfileId?: string;

  @ApiPropertyOptional({
    description: "Target annual return (0-1)",
    example: 0.12,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  targetReturn?: number;

  @ApiPropertyOptional({
    description: "Maximum allowable volatility",
    example: 0.2,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  maxVolatility?: number;

  @ApiPropertyOptional({
    description: "Asset-level allocation constraints",
    example: [{ asset: "BTC", min: 0.1, max: 0.4 }],
  })
  @IsOptional()
  @IsArray()
  constraints?: Array<{ asset: string; min: number; max: number }>;
}

export class ApproveOptimizationDto {
  @ApiProperty({
    description: "Optimization UUID to approve",
    example: "770e8400-e29b-41d4-a716-446655440002",
  })
  @IsString()
  optimizationId: string;

  @ApiPropertyOptional({
    description: "Approval notes",
    example: "Looks good, implementing allocation changes",
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectOptimizationDto {
  @ApiProperty({
    description: "Optimization UUID to reject",
  })
  @IsString()
  optimizationId: string;

  @ApiProperty({
    description: "Rejection reason",
    example: "Too aggressive for current market conditions",
  })
  @IsString()
  rejectionReason: string;
}

export class ImplementOptimizationDto {
  @ApiProperty({
    description: "Optimization UUID to implement",
  })
  @IsString()
  optimizationId: string;

  @ApiPropertyOptional({
    description: "Execution notes",
  })
  @IsOptional()
  @IsString()
  executionNotes?: string;
}

export class OptimizationHistoryResponseDto {
  @ApiProperty({ description: "Optimization UUID" })
  id: string;

  @ApiProperty({ description: "Optimization method", enum: OptimizationMethod })
  method: OptimizationMethod;

  @ApiProperty({ description: "Optimization status", enum: OptimizationStatus })
  status: OptimizationStatus;

  @ApiProperty({ description: "Suggested allocation map" })
  suggestedAllocation: Record<string, number>;

  @ApiPropertyOptional({ description: "Expected annual return" })
  expectedReturn?: number;

  @ApiPropertyOptional({ description: "Expected volatility" })
  expectedVolatility?: number;

  @ApiPropertyOptional({ description: "Expected Sharpe ratio" })
  expectedSharpeRatio?: number;

  @ApiPropertyOptional({ description: "Value at Risk (95%)" })
  valueAtRisk?: number;

  @ApiPropertyOptional({ description: "Maximum drawdown" })
  maxDrawdown?: number;

  @ApiPropertyOptional({ description: "Improvement score vs current allocation (%)" })
  improvementScore?: number;

  @ApiPropertyOptional({ description: "Backtested performance metrics" })
  backtestedMetrics?: Record<string, number>;

  @ApiProperty({ description: "Creation timestamp" })
  createdAt: Date;

  @ApiPropertyOptional({ description: "Completion timestamp" })
  completedAt?: Date;

  @ApiPropertyOptional({ description: "Implementation timestamp" })
  implementedAt?: Date;
}
