import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between, Not, IsNull, SelectQueryBuilder } from "typeorm";
import BigNumber from "bignumber.js";
import { Transaction, TransactionType, TransactionStatus } from "../entities/transaction.entity";
import {
  TransactionFilterDto,
  TransactionResponseDto,
  TransactionHistoryResponseDto,
  CostBasisResponseDto,
} from "../dto/transaction.dto";

BigNumber.config({
  DECIMAL_PLACES: 18,
  ROUNDING_MODE: BigNumber.ROUND_HALF_EVEN,
});

interface CostBasisRecord {
  ticker: string;
  quantity: number;
  totalCost: number;
  transactions: Transaction[];
}

@Injectable()
export class TransactionHistoryService {
  private readonly logger = new Logger(TransactionHistoryService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Get transaction history with filtering, pagination, and sorting
   */
  async getTransactionHistory(
    portfolioId: string,
    userId: string,
    filter: TransactionFilterDto,
  ): Promise<TransactionHistoryResponseDto> {
    const {
      type,
      ticker,
      status,
      startDate,
      endDate,
      chain,
      exchange,
      sortBy = "desc",
      page = 1,
      limit = 20,
      includeArchived = false,
    } = filter;

    // Validate pagination
    const validPage = Math.max(1, page || 1);
    const validLimit = Math.min(100, Math.max(1, limit || 20));

    const query = this.transactionRepository.createQueryBuilder("transaction");

    // Base filters
    query.where("transaction.portfolioId = :portfolioId", { portfolioId });
    query.andWhere("transaction.userId = :userId", { userId });

    // Exclude archived transactions by default
    if (!includeArchived) {
      query.andWhere("transaction.archivedAt IS NULL");
    }

    // Apply optional filters
    if (type) {
      query.andWhere("transaction.type = :type", { type });
    }

    if (ticker) {
      query.andWhere("transaction.ticker = :ticker", { ticker });
    }

    if (status) {
      query.andWhere("transaction.status = :status", { status });
    }

    if (chain) {
      query.andWhere("transaction.chain = :chain", { chain });
    }

    if (exchange) {
      query.andWhere("transaction.exchange = :exchange", { exchange });
    }

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        throw new BadRequestException("Start date must be before end date");
      }
      query.andWhere("transaction.createdAt BETWEEN :startDate AND :endDate", {
        startDate: start,
        endDate: end,
      });
    } else if (startDate) {
      query.andWhere("transaction.createdAt >= :startDate", {
        startDate: new Date(startDate),
      });
    } else if (endDate) {
      query.andWhere("transaction.createdAt <= :endDate", {
        endDate: new Date(endDate),
      });
    }

    // Get total count
    const total = await query.getCount();

    // Sort and paginate
    query.orderBy("transaction.transactionDate", sortBy === "asc" ? "ASC" : "DESC");
    query.addOrderBy("transaction.createdAt", sortBy === "asc" ? "ASC" : "DESC");

    const skip = (validPage - 1) * validLimit;
    query.skip(skip).take(validLimit);

    const transactions = await query.getMany();

    const totalPages = Math.ceil(total / validLimit);

    return {
      total,
      page: validPage,
      limit: validLimit,
      totalPages,
      transactions: transactions.map((t) => TransactionResponseDto.fromEntity(t)),
    };
  }

  /**
   * Get single transaction by ID
   */
  async getTransaction(
    transactionId: string,
    portfolioId: string,
    userId: string,
  ): Promise<TransactionResponseDto> {
    const transaction = await this.transactionRepository.findOne({
      where: {
        id: transactionId,
        portfolioId,
        userId,
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    return TransactionResponseDto.fromEntity(transaction);
  }

  /**
   * Calculate cost basis for a specific ticker
   */
  async calculateCostBasis(
    portfolioId: string,
    userId: string,
    ticker: string,
    asOfDate?: Date,
  ): Promise<CostBasisResponseDto> {
    const query = this.transactionRepository.createQueryBuilder("transaction");

    query.where("transaction.portfolioId = :portfolioId", { portfolioId });
    query.andWhere("transaction.userId = :userId", { userId });
    query.andWhere("transaction.ticker = :ticker", { ticker });
    query.andWhere("transaction.archivedAt IS NULL");
    query.andWhere("transaction.status IN (:...statuses)", {
      statuses: [TransactionStatus.COMPLETED],
    });

    if (asOfDate) {
      query.andWhere("transaction.transactionDate <= :asOfDate", { asOfDate });
    }

    query.orderBy("transaction.transactionDate", "ASC");

    const transactions = await query.getMany();

    if (transactions.length === 0) {
      throw new NotFoundException(
        `No transactions found for ticker ${ticker} in portfolio ${portfolioId}`,
      );
    }

    // Calculate cost basis using FIFO method
    let totalQuantity = new BigNumber(0);
    let totalCost = new BigNumber(0);
    let lastTransactionDate = new Date(0);

    for (const tx of transactions) {
      const txQuantity = new BigNumber(tx.quantity);
      const txPrice = new BigNumber(tx.price || 0);
      const txFees = new BigNumber(tx.fees || 0);

      if (tx.type === TransactionType.BUY || tx.type === TransactionType.STAKE) {
        // Add to position
        const costPerUnit = txPrice.plus(txFees.dividedBy(txQuantity.abs()));
        const transactionCost = txQuantity.multipliedBy(costPerUnit);
        totalCost = totalCost.plus(transactionCost);
        totalQuantity = totalQuantity.plus(txQuantity);
      } else if (
        tx.type === TransactionType.SELL ||
        tx.type === TransactionType.UNSTAKE ||
        tx.type === TransactionType.WITHDRAWAL
      ) {
        // Reduce position (negative quantity)
        totalQuantity = totalQuantity.plus(txQuantity); // txQuantity is already negative
      } else if (tx.type === TransactionType.DIVIDEND) {
        // Add dividend as quantity
        totalQuantity = totalQuantity.plus(txQuantity);
      } else if (tx.type === TransactionType.TRANSFER) {
        // Transfer modifies quantity
        totalQuantity = totalQuantity.plus(txQuantity);
      }

      lastTransactionDate = new Date(tx.transactionDate || tx.createdAt);
    }

    const currentValue = new BigNumber(0); // Would need current price to calculate
    const averageCostBasis = totalQuantity.isGreaterThan(0)
      ? totalCost.dividedBy(totalQuantity)
      : new BigNumber(0);

    const unrealizedGainLoss = currentValue.minus(totalCost);
    const unrealizedGainLossPercent = totalCost.isGreaterThan(0)
      ? unrealizedGainLoss.dividedBy(totalCost).multipliedBy(100)
      : new BigNumber(0);

    return {
      ticker,
      totalQuantity: Number(totalQuantity),
      averageCostBasis: Number(averageCostBasis),
      totalCostBasis: Number(totalCost),
      currentMarketValue: Number(currentValue),
      unrealizedGainLoss: Number(unrealizedGainLoss),
      unrealizedGainLossPercent: Number(unrealizedGainLossPercent),
      lastTransactionDate,
    };
  }

  /**
   * Calculate cost basis for all holdings
   */
  async calculateAllCostBasis(
    portfolioId: string,
    userId: string,
  ): Promise<CostBasisResponseDto[]> {
    const tickersResult = await this.transactionRepository
      .createQueryBuilder("transaction")
      .select("DISTINCT transaction.ticker", "ticker")
      .where("transaction.portfolioId = :portfolioId", { portfolioId })
      .andWhere("transaction.userId = :userId", { userId })
      .andWhere("transaction.archivedAt IS NULL")
      .andWhere("transaction.status = :status", { status: TransactionStatus.COMPLETED })
      .getRawMany();

    const tickers = tickersResult.map((r: any) => r.ticker);
    const costBasis: CostBasisResponseDto[] = [];

    for (const ticker of tickers) {
      try {
        const cb = await this.calculateCostBasis(portfolioId, userId, ticker);
        costBasis.push(cb);
      } catch (error) {
        this.logger.warn(
          `Could not calculate cost basis for ${ticker}: ${error.message}`,
        );
      }
    }

    return costBasis;
  }

  /**
   * Export transactions to CSV format
   */
  async exportTransactionsAsCSV(
    portfolioId: string,
    userId: string,
    filter: TransactionFilterDto,
  ): Promise<string> {
    const result = await this.getTransactionHistory(portfolioId, userId, {
      ...filter,
      limit: 10000, // Get all transactions
      page: 1,
    });

    const transactions = result.transactions;

    if (transactions.length === 0) {
      return "No transactions found";
    }

    // CSV header
    const headers = [
      "Transaction ID",
      "Date",
      "Type",
      "Status",
      "Ticker",
      "Asset Name",
      "Quantity",
      "Price",
      "Total Value",
      "Fees",
      "Chain",
      "Gas Fees",
      "Exchange",
      "Transaction Hash",
    ];

    const rows = transactions.map((tx) => [
      tx.id,
      new Date(tx.createdAt).toISOString(),
      tx.type,
      tx.status,
      tx.ticker,
      tx.name,
      tx.quantity,
      tx.price || "",
      tx.totalValue || "",
      tx.fees,
      tx.chain || "",
      tx.gasFees || "",
      tx.exchange || "",
      "", // Transaction hash not included in response DTO
    ]);

    // Convert to CSV format
    const csvContent = [
      headers.map((h) => `"${h}"`).join(","),
      ...rows.map((row) =>
        row
          .map((cell) => {
            const strCell = String(cell || "");
            // Escape quotes and wrap in quotes if contains comma or quote
            if (strCell.includes(",") || strCell.includes('"')) {
              return `"${strCell.replace(/"/g, '""')}"`;
            }
            return `"${strCell}"`;
          })
          .join(","),
      ),
    ].join("\n");

    return csvContent;
  }

  /**
   * Export transactions to JSON format
   */
  async exportTransactionsAsJSON(
    portfolioId: string,
    userId: string,
    filter: TransactionFilterDto,
  ): Promise<object> {
    const result = await this.getTransactionHistory(portfolioId, userId, {
      ...filter,
      limit: 10000,
      page: 1,
    });

    return {
      exportDate: new Date().toISOString(),
      portfolioId,
      totalTransactions: result.total,
      transactions: result.transactions,
    };
  }

  /**
   * Archive transactions (soft delete)
   */
  async archiveTransaction(
    transactionId: string,
    portfolioId: string,
    userId: string,
  ): Promise<void> {
    const transaction = await this.transactionRepository.findOne({
      where: {
        id: transactionId,
        portfolioId,
        userId,
        archivedAt: IsNull(),
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${transactionId} not found or already archived`);
    }

    transaction.archivedAt = new Date();
    await this.transactionRepository.save(transaction);
    this.logger.log(`Transaction ${transactionId} archived`);
  }

  /**
   * Archive all transactions for a date range
   */
  async archiveTransactionsByDateRange(
    portfolioId: string,
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const result = await this.transactionRepository.update(
      {
        portfolioId,
        userId,
        createdAt: Between(startDate, endDate),
        archivedAt: IsNull(),
      },
      {
        archivedAt: new Date(),
      },
    );

    return result.affected || 0;
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStats(
    portfolioId: string,
    userId: string,
  ): Promise<{
    totalTransactions: number;
    byType: Record<TransactionType, number>;
    byStatus: Record<TransactionStatus, number>;
    totalBuys: number;
    totalSells: number;
    netValue: number;
  }> {
    const transactions = await this.transactionRepository.find({
      where: {
        portfolioId,
        userId,
        archivedAt: IsNull(),
      },
    });

    const byType: Record<TransactionType, number> = {} as any;
    const byStatus: Record<TransactionStatus, number> = {} as any;

    let totalBuys = new BigNumber(0);
    let totalSells = new BigNumber(0);

    for (const tx of transactions) {
      byType[tx.type] = (byType[tx.type] || 0) + 1;
      byStatus[tx.status] = (byStatus[tx.status] || 0) + 1;

      const value = new BigNumber(tx.totalValue || 0);
      if (tx.type === TransactionType.BUY || tx.type === TransactionType.DEPOSIT) {
        totalBuys = totalBuys.plus(value);
      } else if (tx.type === TransactionType.SELL || tx.type === TransactionType.WITHDRAWAL) {
        totalSells = totalSells.plus(value);
      }
    }

    return {
      totalTransactions: transactions.length,
      byType,
      byStatus,
      totalBuys: Number(totalBuys),
      totalSells: Number(totalSells),
      netValue: Number(totalBuys.minus(totalSells)),
    };
  }
}
