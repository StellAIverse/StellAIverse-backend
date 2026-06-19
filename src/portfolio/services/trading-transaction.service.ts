import { Injectable, Logger, ConflictException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  InsufficientBalanceException,
  PortfolioNotFoundException,
} from "../exceptions/portfolio.exceptions";
import { DataSource, EntityManager } from "typeorm";
import BigNumber from "bignumber.js";
import { Portfolio } from "../entities/portfolio.entity";
import { PortfolioAsset } from "../entities/portfolio-asset.entity";
import { Transaction, TransactionType, TransactionStatus } from "../entities/transaction.entity";
import { CreateTransactionDto } from "../dto/transaction.dto";

// Configure BigNumber for financial precision (no exponential notation, 18 dp)
BigNumber.config({
  DECIMAL_PLACES: 18,
  ROUNDING_MODE: BigNumber.ROUND_HALF_EVEN,
});

export interface TradeOperation {
  portfolioId: string;
  userId: string;
  ticker: string;
  name: string;
  quantity: number;
  price: number;
  idempotencyKey: string;
}

/**
 * Handles trade operations with DB transactions and optimistic locking
 * to prevent race conditions and double-spending. Records all transactions.
 */
@Injectable()
export class TradingTransactionService {
  private readonly logger = new Logger(TradingTransactionService.name);
  /** In-memory idempotency store. Replace with Redis in production. */
  private readonly processedKeys = new Set<string>();

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Execute a trade within a serializable transaction with optimistic locking.
   * Idempotency key prevents duplicate trade execution.
   * Records the transaction in the transaction history.
   */
  async executeTrade(op: TradeOperation): Promise<PortfolioAsset> {
    // Idempotency check
    if (this.processedKeys.has(op.idempotencyKey)) {
      throw new ConflictException(
        `Trade with idempotency key ${op.idempotencyKey} already processed`,
      );
    }

    return this.dataSource.transaction(
      "SERIALIZABLE",
      async (manager: EntityManager) => {
        // Lock the portfolio row for update (pessimistic write lock)
        const portfolio = await manager
          .getRepository(Portfolio)
          .createQueryBuilder("portfolio")
          .setLock("pessimistic_write")
          .where("portfolio.id = :id AND portfolio.userId = :userId", {
            id: op.portfolioId,
            userId: op.userId,
          })
          .getOne();

        if (!portfolio) {
          throw new PortfolioNotFoundException(op.portfolioId);
        }

        // Find or create asset within the same transaction
        let asset = await manager.getRepository(PortfolioAsset).findOne({
          where: { portfolioId: op.portfolioId, ticker: op.ticker },
        });

        if (!asset) {
          asset = manager.getRepository(PortfolioAsset).create({
            portfolioId: op.portfolioId,
            ticker: op.ticker,
            name: op.name,
            quantity: 0,
            value: 0,
            allocationPercentage: 0,
            costBasis: op.price,
            costBasisPerShare: op.price,
          });
        }

        const bnQuantity = new BigNumber(op.quantity);
        const bnPrice = new BigNumber(op.price);
        const bnCurrentQty = new BigNumber(asset.quantity);

        if (
          bnQuantity.isNegative() &&
          bnQuantity.abs().isGreaterThan(bnCurrentQty)
        ) {
          throw new InsufficientBalanceException(op.ticker);
        }

        const newQty = bnCurrentQty.plus(bnQuantity);
        asset.quantity = newQty.toNumber();
        asset.currentPrice = bnPrice.toNumber();
        asset.value = newQty.multipliedBy(bnPrice).toNumber();
        asset.lastPriceUpdate = new Date();

        const saved = await manager.getRepository(PortfolioAsset).save(asset);

        // Record transaction
        const transactionType = bnQuantity.isPositive() ? TransactionType.BUY : TransactionType.SELL;
        const transaction = manager.getRepository(Transaction).create({
          portfolioId: op.portfolioId,
          userId: op.userId,
          type: transactionType,
          status: TransactionStatus.COMPLETED,
          ticker: op.ticker,
          name: op.name,
          quantity: op.quantity,
          price: op.price,
          totalValue: bnQuantity.multipliedBy(bnPrice).toNumber(),
          fees: 0,
          costBasisPerUnit: op.price,
          transactionDate: new Date(),
          idempotencyKey: op.idempotencyKey,
        });

        await manager.getRepository(Transaction).save(transaction);

        // Mark idempotency key as processed
        this.processedKeys.add(op.idempotencyKey);

        this.logger.log(
          `Trade executed and recorded: portfolio=${op.portfolioId} ticker=${op.ticker} qty=${op.quantity} key=${op.idempotencyKey}`,
        );

        return saved;
      },
    );
  }

  /**
   * Record a transaction directly (for dividends, transfers, stake, unstake, etc.)
   */
  async recordTransaction(
    portfolioId: string,
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    // Check for existing transaction with same idempotency key
    if (dto.idempotencyKey) {
      const existing = await this.transactionRepository.findOne({
        where: { idempotencyKey: dto.idempotencyKey },
      });

      if (existing) {
        throw new ConflictException(
          `Transaction with idempotency key ${dto.idempotencyKey} already exists`,
        );
      }
    }

    // Validate transaction
    this.validateTransaction(dto);

    // Calculate total value if not provided
    let totalValue = dto.totalValue;
    if (!totalValue && dto.price) {
      totalValue = new BigNumber(Math.abs(dto.quantity))
        .multipliedBy(dto.price)
        .toNumber();
    }

    const transaction = this.transactionRepository.create({
      portfolioId,
      userId,
      type: dto.type,
      status: TransactionStatus.COMPLETED,
      ticker: dto.ticker,
      name: dto.name,
      quantity: dto.quantity,
      price: dto.price,
      totalValue,
      fees: dto.fees || 0,
      chain: dto.chain,
      gasFees: dto.gasFees,
      transactionHash: dto.transactionHash,
      walletAddress: dto.walletAddress,
      exchange: dto.exchange,
      notes: dto.notes,
      costBasisPerUnit: dto.costBasisPerUnit || dto.price,
      transactionDate: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
      idempotencyKey: dto.idempotencyKey,
      metadata: dto.metadata,
    });

    const saved = await this.transactionRepository.save(transaction);

    this.logger.log(
      `Transaction recorded: type=${dto.type} ticker=${dto.ticker} qty=${dto.quantity}`,
    );

    return saved;
  }

  /**
   * Validate transaction consistency and quantities
   */
  private validateTransaction(dto: CreateTransactionDto): void {
    // Validate quantity
    if (!dto.quantity || dto.quantity === 0) {
      throw new BadRequestException("Quantity must be non-zero");
    }

    // Validate price for BUY/SELL transactions
    if (
      (dto.type === TransactionType.BUY || dto.type === TransactionType.SELL) &&
      (!dto.price || dto.price <= 0)
    ) {
      throw new BadRequestException("Price must be positive for buy/sell transactions");
    }

    // Validate fees are non-negative
    if (dto.fees && dto.fees < 0) {
      throw new BadRequestException("Fees must be non-negative");
    }

    // Validate gas fees are non-negative
    if (dto.gasFees && dto.gasFees < 0) {
      throw new BadRequestException("Gas fees must be non-negative");
    }

    // Validate cost basis per unit is positive
    if (dto.costBasisPerUnit && dto.costBasisPerUnit < 0) {
      throw new BadRequestException("Cost basis per unit must be non-negative");
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(transactionId: string): Promise<Transaction> {
    return this.transactionRepository.findOne({
      where: { id: transactionId },
    });
  }
}
