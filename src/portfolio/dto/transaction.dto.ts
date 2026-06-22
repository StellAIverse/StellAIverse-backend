import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsUUID,
  IsDateString,
  Min,
  IsObject,
} from "class-validator";
import { Transaction, TransactionType, TransactionStatus } from "../entities/transaction.entity";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateTransactionDto {
  @ApiProperty({ enum: TransactionType, description: "Type of transaction" })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({ description: "Asset ticker symbol" })
  @IsString()
  ticker: string;

  @ApiProperty({ description: "Asset name" })
  @IsString()
  name: string;

  @ApiProperty({ description: "Quantity transacted (positive or negative)" })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ description: "Price per unit at time of transaction" })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @ApiPropertyOptional({ description: "Transaction fees" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fees?: number;

  @ApiPropertyOptional({ description: "Blockchain chain name" })
  @IsOptional()
  @IsString()
  chain?: string;

  @ApiPropertyOptional({ description: "Gas fees for blockchain transactions" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gasFees?: number;

  @ApiPropertyOptional({ description: "Transaction hash or reference ID" })
  @IsOptional()
  @IsString()
  transactionHash?: string;

  @ApiPropertyOptional({ description: "Wallet address" })
  @IsOptional()
  @IsString()
  walletAddress?: string;

  @ApiPropertyOptional({ description: "Exchange or market" })
  @IsOptional()
  @IsString()
  exchange?: string;

  @ApiPropertyOptional({ description: "Additional notes" })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: "Cost basis per unit" })
  @IsOptional()
  @IsNumber()
  costBasisPerUnit?: number;

  @ApiPropertyOptional({ description: "Actual transaction date/time" })
  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @ApiPropertyOptional({ description: "Idempotency key for preventing duplicates" })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: "Additional metadata" })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ description: "Total transaction value (if not calculated automatically)" })
  @IsOptional()
  @IsNumber()
  totalValue?: number;
}

export class UpdateTransactionDto {
  @ApiPropertyOptional({ description: "Additional notes" })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: "Transaction status" })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({ description: "Additional metadata" })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class TransactionFilterDto {
  @ApiPropertyOptional({ enum: TransactionType, description: "Filter by transaction type" })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ description: "Filter by ticker symbol" })
  @IsOptional()
  @IsString()
  ticker?: string;

  @ApiPropertyOptional({ enum: TransactionStatus, description: "Filter by transaction status" })
  @IsOptional()
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;

  @ApiPropertyOptional({ description: "Filter by start date (ISO format)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: "Filter by end date (ISO format)" })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: "Filter by blockchain chain" })
  @IsOptional()
  @IsString()
  chain?: string;

  @ApiPropertyOptional({ description: "Filter by exchange" })
  @IsOptional()
  @IsString()
  exchange?: string;

  @ApiPropertyOptional({ description: "Sort order: asc or desc" })
  @IsOptional()
  @IsString()
  sortBy?: "asc" | "desc";

  @ApiPropertyOptional({ description: "Page number (1-indexed)" })
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: "Items per page" })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: "Include archived transactions" })
  @IsOptional()
  includeArchived?: boolean;
}

export class TransactionResponseDto {
  @ApiProperty({ description: "Transaction ID" })
  id: string;

  @ApiProperty({ description: "Portfolio ID" })
  portfolioId: string;

  @ApiProperty({ enum: TransactionType })
  type: TransactionType;

  @ApiProperty({ enum: TransactionStatus })
  status: TransactionStatus;

  @ApiProperty()
  ticker: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  quantity: number;

  @ApiPropertyOptional()
  price?: number;

  @ApiPropertyOptional()
  totalValue?: number;

  @ApiProperty()
  fees: number;

  @ApiPropertyOptional()
  chain?: string;

  @ApiPropertyOptional()
  gasFees?: number;

  @ApiPropertyOptional()
  exchange?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  transactionDate?: Date;

  static fromEntity(transaction: Transaction): TransactionResponseDto {
    return {
      id: transaction.id,
      portfolioId: transaction.portfolioId,
      type: transaction.type,
      status: transaction.status,
      ticker: transaction.ticker,
      name: transaction.name,
      quantity: transaction.quantity,
      price: transaction.price,
      totalValue: transaction.totalValue,
      fees: transaction.fees,
      chain: transaction.chain,
      gasFees: transaction.gasFees,
      exchange: transaction.exchange,
      createdAt: transaction.createdAt,
      transactionDate: transaction.transactionDate,
    };
  }
}

export class TransactionHistoryResponseDto {
  @ApiProperty({ description: "Total number of transactions" })
  total: number;

  @ApiProperty({ description: "Current page number" })
  page: number;

  @ApiProperty({ description: "Items per page" })
  limit: number;

  @ApiProperty({ description: "Total pages" })
  totalPages: number;

  @ApiProperty({ type: [TransactionResponseDto], description: "Transactions in current page" })
  transactions: TransactionResponseDto[];
}

export class CostBasisResponseDto {
  @ApiProperty({ description: "Ticker symbol" })
  ticker: string;

  @ApiProperty({ description: "Total quantity held" })
  totalQuantity: number;

  @ApiProperty({ description: "Weighted average cost basis per unit" })
  averageCostBasis: number;

  @ApiProperty({ description: "Total cost basis" })
  totalCostBasis: number;

  @ApiProperty({ description: "Current market value" })
  currentMarketValue: number;

  @ApiProperty({ description: "Unrealized gain/loss" })
  unrealizedGainLoss: number;

  @ApiProperty({ description: "Unrealized gain/loss percentage" })
  unrealizedGainLossPercent: number;

  @ApiProperty({ description: "Date of last transaction" })
  lastTransactionDate: Date;
}

export class TransactionExportDto {
  @ApiProperty({ description: "Type of export format" })
  format: "csv" | "json";

  @ApiPropertyOptional({ description: "Start date for export" })
  startDate?: string;

  @ApiPropertyOptional({ description: "End date for export" })
  endDate?: string;

  @ApiPropertyOptional({ enum: TransactionType, description: "Filter by transaction type" })
  type?: TransactionType;

  @ApiPropertyOptional({ description: "Include cost basis calculations" })
  includeCostBasis?: boolean;
}