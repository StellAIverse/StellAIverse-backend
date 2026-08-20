import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  BadRequestException,
  Query,
  HttpCode,
  HttpStatus,
  Response,
} from "@nestjs/common";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { RateLimit } from "../common/decorators/rate-limit.decorator";
import { Response as ExpressResponse } from "express";
import { JwtAuthGuard } from "src/auth/jwt.guard";
import { PortfolioService } from "./services/portfolio.service";
import { RebalancingService } from "./services/rebalancing.service";
import { PerformanceAnalyticsService } from "./services/performance-analytics.service";
import { BacktestingService } from "./services/backtesting.service";
import { MLPredictionService } from "./services/ml-prediction.service";
import { TradingTransactionService } from "./services/trading-transaction.service";
import { TransactionHistoryService } from "./services/transaction-history.service";
import { PortfolioOwnerGuard } from "src/common/guard/portfolio-owner.guard";
import {
  CreatePortfolioDto,
  UpdatePortfolioDto,
  QueryPortfolioDto,
} from "./dto/portfolio.dto";
import {
  AddAssetToPortfolioDto,
  UpdatePortfolioAssetDto,
} from "./dto/portfolio-asset.dto";
import {
  ApproveOptimizationDto,
  CreateOptimizationDto,
} from "./dto/optimization.dto";
import {
  ExecuteRebalancingDto,
  TriggerRebalancingDto,
  CancelRebalancingDto,
} from "./dto/rebalancing.dto";
import {
  GetPerformanceMetricsDto,
  GetPerformanceByPeriodDto,
  GetBenchmarkComparisonDto,
  RecordSnapshotDto,
  GetVaRDto,
} from "./dto/performance.dto";
import { CreateBacktestDto } from "./dto/backtest.dto";
import {
  CreateTransactionDto,
  TransactionFilterDto,
} from "./dto/transaction.dto";

@Controller("portfolio")
@ApiTags("Portfolio Management")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Throttle({ trading: { ttl: 60_000, limit: 20 } })
@RateLimit({ level: "standard", limit: 20, windowMs: 60_000, burst: 5 })
export class PortfolioController {
  constructor(
    private portfolioService: PortfolioService,
    private rebalancingService: RebalancingService,
    private performanceService: PerformanceAnalyticsService,
    private backtestService: BacktestingService,
    private mlService: MLPredictionService,
    private tradingTransactionService: TradingTransactionService,
    private transactionHistoryService: TransactionHistoryService,
  ) {}

  // ─── Portfolio CRUD ──────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a new portfolio" })
  @ApiBody({ type: CreatePortfolioDto, description: "Portfolio creation payload" })
  @ApiResponse({
    status: 201,
    description: "Portfolio created successfully",
    schema: {
      example: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "My Portfolio",
        description: "Long-term growth portfolio",
        status: "active",
        type: "balanced",
        totalValue: 0,
        currentAllocation: {},
        initialAllocation: { BTC: 60, ETH: 40 },
        autoRebalanceEnabled: false,
        rebalanceThreshold: 5,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  })
  @ApiResponse({ status: 400, description: "Invalid input or validation error" })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 409, description: "Portfolio name already exists" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  async createPortfolio(@Request() req: any, @Body() dto: CreatePortfolioDto) {
    return this.portfolioService.createPortfolio(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "List user portfolios with pagination and filtering" })
  @ApiQuery({ name: "status", required: false, enum: ["active", "inactive", "archived"], description: "Filter by portfolio status" })
  @ApiQuery({ name: "type", required: false, enum: ["balanced", "aggressive", "conservative"], description: "Filter by portfolio type" })
  @ApiQuery({ name: "search", required: false, type: String, description: "Case-insensitive name search" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "Page number (default: 1)" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Items per page (default: 20, max: 100)" })
  @ApiResponse({
    status: 200,
    description: "Paginated list of portfolios",
    schema: {
      example: {
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            name: "My Portfolio",
            status: "active",
            type: "balanced",
            totalValue: 50000,
            currentAllocation: { BTC: 60, ETH: 40 },
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
  })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  async getUserPortfolios(
    @Request() req: any,
    @Query() query: QueryPortfolioDto,
  ) {
    return this.portfolioService.listPortfolios(req.user.id, query);
  }

  // IMPORTANT: "stats" must be defined BEFORE ":id" to avoid
  // NestJS matching GET /portfolio/stats against the :id param.
  @Get("stats")
  @ApiOperation({ summary: "Get aggregate portfolio statistics for the authenticated user" })
  @ApiResponse({
    status: 200,
    description: "Aggregate statistics across all active portfolios",
    schema: {
      example: {
        totalPortfolios: 3,
        activePortfolios: 2,
        totalValue: 150000,
        totalAssets: 12,
        byType: {
          balanced: { count: 2, totalValue: 100000 },
          aggressive: { count: 1, totalValue: 50000 },
        },
        topPortfolios: [
          { id: "...", name: "Growth Fund", totalValue: 80000, type: "aggressive" },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 500, description: "Internal server error" })
  async getPortfolioStats(@Request() req: any) {
    return this.portfolioService.getPortfolioStats(req.user.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get portfolio details by ID" })
  @ApiParam({ name: "id", type: String, description: "Portfolio UUID" })
  @ApiResponse({
    status: 200,
    description: "Portfolio details with assets, optimization history, and performance metrics",
  })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden – not the portfolio owner" })
  @ApiResponse({ status: 404, description: "Portfolio not found" })
  @UseGuards(PortfolioOwnerGuard)
  async getPortfolio(@Param("id") portfolioId: string) {
    return this.portfolioService.getPortfolio(portfolioId);
  }

  @Put(":id")
  @ApiOperation({ summary: "Update portfolio details" })
  @ApiParam({ name: "id", type: String, description: "Portfolio UUID" })
  @ApiBody({ type: UpdatePortfolioDto, description: "Fields to update" })
  @ApiResponse({ status: 200, description: "Portfolio updated successfully" })
  @ApiResponse({ status: 400, description: "Invalid input or validation error" })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden – not the portfolio owner" })
  @ApiResponse({ status: 404, description: "Portfolio not found" })
  @ApiResponse({ status: 409, description: "Portfolio name already exists" })
  @UseGuards(PortfolioOwnerGuard)
  async updatePortfolio(
    @Param("id") portfolioId: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.portfolioService.updatePortfolio(portfolioId, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Archive portfolio (soft delete via status)" })
  @ApiParam({ name: "id", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Portfolio archived successfully" })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden – not the portfolio owner" })
  @ApiResponse({ status: 404, description: "Portfolio not found" })
  @UseGuards(PortfolioOwnerGuard)
  async archivePortfolio(@Param("id") portfolioId: string) {
    return this.portfolioService.archivePortfolio(portfolioId);
  }

  // ─── Portfolio Summary & Stats ───────────────────────────────────

  @Get(":id/summary")
  @ApiOperation({ summary: "Get portfolio summary with key metrics" })
  @ApiParam({ name: "id", type: String, description: "Portfolio UUID" })
  @ApiResponse({
    status: 200,
    description: "Portfolio summary with value, asset count, allocation, and rebalance settings",
    schema: {
      example: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "My Portfolio",
        status: "active",
        type: "balanced",
        totalValue: 50000,
        assetCount: 5,
        currentAllocation: { BTC: 40, ETH: 30, SOL: 20, USDC: 10 },
        autoRebalanceEnabled: true,
        rebalanceFrequency: "monthly",
        rebalanceThreshold: 5,
      },
    },
  })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden – not the portfolio owner" })
  @ApiResponse({ status: 404, description: "Portfolio not found" })
  @UseGuards(PortfolioOwnerGuard)
  async getPortfolioSummary(@Param("id") portfolioId: string) {
    return this.portfolioService.getPortfolioSummary(portfolioId);
  }

  @Get(":id/export")
  @ApiOperation({ summary: "Export full portfolio data as JSON" })
  @ApiParam({ name: "id", type: String, description: "Portfolio UUID" })
  @ApiResponse({
    status: 200,
    description: "Full portfolio export including assets, optimization history, and metrics",
  })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden – not the portfolio owner" })
  @ApiResponse({ status: 404, description: "Portfolio not found" })
  @UseGuards(PortfolioOwnerGuard)
  async exportPortfolio(@Param("id") portfolioId: string) {
    return this.portfolioService.exportPortfolio(portfolioId);
  }

  // ─── Holding (Asset) Management ──────────────────────────────────

  @Post(":portfolioId/assets")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Add holding (asset) to portfolio" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiBody({ type: AddAssetToPortfolioDto, description: "Asset details" })
  @ApiResponse({ status: 201, description: "Asset added successfully" })
  @ApiResponse({ status: 400, description: "Invalid ticker, quantity, or chain" })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden – not the portfolio owner" })
  @ApiResponse({ status: 404, description: "Portfolio not found" })
  @ApiResponse({ status: 409, description: "Asset with same ticker and chain already exists" })
  @UseGuards(PortfolioOwnerGuard)
  async addAsset(
    @Param("portfolioId") portfolioId: string,
    @Body() dto: AddAssetToPortfolioDto,
  ) {
    return this.portfolioService.addAsset(
      portfolioId,
      dto.ticker,
      dto.name,
      dto.quantity,
      dto.currentPrice,
      dto.costBasis,
      dto.chain,
    );
  }

  @Put(":portfolioId/assets/:assetId")
  @ApiOperation({ summary: "Update holding (asset) in portfolio" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiParam({ name: "assetId", type: String, description: "Asset UUID" })
  @ApiBody({ type: UpdatePortfolioAssetDto, description: "Fields to update" })
  @ApiResponse({ status: 200, description: "Asset updated successfully" })
  @ApiResponse({ status: 400, description: "Invalid input or asset not found" })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden – not the portfolio owner" })
  @UseGuards(PortfolioOwnerGuard)
  async updateAsset(
    @Param("portfolioId") portfolioId: string,
    @Param("assetId") assetId: string,
    @Body() dto: UpdatePortfolioAssetDto,
  ) {
    return this.portfolioService.updateAsset(portfolioId, assetId, dto);
  }

  @Delete(":portfolioId/assets/:assetId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove holding (asset) from portfolio" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiParam({ name: "assetId", type: String, description: "Asset UUID" })
  @ApiResponse({ status: 204, description: "Asset removed successfully" })
  @ApiResponse({ status: 400, description: "Asset not found in portfolio" })
  @ApiResponse({ status: 401, description: "Unauthorized – missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden – not the portfolio owner" })
  @UseGuards(PortfolioOwnerGuard)
  async removeAsset(
    @Param("portfolioId") portfolioId: string,
    @Param("assetId") assetId: string,
  ) {
    return this.portfolioService.removeAsset(portfolioId, assetId);
  }

  @Put(":portfolioId/assets/:assetId/price")
  @ApiOperation({ summary: "Update asset price" })
  @ApiParam({ name: "assetId", type: String, description: "Asset UUID" })
  @ApiBody({ schema: { properties: { price: { type: "number", example: 45000 } } }, description: "New price" })
  @ApiResponse({ status: 200, description: "Asset price updated" })
  @ApiResponse({ status: 400, description: "Asset not found" })
  async updateAssetPrice(
    @Param("assetId") assetId: string,
    @Body() body: { price: number },
  ) {
    return this.portfolioService.updateAssetPrice(assetId, body.price);
  }

  // ─── Optimization ────────────────────────────────────────────────

  @Post(":portfolioId/optimize")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Run portfolio optimization" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiBody({ type: CreateOptimizationDto, description: "Optimization parameters" })
  @ApiResponse({ status: 201, description: "Optimization started" })
  @ApiResponse({ status: 400, description: "Portfolio has no assets or invalid parameters" })
  @UseGuards(PortfolioOwnerGuard)
  async runOptimization(
    @Param("portfolioId") portfolioId: string,
    @Body() dto: CreateOptimizationDto,
  ) {
    dto.portfolioId = portfolioId;
    return this.portfolioService.runOptimization(portfolioId, dto);
  }

  @Post("optimizations/:optimizationId/approve")
  @ApiOperation({ summary: "Approve optimization recommendation" })
  @ApiParam({ name: "optimizationId", type: String, description: "Optimization UUID" })
  @ApiResponse({ status: 200, description: "Optimization approved" })
  async approveOptimization(
    @Param("optimizationId") optimizationId: string,
    @Body() dto: ApproveOptimizationDto,
  ) {
    return this.portfolioService.approveOptimization(optimizationId, dto.notes);
  }

  @Post("optimizations/:optimizationId/implement")
  @ApiOperation({ summary: "Implement optimization (apply to portfolio)" })
  @ApiParam({ name: "optimizationId", type: String, description: "Optimization UUID" })
  @ApiResponse({ status: 200, description: "Optimization applied to portfolio" })
  async implementOptimization(@Param("optimizationId") optimizationId: string) {
    return this.portfolioService.implementOptimization(optimizationId);
  }

  @Get(":portfolioId/optimization-history")
  @ApiOperation({ summary: "Get optimization history" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Max results (default: 10)" })
  @ApiResponse({ status: 200, description: "List of optimization records" })
  @UseGuards(PortfolioOwnerGuard)
  async getOptimizationHistory(
    @Param("portfolioId") portfolioId: string,
    @Query("limit") limit: number = 10,
  ) {
    return this.portfolioService.getOptimizationHistory(portfolioId, limit);
  }

  // ─── Rebalancing ─────────────────────────────────────────────────

  @Get(":portfolioId/rebalance-check")
  @ApiOperation({ summary: "Check if portfolio needs rebalancing" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Rebalancing status and allocation drift" })
  @UseGuards(PortfolioOwnerGuard)
  async checkRebalancing(@Param("portfolioId") portfolioId: string) {
    const needsRebalancing =
      await this.rebalancingService.checkRebalancingNeeded(portfolioId);
    const allocationDrift =
      await this.rebalancingService.calculateAllocationDrift(portfolioId);

    return {
      needsRebalancing,
      allocationDrift,
    };
  }

  @Post(":portfolioId/rebalance")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Trigger portfolio rebalancing" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiBody({ type: TriggerRebalancingDto, description: "Rebalancing parameters" })
  @ApiResponse({ status: 201, description: "Rebalancing triggered" })
  @UseGuards(PortfolioOwnerGuard)
  async triggerRebalancing(
    @Param("portfolioId") portfolioId: string,
    @Body() dto: TriggerRebalancingDto,
  ) {
    dto.portfolioId = portfolioId;
    return this.rebalancingService.triggerRebalancing(
      portfolioId,
      dto.trigger,
      dto.triggerReason,
      dto.dryRun,
    );
  }

  @Post("rebalancing/:rebalancingId/approve")
  @ApiOperation({ summary: "Approve rebalancing event" })
  @ApiParam({ name: "rebalancingId", type: String, description: "Rebalancing event UUID" })
  @ApiResponse({ status: 200, description: "Rebalancing approved" })
  async approveRebalancing(@Param("rebalancingId") rebalancingId: string) {
    return this.rebalancingService.approveRebalancing(rebalancingId);
  }

  @Post("rebalancing/:rebalancingId/execute")
  @ApiOperation({ summary: "Execute approved rebalancing" })
  @ApiParam({ name: "rebalancingId", type: String, description: "Rebalancing event UUID" })
  @ApiBody({ type: ExecuteRebalancingDto, description: "Execution details" })
  @ApiResponse({ status: 200, description: "Rebalancing executed" })
  async executeRebalancing(
    @Param("rebalancingId") rebalancingId: string,
    @Body() dto: ExecuteRebalancingDto,
  ) {
    return this.rebalancingService.executeRebalancing(
      rebalancingId,
      dto.actualCost,
      dto.executionSlippage,
      dto.executionNotes,
    );
  }

  @Post("rebalancing/:rebalancingId/cancel")
  @ApiOperation({ summary: "Cancel rebalancing event" })
  @ApiParam({ name: "rebalancingId", type: String, description: "Rebalancing event UUID" })
  @ApiBody({ type: CancelRebalancingDto, description: "Cancellation reason" })
  @ApiResponse({ status: 200, description: "Rebalancing cancelled" })
  async cancelRebalancing(
    @Param("rebalancingId") rebalancingId: string,
    @Body() dto: CancelRebalancingDto,
  ) {
    return this.rebalancingService.cancelRebalancing(rebalancingId, dto.reason);
  }

  @Get(":portfolioId/rebalancing-history")
  @ApiOperation({ summary: "Get rebalancing history" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Max results (default: 10)" })
  @ApiResponse({ status: 200, description: "Rebalancing history" })
  @UseGuards(PortfolioOwnerGuard)
  async getRebalancingHistory(
    @Param("portfolioId") portfolioId: string,
    @Query("limit") limit: number = 10,
  ) {
    return this.rebalancingService.getRebalancingHistory(portfolioId, limit);
  }

  @Get(":portfolioId/allocation-drift")
  @ApiOperation({ summary: "Get current allocation drift from target" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Allocation drift data" })
  @UseGuards(PortfolioOwnerGuard)
  async getAllocationDrift(@Param("portfolioId") portfolioId: string) {
    return this.rebalancingService.calculateAllocationDrift(portfolioId);
  }

  // ─── Performance Analytics ────────────────────────────────────────

  @Get(":portfolioId/performance-summary")
  @ApiOperation({ summary: "Get portfolio performance summary" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Performance summary" })
  @UseGuards(PortfolioOwnerGuard)
  async getPerformanceSummary(@Param("portfolioId") portfolioId: string) {
    return this.performanceService.getPerformanceSummary(portfolioId);
  }

  @Get(":portfolioId/metrics")
  @ApiOperation({ summary: "Get performance metrics for date range" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Performance metrics" })
  @UseGuards(PortfolioOwnerGuard)
  async getMetrics(
    @Param("portfolioId") portfolioId: string,
    @Query() dto: GetPerformanceMetricsDto,
  ) {
    const startDate = dto.startDate
      ? new Date(dto.startDate)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();

    return this.performanceService.getMetricsForDateRange(
      portfolioId,
      startDate,
      endDate,
    );
  }

  @Get(":portfolioId/metrics/attribution")
  @ApiOperation({ summary: "Get attribution analysis" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiQuery({ name: "startDate", required: true, type: String, description: "Start date (ISO 8601)" })
  @ApiQuery({ name: "endDate", required: true, type: String, description: "End date (ISO 8601)" })
  @ApiResponse({ status: 200, description: "Attribution analysis" })
  @UseGuards(PortfolioOwnerGuard)
  async getAttributionAnalysis(
    @Param("portfolioId") portfolioId: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException("startDate and endDate required");
    }

    return this.performanceService.getAttributionAnalysis(
      portfolioId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get(":portfolioId/metrics/period")
  @ApiOperation({
    summary: "Get performance metrics for a predefined period (1D/1W/1M/3M/6M/YTD/1Y/3Y/ALL)",
  })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Period metrics" })
  @UseGuards(PortfolioOwnerGuard)
  async getMetricsByPeriod(
    @Param("portfolioId") portfolioId: string,
    @Query() dto: GetPerformanceByPeriodDto,
  ) {
    return this.performanceService.getMetricsForPeriod(portfolioId, dto.period);
  }

  @Get(":portfolioId/metrics/benchmark")
  @ApiOperation({ summary: "Compare portfolio performance against a benchmark ticker" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Benchmark comparison" })
  @UseGuards(PortfolioOwnerGuard)
  async getBenchmarkComparison(
    @Param("portfolioId") portfolioId: string,
    @Query() dto: GetBenchmarkComparisonDto,
  ) {
    return this.performanceService.getBenchmarkComparison(
      portfolioId,
      dto.benchmarkTicker,
      dto.startDate ? new Date(dto.startDate) : undefined,
      dto.endDate ? new Date(dto.endDate) : undefined,
    );
  }

  @Get(":portfolioId/metrics/var")
  @ApiOperation({ summary: "Get Value at Risk (VaR) at a given confidence level" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Value at Risk" })
  @UseGuards(PortfolioOwnerGuard)
  async getValueAtRisk(
    @Param("portfolioId") portfolioId: string,
    @Query() dto: GetVaRDto,
  ) {
    const confidence = dto.confidence ?? 0.95;
    const var_ = await this.performanceService.calculateVaR(
      portfolioId,
      confidence,
    );
    return { portfolioId, confidence, valueAtRisk: var_ };
  }

  @Get(":portfolioId/metrics/calmar")
  @ApiOperation({ summary: "Get Calmar ratio (annualised return / max drawdown)" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Calmar ratio" })
  @UseGuards(PortfolioOwnerGuard)
  async getCalmarRatio(@Param("portfolioId") portfolioId: string) {
    const calmarRatio =
      await this.performanceService.calculateCalmarRatio(portfolioId);
    return { portfolioId, calmarRatio };
  }

  @Post(":portfolioId/metrics/snapshot")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Record a performance snapshot for the portfolio" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiBody({ type: RecordSnapshotDto, description: "Snapshot data" })
  @ApiResponse({ status: 201, description: "Snapshot recorded" })
  @UseGuards(PortfolioOwnerGuard)
  async recordSnapshot(
    @Param("portfolioId") portfolioId: string,
    @Body() dto: RecordSnapshotDto,
  ) {
    return this.performanceService.recordMetrics(
      portfolioId,
      dto.portfolioValue,
      dto.allocation,
      dto.previousValue,
    );
  }

  @Get(":portfolioId/metrics/roi")
  @ApiOperation({ summary: "Get Return on Investment (ROI) relative to the invested cost basis" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "ROI percentage" })
  @UseGuards(PortfolioOwnerGuard)
  async getROI(@Param("portfolioId") portfolioId: string) {
    const roi = await this.performanceService.calculateROI(portfolioId);
    return { portfolioId, roi };
  }

  @Get(":portfolioId/metrics/drawdown")
  @ApiOperation({ summary: "Get current drawdown relative to the all-time peak portfolio value" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Current drawdown" })
  @UseGuards(PortfolioOwnerGuard)
  async getCurrentDrawdown(@Param("portfolioId") portfolioId: string) {
    const currentDrawdown =
      await this.performanceService.calculateCurrentDrawdown(portfolioId);
    return { portfolioId, currentDrawdown };
  }

  @Get(":portfolioId/metrics/periods")
  @ApiOperation({ summary: "Get standard period returns (YTD, 1Y, 3Y, 5Y) for the portfolio" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Period returns" })
  @UseGuards(PortfolioOwnerGuard)
  async getPeriodReturns(@Param("portfolioId") portfolioId: string) {
    return this.performanceService.calculatePeriodReturns(portfolioId);
  }

  @Get(":portfolioId/metrics/allocation")
  @ApiOperation({ summary: "Get the current allocation breakdown (ticker → percentage)" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Allocation breakdown" })
  @UseGuards(PortfolioOwnerGuard)
  async getAllocationBreakdown(@Param("portfolioId") portfolioId: string) {
    return this.performanceService.getAllocationBreakdown(portfolioId);
  }

  // ─── Backtesting ─────────────────────────────────────────────────

  @Post("backtests")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create and run backtest" })
  @ApiBody({ type: CreateBacktestDto, description: "Backtest parameters" })
  @ApiResponse({ status: 201, description: "Backtest created" })
  async createBacktest(@Request() req: any, @Body() dto: CreateBacktestDto) {
    return this.backtestService.createBacktest(req.user.id, dto);
  }

  @Get("backtests/:backtestId")
  @ApiOperation({ summary: "Get backtest result" })
  @ApiParam({ name: "backtestId", type: String, description: "Backtest UUID" })
  @ApiResponse({ status: 200, description: "Backtest result" })
  async getBacktest(@Param("backtestId") backtestId: string) {
    return this.backtestService.getBacktest(backtestId);
  }

  @Get("backtests")
  @ApiOperation({ summary: "Get backtests for user" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Max results (default: 10)" })
  @ApiResponse({ status: 200, description: "List of backtests" })
  async getUserBacktests(
    @Request() req: any,
    @Query("limit") limit: number = 10,
  ) {
    return this.backtestService.getUserBacktests(req.user.id, limit);
  }

  @Post("backtests/compare")
  @ApiOperation({ summary: "Compare multiple backtests" })
  @ApiBody({ schema: { properties: { backtestIds: { type: "array", items: { type: "string" } } } }, description: "Backtest IDs to compare" })
  @ApiResponse({ status: 200, description: "Backtest comparison" })
  async compareBacktests(@Body() body: { backtestIds: string[] }) {
    return this.backtestService.compareBacktests(body.backtestIds);
  }

  // ─── ML Predictions ──────────────────────────────────────────────

  @Post("predictions/train/:ticker")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Train ML model for asset" })
  @ApiParam({ name: "ticker", type: String, description: "Asset ticker symbol" })
  @ApiBody({ schema: { properties: { historicalPrices: { type: "array", items: { type: "number" } } } }, description: "Historical price data" })
  @ApiResponse({ status: 201, description: "Model trained" })
  async trainPredictor(
    @Param("ticker") ticker: string,
    @Body() body: { historicalPrices: number[] },
  ) {
    return this.mlService.trainAssetPredictor(ticker, body.historicalPrices);
  }

  @Post("predictions/forecast/:ticker")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Get ML price predictions for asset" })
  @ApiParam({ name: "ticker", type: String, description: "Asset ticker symbol" })
  @ApiBody({ schema: { properties: { currentPrice: { type: "number" }, historicalPrices: { type: "array", items: { type: "number" } }, daysAhead: { type: "number" } } }, description: "Prediction parameters" })
  @ApiResponse({ status: 201, description: "Prediction result" })
  async predictAssetReturns(
    @Param("ticker") ticker: string,
    @Body()
    body: {
      currentPrice: number;
      historicalPrices: number[];
      daysAhead?: number;
    },
  ) {
    return this.mlService.predictAssetReturns(
      ticker,
      body.currentPrice,
      body.historicalPrices,
      body.daysAhead || 30,
    );
  }

  @Get("predictions/stats")
  @ApiOperation({ summary: "Get ML predictor statistics" })
  @ApiResponse({ status: 200, description: "Predictor statistics" })
  async getPredictorStats() {
    return this.mlService.getPredictorStats();
  }

  // ─── Transaction Tracking ─────────────────────────────────────────

  @Post(":portfolioId/transactions")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Record a new transaction" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiBody({ type: CreateTransactionDto, description: "Transaction details" })
  @ApiResponse({ status: 201, description: "Transaction recorded" })
  @UseGuards(PortfolioOwnerGuard)
  async recordTransaction(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.tradingTransactionService.recordTransaction(
      portfolioId,
      req.user.id,
      dto,
    );
  }

  @Get(":portfolioId/transactions")
  @ApiOperation({ summary: "Get transaction history with filtering" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Transaction history" })
  @UseGuards(PortfolioOwnerGuard)
  async getTransactionHistory(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Query() filter: TransactionFilterDto,
  ) {
    return this.transactionHistoryService.getTransactionHistory(
      portfolioId,
      req.user.id,
      filter,
    );
  }

  // IMPORTANT: Specific routes MUST come before :transactionId param
  // to avoid NestJS matching "stats", "cost-basis", "export" as a transactionId.

  @Get(":portfolioId/transactions/stats")
  @ApiOperation({ summary: "Get transaction statistics" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Transaction statistics" })
  @UseGuards(PortfolioOwnerGuard)
  async getTransactionStats(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
  ) {
    return this.transactionHistoryService.getTransactionStats(
      portfolioId,
      req.user.id,
    );
  }

  @Get(":portfolioId/transactions/cost-basis/:ticker")
  @ApiOperation({ summary: "Calculate cost basis for a specific ticker" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiParam({ name: "ticker", type: String, description: "Asset ticker symbol" })
  @ApiQuery({ name: "asOfDate", required: false, type: String, description: "As-of date (ISO 8601)" })
  @ApiResponse({ status: 200, description: "Cost basis for ticker" })
  @UseGuards(PortfolioOwnerGuard)
  async getCostBasis(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Param("ticker") ticker: string,
    @Query("asOfDate") asOfDate?: string,
  ) {
    return this.transactionHistoryService.calculateCostBasis(
      portfolioId,
      req.user.id,
      ticker,
      asOfDate ? new Date(asOfDate) : undefined,
    );
  }

  @Get(":portfolioId/transactions/cost-basis")
  @ApiOperation({ summary: "Calculate cost basis for all holdings" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "Cost basis for all holdings" })
  @UseGuards(PortfolioOwnerGuard)
  async getAllCostBasis(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
  ) {
    return this.transactionHistoryService.calculateAllCostBasis(
      portfolioId,
      req.user.id,
    );
  }

  @Get(":portfolioId/transactions/export/csv")
  @ApiOperation({ summary: "Export transactions as CSV" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "CSV file download" })
  @UseGuards(PortfolioOwnerGuard)
  async exportTransactionsCSV(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Query() filter: TransactionFilterDto,
    @Response() res: ExpressResponse,
  ) {
    const csv = await this.transactionHistoryService.exportTransactionsAsCSV(
      portfolioId,
      req.user.id,
      filter,
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="transactions-${portfolioId}-${Date.now()}.csv"`,
    );
    res.send(csv);
  }

  @Get(":portfolioId/transactions/export/json")
  @ApiOperation({ summary: "Export transactions as JSON" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiResponse({ status: 200, description: "JSON export" })
  @UseGuards(PortfolioOwnerGuard)
  async exportTransactionsJSON(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Query() filter: TransactionFilterDto,
  ) {
    return this.transactionHistoryService.exportTransactionsAsJSON(
      portfolioId,
      req.user.id,
      filter,
    );
  }

  // :transactionId param route MUST come AFTER all specific sub-routes
  @Get(":portfolioId/transactions/:transactionId")
  @ApiOperation({ summary: "Get a single transaction" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiParam({ name: "transactionId", type: String, description: "Transaction UUID" })
  @ApiResponse({ status: 200, description: "Transaction details" })
  @UseGuards(PortfolioOwnerGuard)
  async getTransaction(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Param("transactionId") transactionId: string,
  ) {
    return this.transactionHistoryService.getTransaction(
      transactionId,
      portfolioId,
      req.user.id,
    );
  }

  @Post(":portfolioId/transactions/:transactionId/archive")
  @ApiOperation({ summary: "Archive a transaction" })
  @ApiParam({ name: "portfolioId", type: String, description: "Portfolio UUID" })
  @ApiParam({ name: "transactionId", type: String, description: "Transaction UUID" })
  @ApiResponse({ status: 200, description: "Transaction archived" })
  @UseGuards(PortfolioOwnerGuard)
  async archiveTransaction(
    @Request() req: any,
    @Param("portfolioId") portfolioId: string,
    @Param("transactionId") transactionId: string,
  ) {
    await this.transactionHistoryService.archiveTransaction(
      transactionId,
      portfolioId,
      req.user.id,
    );
    return { message: "Transaction archived successfully" };
  }
}
