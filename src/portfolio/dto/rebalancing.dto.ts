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
import {
  RebalanceTrigger,
  RebalanceStatus,
} from "../entities/rebalancing-event.entity";

export class TriggerRebalancingDto {
  @IsString()
  portfolioId: string;

  @IsEnum(RebalanceTrigger)
  trigger: RebalanceTrigger;

  @IsOptional()
  @IsString()
  triggerReason?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsJSON()
  customAllocation?: Record<string, number>;
}

export class ApproveRebalancingDto {
  @IsString()
  rebalancingEventId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ExecuteRebalancingDto {
  @IsString()
  rebalancingEventId: string;

  @IsOptional()
  @IsString()
  executionNotes?: string;

  @IsOptional()
  @IsNumber()
  actualCost?: number;

  @IsOptional()
  @IsNumber()
  executionSlippage?: number;
}

export class CancelRebalancingDto {
  @IsString()
  rebalancingEventId: string;

  @IsString()
  reason: string;
}

export class RebalancingEventResponseDto {
  id?: string;
  trigger?: RebalanceTrigger;
  status?: RebalanceStatus;
  triggerReason?: string;
  allocationBefore: Record<string, number>;
  allocationAfter: Record<string, number>;
  trades: Array<any>;
  estimatedCost?: number;
  actualCost?: number;
  taxImpact?: number;
  maxAllocationDrift?: number;
  avgAllocationDrift?: number;
  expectedReturnImprovement?: number;
  volatilityChange?: number;
  createdAt?: Date;
  executedAt?: Date;
  completedAt?: Date;
  allocationDrift?: Record<string, number>;
}
