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
import { PortfolioAsset, Chain } from "../../src/portfolio/entities/portfolio-asset.entity";
import { RiskProfile } from "../../src/portfolio/entities/risk-profile.entity";
import { OptimizationHistory } from "../../src/portfolio/entities/optimization-history.entity";
import { RebalancingEvent } from "../../src/portfolio/entities/rebalancing-event.entity";
import { PerformanceMetric } from "../../src/portfolio/entities/performance-metric.entity";
import { BacktestResult } from "../../src/portfolio/entities/backtest-result.entity";
import { Transaction } from "../../src/portfolio/entities/transaction.entity";
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

describe("Portfolio REST API Endpoints (e2e)", () => {
  let app: INestApplication;
  let createdPortfolioId: string;
  let secondPortfolioId: string;

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
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /portfolio – Create Portfolio ────────────────────────────

  describe("POST /portfolio – Create Portfolio", () => {
    it("should create a portfolio with valid data (201)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Test Growth Fund",
          description: "Long-term growth portfolio",
          type: "aggressive",
          initialAllocation: { BTC: 60, ETH: 40 },
          autoRebalanceEnabled: true,
          rebalanceFrequency: "monthly",
          rebalanceThreshold: 10,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id");
      expect(response.body.name).toBe("Test Growth Fund");
      expect(response.body.description).toBe("Long-term growth portfolio");
      expect(response.body.status).toBe(PortfolioStatus.ACTIVE);
      expect(response.body.type).toBe(PortfolioType.AGGRESSIVE);
      expect(response.body.initialAllocation).toEqual({ BTC: 60, ETH: 40 });
      expect(response.body.currentAllocation).toEqual({ BTC: 60, ETH: 40 });
      expect(response.body.autoRebalanceEnabled).toBe(true);
      expect(response.body.rebalanceFrequency).toBe("monthly");
      expect(response.body.rebalanceThreshold).toBe(10);
      expect(response.body).toHaveProperty("createdAt");
      expect(response.body).toHaveProperty("updatedAt");

      createdPortfolioId = response.body.id;
    });

    it("should create a second portfolio for stats testing", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Conservative Bond Fund",
          description: "Fixed income focused",
          type: "conservative",
          initialAllocation: { BOND: 80, USDC: 20 },
        });

      expect(response.status).toBe(201);
      expect(response.body.type).toBe(PortfolioType.CONSERVATIVE);
      secondPortfolioId = response.body.id;
    });

    it("should create a portfolio with minimal required fields", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Minimal Portfolio",
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Minimal Portfolio");
      expect(response.body.status).toBe(PortfolioStatus.ACTIVE);
      expect(response.body.type).toBe(PortfolioType.BALANCED);
    });

    it("should reject creation with missing name (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          description: "Missing name field",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("statusCode", 400);
    });

    it("should reject creation with name too short (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "AB",
        });

      expect(response.status).toBe(400);
    });

    it("should reject creation with name too long (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "A".repeat(101),
        });

      expect(response.status).toBe(400);
    });

    it("should reject creation with invalid type enum (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Invalid Type Portfolio",
          type: "invalid-type",
        });

      expect(response.status).toBe(400);
    });

    it("should reject duplicate portfolio name (409)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Test Growth Fund",
        });

      expect(response.status).toBe(409);
    });

    it("should reject unknown fields (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Unknown Fields Portfolio",
          unknownField: "should be rejected",
        });

      expect(response.status).toBe(400);
    });
  });

  // ─── GET /portfolio – List User Portfolios ─────────────────────────

  describe("GET /portfolio – List User Portfolios", () => {
    it("should list all portfolios with pagination (200)", async () => {
      const response = await request(app.getHttpServer())
        .get("/portfolio")
        .query({ page: 1, limit: 20 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("data");
      expect(response.body).toHaveProperty("total");
      expect(response.body).toHaveProperty("page", 1);
      expect(response.body).toHaveProperty("limit", 20);
      expect(response.body).toHaveProperty("totalPages");
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("should filter by status (200)", async () => {
      const response = await request(app.getHttpServer())
        .get("/portfolio")
        .query({ status: "active" });

      expect(response.status).toBe(200);
      expect(response.body.data.every((p: any) => p.status === "active")).toBe(
        true,
      );
    });

    it("should filter by type (200)", async () => {
      const response = await request(app.getHttpServer())
        .get("/portfolio")
        .query({ type: "aggressive" });

      expect(response.status).toBe(200);
      response.body.data.forEach((p: any) => {
        expect(p.type).toBe("aggressive");
      });
    });

    it("should search by name (200)", async () => {
      const response = await request(app.getHttpServer())
        .get("/portfolio")
        .query({ search: "Growth" });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0].name).toContain("Growth");
    });

    it("should paginate correctly (200)", async () => {
      const response = await request(app.getHttpServer())
        .get("/portfolio")
        .query({ page: 1, limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
      expect(response.body.limit).toBe(1);
    });

    it("should return empty data for non-matching search (200)", async () => {
      const response = await request(app.getHttpServer())
        .get("/portfolio")
        .query({ search: "nonexistent-portfolio-name-xyz" });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });
  });

  // ─── GET /portfolio/:id – Get Portfolio ────────────────────────────

  describe("GET /portfolio/:id – Get Portfolio", () => {
    it("should get a portfolio by ID (200)", async () => {
      const response = await request(app.getHttpServer()).get(
        `/portfolio/${createdPortfolioId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(createdPortfolioId);
      expect(response.body.name).toBe("Test Growth Fund");
      expect(response.body).toHaveProperty("createdAt");
      expect(response.body).toHaveProperty("updatedAt");
    });

    it("should return 404 for non-existent portfolio", async () => {
      const response = await request(app.getHttpServer()).get(
        "/portfolio/00000000-0000-0000-0000-000000000000",
      );

      expect(response.status).toBe(404);
    });
  });

  // ─── GET /portfolio/:id/summary – Portfolio Summary ────────────────

  describe("GET /portfolio/:id/summary – Portfolio Summary", () => {
    it("should get portfolio summary (200)", async () => {
      const response = await request(app.getHttpServer()).get(
        `/portfolio/${createdPortfolioId}/summary`,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(createdPortfolioId);
      expect(response.body.name).toBe("Test Growth Fund");
      expect(response.body).toHaveProperty("totalValue");
      expect(response.body).toHaveProperty("assetCount");
      expect(response.body).toHaveProperty("currentAllocation");
      expect(response.body).toHaveProperty("autoRebalanceEnabled");
      expect(response.body).toHaveProperty("rebalanceFrequency");
      expect(response.body).toHaveProperty("rebalanceThreshold");
    });

    it("should return 404 for non-existent portfolio summary", async () => {
      const response = await request(app.getHttpServer()).get(
        "/portfolio/00000000-0000-0000-0000-000000000000/summary",
      );

      expect(response.status).toBe(404);
    });
  });

  // ─── GET /portfolio/stats – Portfolio Stats ────────────────────────

  describe("GET /portfolio/stats – Portfolio Stats", () => {
    it("should get aggregate portfolio stats (200)", async () => {
      const response = await request(app.getHttpServer()).get(
        "/portfolio/stats",
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("totalPortfolios");
      expect(response.body).toHaveProperty("activePortfolios");
      expect(response.body).toHaveProperty("totalValue");
      expect(response.body).toHaveProperty("totalAssets");
      expect(response.body).toHaveProperty("byType");
      expect(response.body).toHaveProperty("topPortfolios");
      expect(response.body.totalPortfolios).toBeGreaterThanOrEqual(1);
      expect(typeof response.body.byType).toBe("object");
      expect(Array.isArray(response.body.topPortfolios)).toBe(true);
    });
  });

  // ─── GET /portfolio/:id/export – Export Portfolio ───────────────────

  describe("GET /portfolio/:id/export – Export Portfolio", () => {
    it("should export full portfolio data (200)", async () => {
      const response = await request(app.getHttpServer()).get(
        `/portfolio/${createdPortfolioId}/export`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("exportedAt");
      expect(response.body).toHaveProperty("portfolio");
      expect(response.body).toHaveProperty("assets");
      expect(response.body).toHaveProperty("optimizationHistory");
      expect(response.body.portfolio.id).toBe(createdPortfolioId);
      expect(Array.isArray(response.body.assets)).toBe(true);
      expect(Array.isArray(response.body.optimizationHistory)).toBe(true);
    });

    it("should return 404 for non-existent portfolio export", async () => {
      const response = await request(app.getHttpServer()).get(
        "/portfolio/00000000-0000-0000-0000-000000000000/export",
      );

      expect(response.status).toBe(404);
    });
  });

  // ─── PUT /portfolio/:id – Update Portfolio ─────────────────────────

  describe("PUT /portfolio/:id – Update Portfolio", () => {
    it("should update portfolio name (200)", async () => {
      const response = await request(app.getHttpServer())
        .put(`/portfolio/${createdPortfolioId}`)
        .send({
          name: "Updated Growth Fund",
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Updated Growth Fund");
      expect(response.body.id).toBe(createdPortfolioId);
    });

    it("should update multiple fields (200)", async () => {
      const response = await request(app.getHttpServer())
        .put(`/portfolio/${createdPortfolioId}`)
        .send({
          description: "Updated description for long-term growth",
          type: "balanced",
          autoRebalanceEnabled: false,
          rebalanceThreshold: 15,
        });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe(
        "Updated description for long-term growth",
      );
      expect(response.body.type).toBe(PortfolioType.BALANCED);
      expect(response.body.autoRebalanceEnabled).toBe(false);
      expect(response.body.rebalanceThreshold).toBe(15);
    });

    it("should return 404 when updating non-existent portfolio", async () => {
      const response = await request(app.getHttpServer())
        .put("/portfolio/00000000-0000-0000-0000-000000000000")
        .send({
          name: "Non-existent",
        });

      expect(response.status).toBe(404);
    });

    it("should reject invalid type enum on update (400)", async () => {
      const response = await request(app.getHttpServer())
        .put(`/portfolio/${createdPortfolioId}`)
        .send({
          type: "invalid-type",
        });

      expect(response.status).toBe(400);
    });

    it("should reject name shorter than 3 chars (400)", async () => {
      const response = await request(app.getHttpServer())
        .put(`/portfolio/${createdPortfolioId}`)
        .send({
          name: "AB",
        });

      expect(response.status).toBe(400);
    });
  });

  // ─── DELETE /portfolio/:id – Archive Portfolio ─────────────────────

  describe("DELETE /portfolio/:id – Archive Portfolio", () => {
    let portfolioToDeleteId: string;

    beforeAll(async () => {
      // Create a portfolio to archive
      const createResponse = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Portfolio To Archive",
          description: "Will be archived",
        });
      portfolioToDeleteId = createResponse.body.id;
    });

    it("should archive a portfolio (200)", async () => {
      const response = await request(app.getHttpServer()).delete(
        `/portfolio/${portfolioToDeleteId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(PortfolioStatus.ARCHIVED);
    });

    it("should not appear in active portfolio list after archiving", async () => {
      const response = await request(app.getHttpServer())
        .get("/portfolio")
        .query({ status: "active" });

      expect(response.status).toBe(200);
      const archivedIds = response.body.data.map((p: any) => p.id);
      expect(archivedIds).not.toContain(portfolioToDeleteId);
    });

    it("should return 404 when archiving non-existent portfolio", async () => {
      const response = await request(app.getHttpServer()).delete(
        "/portfolio/00000000-0000-0000-0000-000000000000",
      );

      expect(response.status).toBe(404);
    });
  });

  // ─── Standard Error Response Format ────────────────────────────────

  describe("Standard Error Response Format", () => {
    it("should return structured error for 400", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("statusCode", 400);
      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("path");
    });

    it("should return structured error for 404", async () => {
      const response = await request(app.getHttpServer()).get(
        "/portfolio/non-existent-id",
      );

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("statusCode", 404);
      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("path");
    });

    it("should return structured error for 409 (duplicate name)", async () => {
      // Try to create with an existing name
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Updated Growth Fund", // Already exists from earlier test
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty("statusCode", 409);
      expect(response.body).toHaveProperty("message");
    });
  });

  // ─── Load Test ─────────────────────────────────────────────────────

  describe("Load Test – 100 requests/second per portfolio", () => {
    it("should handle 100 sequential GET requests within 2 seconds", async () => {
      const portfolioId = createdPortfolioId;
      const startTime = Date.now();
      const requestCount = 100;
      const results: number[] = [];

      for (let i = 0; i < requestCount; i++) {
        const response = await request(app.getHttpServer()).get(
          `/portfolio/${portfolioId}`,
        );
        results.push(response.status);
      }

      const elapsed = Date.now() - startTime;

      // All requests should succeed
      expect(results.every((status) => status === 200)).toBe(true);

      // Should handle 100 requests in under 2 seconds (well above 100 req/s)
      expect(elapsed).toBeLessThan(2000);

      const requestsPerSecond = (requestCount / elapsed) * 1000;
      expect(requestsPerSecond).toBeGreaterThanOrEqual(100);
    }, 10000);

    it("should handle concurrent list requests without conflicts", async () => {
      const startTime = Date.now();
      const concurrentCount = 20;
      const promises: Promise<request.Response>[] = [];

      for (let i = 0; i < concurrentCount; i++) {
        promises.push(
          request(app.getHttpServer())
            .get("/portfolio")
            .query({ page: 1, limit: 10 }),
        );
      }

      const responses = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // All should succeed (200)
      const successCount = responses.filter((r) => r.status === 200).length;
      expect(successCount).toBe(concurrentCount);

      // Should complete within reasonable time
      expect(elapsed).toBeLessThan(5000);
    }, 10000);

    it("should handle concurrent create requests without conflicts", async () => {
      const startTime = Date.now();
      const concurrentCount = 10;
      const promises: Promise<request.Response>[] = [];

      for (let i = 0; i < concurrentCount; i++) {
        promises.push(
          request(app.getHttpServer())
            .post("/portfolio")
            .send({
              name: `Concurrent Portfolio ${i} ${Date.now()}`,
              description: `Load test portfolio ${i}`,
            }),
        );
      }

      const responses = await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // All should succeed (201)
      const successCount = responses.filter((r) => r.status === 201).length;
      expect(successCount).toBe(concurrentCount);

      // Should complete within reasonable time
      expect(elapsed).toBeLessThan(5000);
    }, 10000);
  });
});
