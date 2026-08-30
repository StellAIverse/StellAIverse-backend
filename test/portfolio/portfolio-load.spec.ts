import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PortfolioModule } from "../../src/portfolio/portfolio.module";
import {
  Portfolio,
  PortfolioStatus,
  PortfolioType,
} from "../../src/portfolio/entities/portfolio.entity";
import { PortfolioAsset } from "../../src/portfolio/entities/portfolio-asset.entity";
import { RiskProfile } from "../../src/portfolio/entities/risk-profile.entity";
import { OptimizationHistory } from "../../src/portfolio/entities/optimization-history.entity";
import { RebalancingEvent } from "../../src/portfolio/entities/rebalancing-event.entity";
import { PerformanceMetric } from "../../src/portfolio/entities/performance-metric.entity";
import { BacktestResult } from "../../src/portfolio/entities/backtest-result.entity";
import { Transaction } from "../../src/portfolio/entities/transaction.entity";
import { User } from "../../src/user/entities/user.entity";
import { GlobalExceptionFilter } from "../../src/common/filters/global-exception.filter";

// Mock JWT strategy
jest.mock("../../src/auth/jwt.guard", () => ({
  JwtAuthGuard: jest.fn().mockImplementation(() => ({
    canActivate: (context: any) => {
      const request = context.switchToHttp().getRequest();
      request.user = { id: "test-user-id", email: "test@example.com" };
      return true;
    },
  })),
}));

// Mock PortfolioOwnerGuard
jest.mock("../../src/common/guard/portfolio-owner.guard", () => ({
  PortfolioOwnerGuard: jest.fn().mockImplementation(() => ({
    canActivate: () => true,
  })),
}));

describe("Portfolio Load Tests (e2e)", () => {
  let app: INestApplication;
  let portfolioIds: string[] = [];

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
            RiskProfile,
            OptimizationHistory,
            RebalancingEvent,
            PerformanceMetric,
            BacktestResult,
            Transaction,
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

    // Pre-create portfolios for load testing
    for (let i = 0; i < 5; i++) {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: `Load Test Portfolio ${i}`,
          description: `Portfolio for load testing ${i}`,
          type: i % 2 === 0 ? "balanced" : "aggressive",
          initialAllocation: { BTC: 50, ETH: 50 },
        });
      portfolioIds.push(response.body.id);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /portfolio/:id – Sequential Read Load", () => {
    it("should handle 100 sequential reads under 2 seconds", async () => {
      const portfolioId = portfolioIds[0];
      const startTime = Date.now();
      const count = 100;
      const statuses: number[] = [];

      for (let i = 0; i < count; i++) {
        const res = await request(app.getHttpServer()).get(
          `/portfolio/${portfolioId}`,
        );
        statuses.push(res.status);
      }

      const elapsed = Date.now() - startTime;

      expect(statuses.every((s) => s === 200)).toBe(true);
      expect(elapsed).toBeLessThan(2000);

      const rps = (count / elapsed) * 1000;
      expect(rps).toBeGreaterThanOrEqual(100);
    }, 10000);
  });

  describe("GET /portfolio – Concurrent List Load", () => {
    it("should handle 50 concurrent list requests under 3 seconds", async () => {
      const startTime = Date.now();
      const count = 50;
      const promises: Promise<request.Response>[] = [];

      for (let i = 0; i < count; i++) {
        promises.push(
          request(app.getHttpServer())
            .get("/portfolio")
            .query({ page: 1, limit: 10 }),
        );
      }

      const responses = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBe(count);
      expect(elapsed).toBeLessThan(3000);
    }, 10000);
  });

  describe("POST /portfolio – Concurrent Create Load", () => {
    it("should handle 20 concurrent creates under 5 seconds", async () => {
      const startTime = Date.now();
      const count = 20;
      const promises: Promise<request.Response>[] = [];

      for (let i = 0; i < count; i++) {
        promises.push(
          request(app.getHttpServer())
            .post("/portfolio")
            .send({
              name: `Concurrent Create ${Date.now()}-${i}`,
              description: `Load test ${i}`,
            }),
        );
      }

      const responses = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      const successCount = responses.filter((r) => r.status === 201).length;
      expect(successCount).toBe(count);
      expect(elapsed).toBeLessThan(5000);
    }, 10000);
  });

  describe("GET /portfolio/stats – Stats Load", () => {
    it("should handle 50 concurrent stats requests under 3 seconds", async () => {
      const startTime = Date.now();
      const count = 50;
      const promises: Promise<request.Response>[] = [];

      for (let i = 0; i < count; i++) {
        promises.push(
          request(app.getHttpServer()).get("/portfolio/stats"),
        );
      }

      const responses = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBe(count);
      expect(elapsed).toBeLessThan(3000);
    }, 10000);
  });

  describe("Mixed Workload – Read/Write Mix", () => {
    it("should handle mixed read/write workload under 5 seconds", async () => {
      const startTime = Date.now();
      const promises: Promise<request.Response>[] = [];

      // 30 reads
      for (let i = 0; i < 30; i++) {
        const idx = i % portfolioIds.length;
        promises.push(
          request(app.getHttpServer()).get(`/portfolio/${portfolioIds[idx]}`),
        );
      }

      // 10 list queries
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app.getHttpServer())
            .get("/portfolio")
            .query({ page: 1, limit: 5 }),
        );
      }

      // 5 creates
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app.getHttpServer())
            .post("/portfolio")
            .send({
              name: `Mixed Workload ${Date.now()}-${i}`,
            }),
        );
      }

      // 5 stats
      for (let i = 0; i < 5; i++) {
        promises.push(
          request(app.getHttpServer()).get("/portfolio/stats"),
        );
      }

      const responses = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // All should succeed
      const successCount = responses.filter(
        (r) => r.status === 200 || r.status === 201,
      ).length;
      expect(successCount).toBe(50);
      expect(elapsed).toBeLessThan(5000);
    }, 10000);
  });

  describe("Pagination Edge Cases Under Load", () => {
    it("should handle rapid pagination through all pages", async () => {
      const startTime = Date.now();
      const promises: Promise<request.Response>[] = [];

      // Request pages 1-10 concurrently
      for (let page = 1; page <= 10; page++) {
        promises.push(
          request(app.getHttpServer())
            .get("/portfolio")
            .query({ page, limit: 1 }),
        );
      }

      const responses = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBe(10);
      expect(elapsed).toBeLessThan(3000);

      // Each response should have correct page number
      responses.forEach((res, idx) => {
        expect(res.body.page).toBe(idx + 1);
      });
    }, 10000);
  });

  describe("Export Endpoint Load", () => {
    it("should handle 10 concurrent export requests under 3 seconds", async () => {
      const portfolioId = portfolioIds[0];
      const startTime = Date.now();
      const count = 10;
      const promises: Promise<request.Response>[] = [];

      for (let i = 0; i < count; i++) {
        promises.push(
          request(app.getHttpServer()).get(`/portfolio/${portfolioId}/export`),
        );
      }

      const responses = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBe(count);
      expect(elapsed).toBeLessThan(3000);
    }, 10000);
  });
});
