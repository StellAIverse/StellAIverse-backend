import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";

// Entities
import { Portfolio } from "./entities/portfolio.entity";
import { PortfolioAsset } from "./entities/portfolio-asset.entity";
import { RiskProfile } from "./entities/risk-profile.entity";
import { OptimizationHistory } from "./entities/optimization-history.entity";
import { RebalancingEvent } from "./entities/rebalancing-event.entity";
import { PerformanceMetric } from "./entities/performance-metric.entity";
import { BacktestResult } from "./entities/backtest-result.entity";
import { Transaction } from "./entities/transaction.entity";

// Services
import { PortfolioService } from "./services/portfolio.service";
import { RebalancingService } from "./services/rebalancing.service";
import { PerformanceAnalyticsService } from "./services/performance-analytics.service";
import { BacktestingService } from "./services/backtesting.service";
import { MLPredictionService } from "./services/ml-prediction.service";
import { TradingTransactionService } from "./services/trading-transaction.service";
import { TransactionHistoryService } from "./services/transaction-history.service";

// Controllers
import { PortfolioController } from "./portfolio.controller";

// Guards
import { PortfolioOwnerGuard } from "../common/guard/portfolio-owner.guard";

/**
 * Portfolio Management Module
 *
 * Provides REST API endpoints for portfolio CRUD operations, asset management,
 * optimization, rebalancing, performance analytics, backtesting, and ML predictions.
 *
 * ## Endpoints
 * - `POST   /portfolio`            – Create portfolio
 * - `GET    /portfolio`            – List user portfolios (paginated)
 * - `GET    /portfolio/:id`        – Get portfolio details
 * - `PUT    /portfolio/:id`        – Update portfolio
 * - `DELETE /portfolio/:id`        – Archive portfolio (soft delete)
 * - `GET    /portfolio/:id/summary` – Portfolio summary with key metrics
 * - `GET    /portfolio/stats`      – Aggregate statistics across portfolios
 * - `GET    /portfolio/:id/export` – Full portfolio data export (JSON)
 * - `POST   /portfolio/:id/assets` – Add holding
 * - `PUT    /portfolio/:id/assets/:assetId` – Update holding
 * - `DELETE /portfolio/:id/assets/:assetId` – Remove holding
 * - `POST   /portfolio/:id/optimize` – Run optimization
 * - `GET    /portfolio/:id/rebalance-check` – Check rebalancing needs
 * - `POST   /portfolio/:id/rebalance` – Trigger rebalancing
 * - `GET    /portfolio/:id/performance-summary` – Performance overview
 * - `GET    /portfolio/:id/metrics` – Performance metrics
 * - `POST   /portfolio/backtests` – Create backtest
 * - `POST   /portfolio/predictions/:ticker/train` – Train ML model
 *
 * ## Rate Limiting
 * All endpoints are rate-limited to 20 requests/minute per user (trading tier).
 *
 * ## Authentication
 * All endpoints require JWT authentication via `JwtAuthGuard`.
 * Portfolio-specific endpoints also require `PortfolioOwnerGuard`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Portfolio,
      PortfolioAsset,
      RiskProfile,
      OptimizationHistory,
      RebalancingEvent,
      PerformanceMetric,
      BacktestResult,
      Transaction,
    ]),
    BullModule.registerQueue(
      {
        name: "portfolio-optimization",
      },
      {
        name: "rebalancing",
      },
      {
        name: "performance-analytics",
      },
      {
        name: "backtesting",
      },
      {
        name: "ml-predictions",
      },
    ),
  ],
  providers: [
    PortfolioService,
    RebalancingService,
    PerformanceAnalyticsService,
    BacktestingService,
    MLPredictionService,
    TradingTransactionService,
    TransactionHistoryService,
    PortfolioOwnerGuard,
  ],
  controllers: [PortfolioController],
  exports: [
    PortfolioService,
    RebalancingService,
    PerformanceAnalyticsService,
    BacktestingService,
    MLPredictionService,
    TradingTransactionService,
    TransactionHistoryService,
    TypeOrmModule.forFeature([Portfolio, PortfolioAsset]),
  ],
})
export class PortfolioModule {}
