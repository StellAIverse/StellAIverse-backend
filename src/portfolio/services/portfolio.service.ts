import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import {
  OptimizationFailedException,
  PortfolioNotFoundException,
  DuplicatePortfolioNameException,
} from "../exceptions/portfolio.exceptions";
import { InjectRepository } from "@nestjs/typeorm";
import { ILike, Not, Repository } from "typeorm";
import { Portfolio } from "../entities/portfolio.entity";
import { PortfolioAsset, Chain } from "../entities/portfolio-asset.entity";
import {
  OptimizationHistory,
  OptimizationMethod,
  OptimizationStatus,
} from "../entities/optimization-history.entity";
import { RiskProfile } from "../entities/risk-profile.entity";
import {
  CreatePortfolioDto,
  UpdatePortfolioDto,
  QueryPortfolioDto,
  PaginatedPortfoliosDto,
} from "../dto/portfolio.dto";
import { CreateOptimizationDto } from "../dto/optimization.dto";
import { PortfolioStatus, PortfolioType } from "../entities/portfolio.entity";

// Valid ticker pattern: 3-10 alphanumeric uppercase characters
const TICKER_PATTERN = /^[A-Z0-9]{3,10}$/;

// Supported chains for holdings
const SUPPORTED_CHAINS: string[] = Object.values(Chain);
import { ModernPortfolioTheory } from "../algorithms/modern-portfolio-theory";
import { BlackLittermanModel } from "../algorithms/black-litterman";
import { ConstraintOptimizer } from "../algorithms/constraint-optimizer";

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    @InjectRepository(Portfolio)
    private portfolioRepository: Repository<Portfolio>,
    @InjectRepository(PortfolioAsset)
    private portfolioAssetRepository: Repository<PortfolioAsset>,
    @InjectRepository(OptimizationHistory)
    private optimizationRepository: Repository<OptimizationHistory>,
    @InjectRepository(RiskProfile)
    private riskProfileRepository: Repository<RiskProfile>,
  ) {}

  /**
   * Create a new portfolio for a user.
   *
   * Validates that the portfolio name is unique and applies sensible
   * defaults (status, type and allocation maps) before persisting.
   */
  async createPortfolio(
    userId: string,
    dto: CreatePortfolioDto,
  ): Promise<Portfolio> {
    const trimmedName = dto.name.trim();
    this.logger.log(`Creating portfolio "${trimmedName}" for user ${userId}`);

    await this.assertNameIsUnique(trimmedName);

    const initialAllocation = dto.initialAllocation || {};
    this.validateAllocation(initialAllocation);

    const portfolio = this.portfolioRepository.create({
      ...dto,
      name: trimmedName,
      userId,
      status: PortfolioStatus.ACTIVE,
      type: dto.type || PortfolioType.BALANCED,
      initialAllocation,
      currentAllocation: { ...initialAllocation },
      targetAllocation: {},
    });

    const saved = await this.portfolioRepository.save(portfolio);
    this.logger.log(`Portfolio ${saved.id} created for user ${userId}`);
    return saved;
  }

  /**
   * Get portfolio by ID
   */
  async getPortfolio(portfolioId: string): Promise<Portfolio> {
    const portfolio = await this.portfolioRepository.findOne({
      where: { id: portfolioId },
      relations: ["assets", "optimizationHistory", "performanceMetrics"],
    });

    if (!portfolio) {
      throw new PortfolioNotFoundException(portfolioId);
    }

    return portfolio;
  }

  /**
   * Get all portfolios for user
   */
  async getUserPortfolios(userId: string): Promise<Portfolio[]> {
    return this.portfolioRepository.find({
      where: { userId },
      relations: ["assets", "performanceMetrics"],
      order: { createdAt: "DESC" },
    });
  }

  /**
   * List a user's portfolios with pagination and optional filtering.
   *
   * Supports filtering by status, type and a case-insensitive name search.
   * Soft-deleted portfolios are excluded automatically.
   */
  async listPortfolios(
    userId: string,
    query: QueryPortfolioDto = {},
  ): Promise<PaginatedPortfoliosDto> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;

    const where: Record<string, unknown> = { userId, status: Not(PortfolioStatus.ARCHIVED) };
    if (query.status && query.status !== PortfolioStatus.ARCHIVED) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.search) where.name = ILike(`%${query.search}%`);

    const [data, total] = await this.portfolioRepository.findAndCount({
      where,
      relations: ["assets", "performanceMetrics"],
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: data as unknown as PaginatedPortfoliosDto["data"],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  /**
   * Update portfolio.
   *
   * When the name changes it is re-validated for uniqueness against other
   * portfolios.
   */
  async updatePortfolio(
    portfolioId: string,
    dto: UpdatePortfolioDto,
  ): Promise<Portfolio> {
    const portfolio = await this.getPortfolio(portfolioId);

    if (dto.name && dto.name.trim() !== portfolio.name) {
      await this.assertNameIsUnique(dto.name.trim(), portfolioId);
    }

    Object.assign(portfolio, dto, { name: dto.name?.trim() });

    const saved = await this.portfolioRepository.save(portfolio);
    this.logger.log(`Portfolio ${portfolioId} updated`);
    return saved;
  }

  /**
   * Archive a portfolio (soft delete via status change).
   *
   * The record is retained for historical reporting but flagged as archived.
   */
  async archivePortfolio(portfolioId: string): Promise<Portfolio> {
    const portfolio = await this.getPortfolio(portfolioId);
    portfolio.status = PortfolioStatus.ARCHIVED;
    const saved = await this.portfolioRepository.save(portfolio);
    await this.portfolioRepository.softDelete(portfolioId);
    this.logger.log(`Portfolio ${portfolioId} archived`);
    return saved;
  }

  /**
   * Validate ticker symbol format (3-10 alphanumeric chars).
   */
  private validateTicker(ticker: string): void {
    if (!ticker || !TICKER_PATTERN.test(ticker)) {
      throw new BadRequestException(
        `Invalid ticker symbol "${ticker}": must be 3-10 uppercase alphanumeric characters`,
      );
    }
  }

  /**
   * Validate chain is supported.
   */
  private validateChain(chain: string): void {
    if (!SUPPORTED_CHAINS.includes(chain)) {
      throw new BadRequestException(
        `Unsupported chain "${chain}": must be one of ${SUPPORTED_CHAINS.join(", ")}`,
      );
    }
  }

  /**
   * Validate allocation object contains non-negative numeric values.
   */
  private validateAllocation(
    allocation: Record<string, number>,
  ): void {
    for (const [key, value] of Object.entries(allocation)) {
      if (typeof value !== "number" || value < 0) {
        throw new BadRequestException(
          `Invalid allocation for "${key}": value must be a non-negative number`,
        );
      }
    }
  }

  /**
   * Add holding (asset) to portfolio.
   *
   * Validates ticker symbol, chain, prevents duplicates on same symbol+chain,
   * tracks cost basis, and auto-updates portfolio values.
   */
  async addAsset(
    portfolioId: string,
    ticker: string,
    name: string,
    quantity: number,
    currentPrice: number = 0,
    costBasis: number = 0,
    chain: string = Chain.ETHEREUM,
  ): Promise<PortfolioAsset> {
    this.validateTicker(ticker);
    this.validateChain(chain);

    if (quantity < 0) {
      throw new BadRequestException("Quantity cannot be negative");
    }

    const portfolio = await this.getPortfolio(portfolioId);

    // Check if holding already exists for same symbol + chain (duplicate prevention)
    const existing = await this.portfolioAssetRepository.findOne({
      where: { portfolioId, ticker, chain: chain as Chain },
    });

    if (existing) {
      throw new ConflictException(
        `Holding ${ticker} on chain ${chain} already exists in portfolio ${portfolioId}`,
      );
    }

    const asset = this.portfolioAssetRepository.create({
      portfolioId,
      ticker,
      name,
      chain: chain as Chain,
      quantity,
      currentPrice,
      value: quantity * currentPrice,
      allocationPercentage: 0,
      costBasis,
      costBasisPerShare: quantity > 0 ? costBasis / quantity : currentPrice,
      unrealizedGain: 0,
    });

    const saved = await this.portfolioAssetRepository.save(asset);

    // Update portfolio allocation and value
    await this.updatePortfolioAllocation(portfolioId);

    this.logger.log(
      `Holding added: ${ticker} (chain=${chain}) qty=${quantity} to portfolio ${portfolioId}`,
    );

    return saved;
  }

  /**
   * Update an existing holding (asset).
   *
   * Supports updating quantity (with cost basis rebalancing),
   * current price, and cost basis for tax calculations.
   */
  async updateAsset(
    portfolioId: string,
    assetId: string,
    updates: {
      quantity?: number;
      currentPrice?: number;
      costBasis?: number;
      chain?: string;
    },
  ): Promise<PortfolioAsset> {
    const asset = await this.portfolioAssetRepository.findOne({
      where: { id: assetId, portfolioId },
    });

    if (!asset) {
      throw new BadRequestException(
        `Asset ${assetId} not found in portfolio ${portfolioId}`,
      );
    }

    // Validate chain if being updated
    if (updates.chain) {
      this.validateChain(updates.chain);

      // Check for duplicate if chain is changing
      if (updates.chain !== asset.chain) {
        const duplicate = await this.portfolioAssetRepository.findOne({
          where: {
            portfolioId,
            ticker: asset.ticker,
            chain: updates.chain as Chain,
          },
        });
        if (duplicate) {
          throw new ConflictException(
            `Holding ${asset.ticker} on chain ${updates.chain} already exists`,
          );
        }
      }
      asset.chain = updates.chain as Chain;
    }

    if (updates.quantity !== undefined) {
      if (updates.quantity < 0) {
        throw new BadRequestException("Quantity cannot be negative");
      }

      // Cost basis rebalancing for tax calculations
      // When adding to position, new cost basis = weighted average
      if (updates.quantity > asset.quantity && updates.costBasis !== undefined) {
        const addedQty = updates.quantity - asset.quantity;
        const oldTotalCost = asset.quantity * (asset.costBasisPerShare || 0);
        const newTotalCost = addedQty * (updates.costBasis / addedQty);
        const totalQty = updates.quantity;
        asset.costBasisPerShare =
          totalQty > 0 ? (oldTotalCost + newTotalCost) / totalQty : 0;
        asset.costBasis = oldTotalCost + newTotalCost;
      }

      asset.quantity = updates.quantity;
    }

    if (updates.currentPrice !== undefined) {
      asset.currentPrice = updates.currentPrice;
      asset.lastPriceUpdate = new Date();
    }

    if (updates.costBasis !== undefined && updates.quantity === undefined) {
      asset.costBasis = updates.costBasis;
      asset.costBasisPerShare =
        asset.quantity > 0 ? updates.costBasis / asset.quantity : 0;
    }

    // Recalculate value and unrealized gain/loss for tax tracking
    asset.value = asset.quantity * (asset.currentPrice || 0);
    asset.unrealizedGain =
      asset.value - (asset.costBasis || asset.quantity * (asset.currentPrice || 0));

    const saved = await this.portfolioAssetRepository.save(asset);

    // Update portfolio allocation
    await this.updatePortfolioAllocation(portfolioId);

    this.logger.log(
      `Holding updated: ${asset.ticker} (chain=${asset.chain}) in portfolio ${portfolioId}`,
    );

    return saved;
  }

  /**
   * Remove a holding (asset) from a portfolio.
   *
   * Recalculates portfolio value and allocation after removal.
   */
  async removeAsset(
    portfolioId: string,
    assetId: string,
  ): Promise<void> {
    const asset = await this.portfolioAssetRepository.findOne({
      where: { id: assetId, portfolioId },
    });

    if (!asset) {
      throw new BadRequestException(
        `Asset ${assetId} not found in portfolio ${portfolioId}`,
      );
    }

    await this.portfolioAssetRepository.remove(asset);

    // Recalculate allocation
    await this.updatePortfolioAllocation(portfolioId);

    this.logger.log(
      `Holding removed: ${asset.ticker} (chain=${asset.chain}) from portfolio ${portfolioId}`,
    );
  }

  /**
   * Update asset price and calculate allocation
   * Also tracks unrealized gain/loss for tax purposes.
   */
  async updateAssetPrice(
    assetId: string,
    currentPrice: number,
  ): Promise<PortfolioAsset> {
    const asset = await this.portfolioAssetRepository.findOne({
      where: { id: assetId },
    });

    if (!asset) {
      throw new BadRequestException("Asset not found");
    }

    asset.currentPrice = currentPrice;
    asset.value = asset.quantity * currentPrice;
    asset.lastPriceUpdate = new Date();

    // Track unrealized gain/loss for tax calculations
    const totalCostBasis = asset.costBasis ?? asset.quantity * currentPrice;
    asset.unrealizedGain = asset.value - totalCostBasis;

    const updated = await this.portfolioAssetRepository.save(asset);

    // Recalculate allocation
    await this.updatePortfolioAllocation(asset.portfolioId);

    return updated;
  }

  /**
   * Update portfolio allocation percentages
   */
  async updatePortfolioAllocation(portfolioId: string): Promise<void> {
    const portfolio = await this.getPortfolio(portfolioId);
    const assets = await this.portfolioAssetRepository.find({
      where: { portfolioId },
    });

    let totalValue = 0;
    for (const asset of assets) {
      totalValue += asset.value || 0;
    }

    portfolio.totalValue = totalValue;

    const allocation: Record<string, number> = {};

    for (const asset of assets) {
      const percentage = totalValue > 0 ? (asset.value / totalValue) * 100 : 0;
      asset.allocationPercentage = percentage;
      allocation[asset.ticker] = percentage;
    }

    portfolio.currentAllocation = allocation;

    await this.portfolioRepository.save(portfolio);
    await this.portfolioAssetRepository.save(assets);
  }

  /**
   * Run portfolio optimization
   */
  async runOptimization(
    portfolioId: string,
    dto: CreateOptimizationDto,
  ): Promise<OptimizationHistory> {
    const portfolio = await this.getPortfolio(portfolioId);
    const assets = await this.portfolioAssetRepository.find({
      where: { portfolioId },
    });

    if (assets.length === 0) {
      throw new BadRequestException("Portfolio has no assets to optimize");
    }

    // Create optimization history record
    const optimization = this.optimizationRepository.create({
      portfolioId,
      method: dto.method,
      status: OptimizationStatus.IN_PROGRESS,
      parameters: dto.parameters || {},
      suggestedAllocation: {},
      currentAllocation: portfolio.currentAllocation,
    });

    let result = await this.optimizationRepository.save(optimization);

    try {
      // Prepare data
      const expectedReturns = assets.map((a) => a.expectedReturn || 0.07);
      const volatilities = assets.map((a) => a.volatility || 0.15);

      // Simple correlation matrix (could be enhanced with historical data)
      const correlationMatrix = this.generateCorrelationMatrix(assets.length);

      const covarianceMatrix = ModernPortfolioTheory.calculateCovarianceMatrix(
        volatilities,
        correlationMatrix,
      );

      let suggestedWeights: number[] = [];

      // Run optimization based on method
      switch (dto.method) {
        case OptimizationMethod.MEAN_VARIANCE:
          suggestedWeights = ModernPortfolioTheory.meanVarianceOptimization(
            expectedReturns,
            covarianceMatrix,
          );
          break;

        case OptimizationMethod.MIN_VARIANCE:
          suggestedWeights =
            ModernPortfolioTheory.minVarianceOptimization(covarianceMatrix);
          break;

        case OptimizationMethod.RISK_PARITY:
          suggestedWeights =
            ModernPortfolioTheory.riskParityOptimization(covarianceMatrix);
          break;

        case OptimizationMethod.MAX_SHARPE:
          suggestedWeights = ModernPortfolioTheory.meanVarianceOptimization(
            expectedReturns,
            covarianceMatrix,
            {},
            0.02,
          );
          break;

        default:
          suggestedWeights = new Array(assets.length).fill(1 / assets.length);
      }

      // Build allocation
      const suggestedAllocation: Record<string, number> = {};
      for (let i = 0; i < assets.length; i++) {
        suggestedAllocation[assets[i].ticker] = suggestedWeights[i] * 100;
        assets[i].suggestedAllocation = suggestedWeights[i] * 100;
      }

      // Calculate metrics
      const metrics = ModernPortfolioTheory.calculatePortfolioMetrics(
        suggestedWeights,
        expectedReturns,
        covarianceMatrix,
      );

      // Calculate improvement score
      const currentReturn = 0;
      const currentVolatility = 0;

      const currentWeights = assets.map(
        (a) => (a.allocationPercentage || 0) / 100,
      );

      const currentMetrics = ModernPortfolioTheory.calculatePortfolioMetrics(
        currentWeights,
        expectedReturns,
        covarianceMatrix,
      );

      const improvementScore =
        currentMetrics.volatility > 0
          ? ((currentMetrics.volatility - metrics.volatility) /
              currentMetrics.volatility) *
            100
          : 0;

      // Update optimization result
      result.status = OptimizationStatus.COMPLETED;
      result.suggestedAllocation = suggestedAllocation;
      result.expectedReturn = metrics.expectedReturn;
      result.expectedVolatility = metrics.volatility;
      result.expectedSharpeRatio = metrics.sharpeRatio;
      result.improvementScore = improvementScore;
      result.completedAt = new Date();

      result = await this.optimizationRepository.save(result);

      // Save suggested allocation to assets
      await this.portfolioAssetRepository.save(assets);

      this.logger.log(`Optimization completed for portfolio ${portfolioId}`);

      return result;
    } catch (error) {
      this.logger.error(`Optimization failed: ${error.message}`);
      result.status = OptimizationStatus.FAILED;
      result.errorMessage = error.message;
      await this.optimizationRepository.save(result);
      throw new OptimizationFailedException(error.message);
    }
  }

  /**
   * Generate simple correlation matrix
   */
  private generateCorrelationMatrix(size: number): number[][] {
    const matrix: number[][] = [];

    for (let i = 0; i < size; i++) {
      matrix[i] = [];
      for (let j = 0; j < size; j++) {
        if (i === j) {
          matrix[i][j] = 1;
        } else {
          // Simplified correlation
          matrix[i][j] = 0.5 + Math.random() * 0.2;
        }
      }
    }

    return matrix;
  }

  /**
   * Approve optimization
   */
  async approveOptimization(
    optimizationId: string,
    notes?: string,
  ): Promise<OptimizationHistory> {
    const optimization = await this.optimizationRepository.findOne({
      where: { id: optimizationId },
    });

    if (!optimization) {
      throw new BadRequestException("Optimization not found");
    }

    optimization.status = OptimizationStatus.APPROVED;
    if (notes) optimization.notes = notes;

    return this.optimizationRepository.save(optimization);
  }

  /**
   * Implement optimization (apply to portfolio)
   */
  async implementOptimization(optimizationId: string): Promise<Portfolio> {
    const optimization = await this.optimizationRepository.findOne({
      where: { id: optimizationId },
    });

    if (!optimization) {
      throw new BadRequestException("Optimization not found");
    }

    const portfolio = await this.getPortfolio(optimization.portfolioId);

    // Apply suggested allocation
    portfolio.targetAllocation = optimization.suggestedAllocation;
    portfolio.lastRebalanceDate = new Date();

    optimization.status = OptimizationStatus.IMPLEMENTED;
    optimization.implementedAt = new Date();

    await this.optimizationRepository.save(optimization);

    return this.portfolioRepository.save(portfolio);
  }

  /**
   * Get optimization history
   */
  async getOptimizationHistory(
    portfolioId: string,
    limit: number = 10,
  ): Promise<OptimizationHistory[]> {
    return this.optimizationRepository.find({
      where: { portfolioId },
      order: { createdAt: "DESC" },
      take: limit,
    });
  }

  /**
   * Soft-delete a portfolio.
   *
   * Uses TypeORM soft removal so the row is retained (with a `deletedAt`
   * timestamp) and excluded from subsequent queries.
   */
  async deletePortfolio(portfolioId: string): Promise<void> {
    // Ensure it exists (and is not already removed) before deleting.
    await this.getPortfolio(portfolioId);
    await this.portfolioRepository.softDelete(portfolioId);
    this.logger.log(`Portfolio ${portfolioId} soft-deleted`);
  }

  /**
   * Ensure no other portfolio already uses the given name.
   *
   * @param name        The candidate portfolio name.
   * @param excludeId   Optional portfolio id to exclude (used on update).
   */
  private async assertNameIsUnique(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.portfolioRepository.findOne({
      where: excludeId ? { name, id: Not(excludeId) } : { name },
    });

    if (existing) {
      this.logger.warn(`Duplicate portfolio name rejected: "${name}"`);
      throw new DuplicatePortfolioNameException(name);
    }
  }
}
