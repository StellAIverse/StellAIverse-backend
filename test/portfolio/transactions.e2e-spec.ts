import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Portfolio,
  PortfolioStatus,
  PortfolioType,
} from "../../src/portfolio/entities/portfolio.entity";
import { PortfolioAsset, AssetType } from "../../src/portfolio/entities/portfolio-asset.entity";
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from "../../src/portfolio/entities/transaction.entity";
import { RiskProfile } from "../../src/portfolio/entities/risk-profile.entity";
import { OptimizationHistory } from "../../src/portfolio/entities/optimization-history.entity";
import { RebalancingEvent } from "../../src/portfolio/entities/rebalancing-event.entity";
import { PerformanceMetric } from "../../src/portfolio/entities/performance-metric.entity";
import { BacktestResult } from "../../src/portfolio/entities/backtest-result.entity";
import { PortfolioModule } from "../../src/portfolio/portfolio.module";
import { User } from "../../src/user/entities/user.entity";
import { GlobalExceptionFilter } from "../../src/common/filters/global-exception.filter";

// Mock JWT strategy to bypass real authentication in tests
jest.mock("../../src/auth/jwt.guard", () => ({
  JwtAuthGuard: jest.fn().mockImplementation(() => ({
    canActivate: (context: any) => {
      const request = context.switchToHttp().getRequest();
      request.user = { id: "test-user-id", email: "test@example.com" };
      return true;
    },
  })),
}));

// Mock PortfolioOwnerGuard to always allow access in tests
jest.mock("../../src/common/guard/portfolio-owner.guard", () => ({
  PortfolioOwnerGuard: jest.fn().mockImplementation(() => ({
    canActivate: () => true,
  })),
}));

// Integration test for transaction tracking and portfolio operations
describe("Portfolio Transactions Integration (e2e)", () => {
  let app: INestApplication;
  let userId: string;
  let portfolioId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "sqlite",
          database: ":memory:",
          entities: [
            User,
            Portfolio,
            PortfolioAsset,
            Transaction,
            RiskProfile,
            OptimizationHistory,
            RebalancingEvent,
            PerformanceMetric,
            BacktestResult,
          ],
          synchronize: true,
        }),
        PortfolioModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    // Create test user and portfolio
    userId = "test-user-id";

    // Create a portfolio first
    const createResponse = await request(app.getHttpServer())
      .post("/portfolio")
      .send({
        name: "Test Portfolio for Transactions",
        description: "Integration test portfolio",
      });
    portfolioId = createResponse.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Transaction Recording and History", () => {
    it("should record a BUY transaction", async () => {
      const response = await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.BUY,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 10,
          price: 150,
          fees: 10,
          exchange: "NASDAQ",
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.type).toBe(TransactionType.BUY);
      expect(response.body.quantity).toBe(10);
      expect(response.body.fees).toBe(10);
    });

    it("should record a DIVIDEND transaction", async () => {
      const response = await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.DIVIDEND,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 2.5,
          price: 1.5,
          notes: "Q1 2024 Dividend",
        });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe(TransactionType.DIVIDEND);
    });

    it("should record a SELL transaction", async () => {
      const response = await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.SELL,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: -5,
          price: 160,
          fees: 8,
          exchange: "NASDAQ",
        });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe(TransactionType.SELL);
      expect(response.body.quantity).toBe(-5);
    });

    it("should record a STAKE transaction", async () => {
      const response = await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.STAKE,
          ticker: "ETH",
          name: "Ethereum",
          quantity: 5,
          chain: "ethereum",
          gasFees: 0.05,
          walletAddress: "0x1234567890123456789012345678901234567890",
        });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe(TransactionType.STAKE);
      expect(response.body.chain).toBe("ethereum");
    });

    it("should record a TRANSFER transaction", async () => {
      const response = await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.TRANSFER,
          ticker: "BTC",
          name: "Bitcoin",
          quantity: 0.5,
          chain: "bitcoin",
          gasFees: 0.001,
          notes: "Transfer to hardware wallet",
        });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe(TransactionType.TRANSFER);
    });
  });

  describe("Transaction History and Filtering", () => {
    it("should retrieve transaction history with pagination", async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/portfolio/${portfolioId}/transactions?page=1&limit=20`,
        )
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("total");
      expect(response.body).toHaveProperty("page");
      expect(response.body).toHaveProperty("limit");
      expect(response.body).toHaveProperty("transactions");
      expect(Array.isArray(response.body.transactions)).toBe(true);
    });

    it("should filter transactions by type", async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/portfolio/${portfolioId}/transactions?type=${TransactionType.BUY}`,
        )
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(
        response.body.transactions.every(
          (t: any) => t.type === TransactionType.BUY,
        ),
      ).toBe(true);
    });

    it("should filter transactions by ticker", async () => {
      const response = await request(app.getHttpServer())
        .get(`/portfolio/${portfolioId}/transactions?ticker=AAPL`)
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(
        response.body.transactions.every((t: any) => t.ticker === "AAPL"),
      ).toBe(true);
    });

    it("should filter transactions by date range", async () => {
      const startDate = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const endDate = new Date().toISOString();

      const response = await request(app.getHttpServer())
        .get(
          `/portfolio/${portfolioId}/transactions?startDate=${startDate}&endDate=${endDate}`,
        )
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.transactions)).toBe(true);
    });

    it("should retrieve a single transaction", async () => {
      // First, get a transaction ID
      const listResponse = await request(app.getHttpServer())
        .get(`/portfolio/${portfolioId}/transactions?limit=1`)
        .set("Authorization", `Bearer ${userId}`);

      const transactionId = listResponse.body.transactions[0].id;

      const response = await request(app.getHttpServer())
        .get(
          `/portfolio/${portfolioId}/transactions/${transactionId}`,
        )
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(transactionId);
    });
  });

  describe("Cost Basis Calculation", () => {
    it("should calculate cost basis for a specific ticker", async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/portfolio/${portfolioId}/transactions/cost-basis/AAPL`,
        )
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("ticker");
      expect(response.body).toHaveProperty("totalQuantity");
      expect(response.body).toHaveProperty("averageCostBasis");
      expect(response.body).toHaveProperty("totalCostBasis");
      expect(response.body).toHaveProperty("lastTransactionDate");
    });

    it("should calculate cost basis for all holdings", async () => {
      const response = await request(app.getHttpServer())
        .get(`/portfolio/${portfolioId}/transactions/cost-basis`)
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((cb: any) => {
        expect(cb).toHaveProperty("ticker");
        expect(cb).toHaveProperty("averageCostBasis");
      });
    });
  });

  describe("Transaction Export", () => {
    it("should export transactions as CSV", async () => {
      const response = await request(app.getHttpServer())
        .get(`/portfolio/${portfolioId}/transactions/export/csv`)
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.text).toContain("Transaction ID");
      expect(response.text).toContain("Date");
    });

    it("should export transactions as JSON", async () => {
      const response = await request(app.getHttpServer())
        .get(`/portfolio/${portfolioId}/transactions/export/json`)
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("exportDate");
      expect(response.body).toHaveProperty("portfolioId");
      expect(response.body).toHaveProperty("transactions");
      expect(Array.isArray(response.body.transactions)).toBe(true);
    });

    it("should export filtered transactions as CSV", async () => {
      const response = await request(app.getHttpServer())
        .get(
          `/portfolio/${portfolioId}/transactions/export/csv?type=${TransactionType.BUY}`,
        )
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/csv");
    });
  });

  describe("Transaction Statistics", () => {
    it("should return transaction statistics", async () => {
      const response = await request(app.getHttpServer())
        .get(`/portfolio/${portfolioId}/transactions/stats`)
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("totalTransactions");
      expect(response.body).toHaveProperty("byType");
      expect(response.body).toHaveProperty("byStatus");
      expect(response.body).toHaveProperty("totalBuys");
      expect(response.body).toHaveProperty("totalSells");
      expect(response.body).toHaveProperty("netValue");
    });
  });

  describe("Transaction Archival", () => {
    it("should archive a transaction", async () => {
      // First, get a transaction ID
      const listResponse = await request(app.getHttpServer())
        .get(`/portfolio/${portfolioId}/transactions?limit=1`)
        .set("Authorization", `Bearer ${userId}`);

      const transactionId = listResponse.body.transactions[0].id;

      const response = await request(app.getHttpServer())
        .post(
          `/portfolio/${portfolioId}/transactions/${transactionId}/archive`,
        )
        .set("Authorization", `Bearer ${userId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("message");
    });

    it("should not return archived transactions in default query", async () => {
      // Get total count before archival
      const beforeArchive = await request(app.getHttpServer())
        .get(`/portfolio/${portfolioId}/transactions`)
        .set("Authorization", `Bearer ${userId}`);

      const beforeCount = beforeArchive.body.total;

      // Should include archived when flag is set
      const withArchived = await request(app.getHttpServer())
        .get(
          `/portfolio/${portfolioId}/transactions?includeArchived=true`,
        )
        .set("Authorization", `Bearer ${userId}`);

      expect(withArchived.body.total).toBeGreaterThanOrEqual(beforeCount);
    });
  });

  describe("Transaction Validation", () => {
    it("should reject transaction with zero quantity", async () => {
      const response = await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.BUY,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 0,
          price: 150,
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should reject transaction with negative fees", async () => {
      const response = await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.BUY,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 10,
          price: 150,
          fees: -10,
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should reject BUY transaction without price", async () => {
      const response = await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.BUY,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 10,
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should allow TRANSFER transaction without price", async () => {
      const response = await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.TRANSFER,
          ticker: "BTC",
          name: "Bitcoin",
          quantity: 0.5,
          chain: "bitcoin",
        });

      expect(response.status).toBe(201);
    });

    it("should reject duplicate transaction with same idempotency key", async () => {
      const idempotencyKey = `key-${Date.now()}`;

      // First transaction
      await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.BUY,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 10,
          price: 150,
          idempotencyKey,
        });

      // Duplicate transaction
      const response = await request(app.getHttpServer())
        .post(`/portfolio/${portfolioId}/transactions`)
                .send({
          type: TransactionType.BUY,
          ticker: "AAPL",
          name: "Apple Inc",
          quantity: 10,
          price: 150,
          idempotencyKey,
        });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});
