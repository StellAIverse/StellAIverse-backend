import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  IsJSON,
  IsDateString,
  IsBoolean,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  RebalanceTrigger,
  RebalanceStatus,
} from "../entities/rebalancing-event.entity";

export class TriggerRebalancingDto {
  @ApiProperty({
    description: "Portfolio UUID to rebalance",
    example: "550e8400-e29b-41d4-a716-446655440000",
  })
  @IsString()
  portfolioId: string;

  @ApiProperty({
    description: "Rebalancing trigger type",
    enum: RebalanceTrigger,
    example: RebalanceTrigger.MANUAL,
  })
  @IsEnum(RebalanceTrigger)
  trigger: RebalanceTrigger;

  @ApiPropertyOptional({
    description: "Reason for rebalancing",
    example: "Quarterly rebalance scheduled",
  })
  @IsOptional()
  @IsString()
  triggerReason?: string;

  @ApiPropertyOptional({
    description: "Run as dry run without executing trades",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({
    description: "Custom target allocation override",
    example: { BTC: 50, ETH: 30, SOL: 20 },
  })
  @IsOptional()
  @IsJSON()
  customAllocation?: Record<string, number>;
}

export class ApproveRebalancingDto {
  @ApiProperty({
    description: "Rebalancing event UUID to approve",
  })
  @IsString()
  rebalancingEventId: string;

  @ApiPropertyOptional({
    description: "Approval notes",
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ExecuteRebalancingDto {
  @ApiProperty({
    description: "Rebalancing event UUID to execute",
  })
  @IsString()
  rebalancingEventId: string;

  @ApiPropertyOptional({
    description: "Execution notes",
    example: "Executed during market hours, low slippage",
  })
  @IsOptional()
  @IsString()
  executionNotes?: string;

  @ApiPropertyOptional({
    description: "Actual transaction cost in USD",
    example: 12.50,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  actualCost?: number;

  @ApiPropertyOptional({
    description: "Execution slippage percentage",
    example: 0.05,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  executionSlippage?: number;
}

export class CancelRebalancingDto {
  @ApiProperty({
    description: "Rebalancing event UUID to cancel",
  })
  @IsString()
  rebalancingEventId: string;

  @ApiProperty({
    description: "Cancellation reason",
    example: "Market conditions changed, postponing rebalance",
  })
  @IsString()
  reason: string;
}

export class RebalancingEventResponseDto {
  @ApiPropertyOptional({ description: "Rebalancing event UUID" })
  id?: string;

  @ApiPropertyOptional({ description: "Trigger type", enum: RebalanceTrigger })
  trigger?: RebalanceTrigger;

  @ApiPropertyOptional({ description: "Event status", enum: RebalanceStatus })
  status?: RebalanceStatus;

  @ApiPropertyOptional({ description: "Trigger reason" })
  triggerReason?: string;

  @ApiProperty({ description: "Allocation before rebalancing" })
  allocationBefore: Record<string, number>;

  @ApiProperty({ description: "Target allocation after rebalancing" })
  allocationAfter: Record<string, number>;

  @ApiProperty({ description: "Required trades" })
  trades: Array<any>;

  @ApiPropertyOptional({ description: "Estimated transaction cost in USD" })
  estimatedCost?: number;

  @ApiPropertyOptional({ description: "Actual transaction cost in USD" })
  actualCost?: number;

  @ApiPropertyOptional({ description: "Tax impact in USD" })
  taxImpact?: number;

  @ApiPropertyOptional({ description: "Maximum allocation drift from target (%)" })
  maxAllocationDrift?: number;

  @ApiPropertyOptional({ description: "Average allocation drift from target (%)" })
  avgAllocationDrift?: number;

  @ApiPropertyOptional({ description: "Expected return improvement" })
  expectedReturnImprovement?: number;

  @ApiPropertyOptional({ description: "Volatility change" })
  volatilityChange?: number;

  @ApiPropertyOptional({ description: "Event creation timestamp" })
  createdAt?: Date;

  @ApiPropertyOptional({ description: "Execution timestamp" })
  executedAt?: Date;

  @ApiPropertyOptional({ description: "Completion timestamp" })
  completedAt?: Date;

  @ApiPropertyOptional({ description: "Allocation drift per ticker" })
  allocationDrift?: Record<string, number>;
}
