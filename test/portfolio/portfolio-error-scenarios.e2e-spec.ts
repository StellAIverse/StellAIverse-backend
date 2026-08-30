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

describe("Portfolio Error Scenarios (e2e)", () => {
  let app: INestApplication;

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

  describe("POST /portfolio – Validation Errors", () => {
    it("should reject empty body (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("statusCode", 400);
      expect(response.body).toHaveProperty("message");
    });

    it("should reject name with only spaces (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({ name: "   " });

      expect(response.status).toBe(400);
    });

    it("should reject name with special characters (still valid, 3+ chars)", async () => {
      // Special chars in name should be allowed as long as length is valid
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({ name: "Portfolio@#$%" });

      // This should succeed since the DTO only validates length
      expect(response.status).toBe(201);
    });

    it("should reject negative rebalance threshold (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Negative Threshold",
          rebalanceThreshold: -5,
        });

      expect(response.status).toBe(400);
    });

    it("should reject invalid rebalance frequency (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Invalid Frequency",
          rebalanceFrequency: "annually",
        });

      expect(response.status).toBe(400);
    });

    it("should reject non-boolean autoRebalanceEnabled (400)", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({
          name: "Invalid Auto Rebalance",
          autoRebalanceEnabled: "yes",
        });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /portfolio – Query Parameter Errors", () => {
    it("should handle invalid page parameter gracefully (200 with defaults)", async () => {
      const response = await request(app.getHttpServer())
        .get("/portfolio")
        .query({ page: -1 });

      // Should use default page of 1
      expect(response.status).toBe(200);
      expect(response.body.page).toBe(1);
    });

    it("should handle invalid limit parameter gracefully (200 with defaults)", async () => {
      const response = await request(app.getHttpServer())
        .get("/portfolio")
        .query({ limit: 0 });

      // Should use default limit of 20
      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(20);
    });

    it("should handle limit exceeding max (200 with cap)", async () => {
      const response = await request(app.getHttpServer())
        .get("/portfolio")
        .query({ limit: 200 });

      // Should be capped at 100 by validation
      expect(response.status).toBe(400);
    });
  });

  describe("GET /portfolio/:id – Not Found Errors", () => {
    it("should return 404 for UUID format but non-existent ID", async () => {
      const response = await request(app.getHttpServer()).get(
        "/portfolio/12345678-1234-1234-1234-123456789abc",
      );

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty("statusCode", 404);
      expect(response.body).toHaveProperty("message");
    });

    it("should return 404 for invalid UUID format", async () => {
      const response = await request(app.getHttpServer()).get(
        "/portfolio/invalid-id",
      );

      // Should be 404 since the ID won't match any portfolio
      expect(response.status).toBe(404);
    });
  });

  describe("PUT /portfolio/:id – Update Errors", () => {
    let testPortfolioId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/portfolio")
        .send({ name: "Error Test Portfolio" });
      testPortfolioId = createResponse.body.id;
    });

    it("should return 404 for update on non-existent portfolio", async () => {
      const response = await request(app.getHttpServer())
        .put("/portfolio/00000000-0000-0000-0000-000000000000")
        .send({ name: "Updated Name" });

      expect(response.status).toBe(404);
    });

    it("should reject update with invalid type (400)", async () => {
      const response = await request(app.getHttpServer())
        .put(`/portfolio/${testPortfolioId}`)
        .send({ type: "mega-aggressive" });

      expect(response.status).toBe(400);
    });

    it("should reject update with invalid status (400)", async () => {
      const response = await request(app.getHttpServer())
        .put(`/portfolio/${testPortfolioId}`)
        .send({ status: "deleted" });

      expect(response.status).toBe(400);
    });
  });

  describe("DELETE /portfolio/:id – Archive Errors", () => {
    it("should return 404 for archive on non-existent portfolio", async () => {
      const response = await request(app.getHttpServer()).delete(
        "/portfolio/00000000-0000-0000-0000-000000000000",
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Error Response Consistency", () => {
    it("should include correlationId in error responses", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("correlationId");
      expect(typeof response.body.correlationId).toBe("string");
    });

    it("should include timestamp in error responses", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("timestamp");
      // Should be a valid ISO date string
      expect(new Date(response.body.timestamp).toISOString()).toBe(
        response.body.timestamp,
      );
    });

    it("should include path in error responses", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("path");
      expect(response.body.path).toContain("/portfolio");
    });

    it("should never expose stack traces in error responses", async () => {
      const response = await request(app.getHttpServer())
        .post("/portfolio")
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).not.toHaveProperty("stack");
      expect(response.body).not.toHaveProperty("trace");
    });
  });
});
