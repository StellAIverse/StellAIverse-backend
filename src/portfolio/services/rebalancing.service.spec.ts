import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException } from "@nestjs/common";
import { RebalancingService } from "./rebalancing.service";
import {
  RebalancingEvent,
  RebalanceTrigger,
  RebalanceStatus,
} from "../entities/rebalancing-event.entity";
import { Portfolio } from "../entities/portfolio.entity";
import { PortfolioAsset, AssetType } from "../entities/portfolio-asset.entity";
import { PortfolioService } from "./portfolio.service";

const mockRebalancingRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
};

const mockPortfolioRepo = {
  save: jest.fn(),
};

const mockAssetRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
};

const mockPortfolioService = {
  getPortfolio: jest.fn(),
};

const buildPortfolio = (overrides: Partial<Portfolio> = {}): Portfolio =>
  ({
    id: "pf-1",
    name: "Test Portfolio",
    status: "ACTIVE",
    type: "BALANCED",
    totalValue: 10000,
    currentAllocation: { AAPL: 50, MSFT: 50 },
    targetAllocation: { AAPL: 40, MSFT: 60 },
    autoRebalanceEnabled: false,
    rebalanceThreshold: 5,
    userId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Portfolio;

const buildAsset = (overrides: Partial<PortfolioAsset> = {}): PortfolioAsset =>
  ({
    id: "asset-1",
    ticker: "AAPL",
    name: "Apple Inc.",
    type: AssetType.STOCK,
    quantity: 10,
    currentPrice: 500,
    value: 5000,
    allocationPercentage: 50,
    costBasisPerShare: 400,
    portfolioId: "pf-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as PortfolioAsset;

const buildRebalancingEvent = (
  overrides: Partial<RebalancingEvent> = {},
): RebalancingEvent =>
  ({
    id: "re-1",
    portfolioId: "pf-1",
    trigger: RebalanceTrigger.MANUAL,
    status: RebalanceStatus.PENDING,
    allocationBefore: { AAPL: 50, MSFT: 50 },
    allocationAfter: { AAPL: 40, MSFT: 60 },
    trades: [
      {
        ticker: "AAPL",
        action: "sell",
        quantity: 2,
        price: 500,
        value: 1000,
      },
    ],
    estimatedCost: 10,
    taxImpact: 30,
    maxAllocationDrift: 10,
    avgAllocationDrift: 5,
    createdAt: new Date(),
    ...overrides,
  }) as RebalancingEvent;

describe("RebalancingService", () => {
  let service: RebalancingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RebalancingService,
        {
          provide: getRepositoryToken(RebalancingEvent),
          useValue: mockRebalancingRepo,
        },
        {
          provide: getRepositoryToken(Portfolio),
          useValue: mockPortfolioRepo,
        },
        {
          provide: getRepositoryToken(PortfolioAsset),
          useValue: mockAssetRepo,
        },
        {
          provide: PortfolioService,
          useValue: mockPortfolioService,
        },
      ],
    }).compile();

    service = module.get<RebalancingService>(RebalancingService);
    jest.clearAllMocks();

    mockRebalancingRepo.create.mockImplementation((event) => ({
      id: "re-1",
      ...event,
    }));
    mockRebalancingRepo.save.mockImplementation((event) =>
      Promise.resolve(event),
    );
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("checkRebalancingNeeded", () => {
    it("returns false if no target allocation exists", async () => {
      mockPortfolioService.getPortfolio.mockResolvedValue(
        buildPortfolio({ targetAllocation: null }),
      );

      const result = await service.checkRebalancingNeeded("pf-1");

      expect(result).toBe(false);
    });

    it("returns true if drift exceeds threshold", async () => {
      mockPortfolioService.getPortfolio.mockResolvedValue(buildPortfolio());
      mockAssetRepo.find.mockResolvedValue([
        buildAsset(),
        buildAsset({
          id: "asset-2",
          ticker: "MSFT",
          allocationPercentage: 50,
        }),
      ]);

      const result = await service.checkRebalancingNeeded("pf-1");

      expect(result).toBe(true);
    });

    it("returns false if drift is within threshold", async () => {
      mockPortfolioService.getPortfolio.mockResolvedValue(
        buildPortfolio({
          targetAllocation: { AAPL: 50, MSFT: 50 },
        }),
      );
      mockAssetRepo.find.mockResolvedValue([
        buildAsset(),
        buildAsset({
          id: "asset-2",
          ticker: "MSFT",
          allocationPercentage: 50,
        }),
      ]);

      const result = await service.checkRebalancingNeeded("pf-1");

      expect(result).toBe(false);
    });
  });

  describe("calculateRebalancingTrades", () => {
    it("calculates trades to reach target allocation", async () => {
      mockPortfolioService.getPortfolio.mockResolvedValue(buildPortfolio());
      mockAssetRepo.find.mockResolvedValue([
        buildAsset(),
        buildAsset({
          id: "asset-2",
          ticker: "MSFT",
          quantity: 5,
          currentPrice: 1000,
          value: 5000,
          allocationPercentage: 50,
        }),
      ]);

      const trades = await service.calculateRebalancingTrades("pf-1");

      expect(trades.length).toBeGreaterThan(0);
    });
  });

  describe("calculateTransactionCosts", () => {
    it("calculates transaction costs based on trade values", () => {
      const trades = [
        {
          ticker: "AAPL",
          action: "sell" as const,
          quantity: 2,
          price: 500,
          value: 1000,
        },
      ];

      const cost = service.calculateTransactionCosts(trades);

      expect(cost).toBeGreaterThan(0);
    });
  });

  describe("calculateTaxImpact", () => {
    it("calculates tax impact for sell trades with gains", async () => {
      mockAssetRepo.find.mockResolvedValue([buildAsset()]);

      const trades = [
        {
          ticker: "AAPL",
          action: "sell" as const,
          quantity: 2,
          price: 500,
          value: 1000,
        },
      ];

      const tax = await service.calculateTaxImpact("pf-1", trades);

      expect(tax).toBeGreaterThan(0);
    });
  });

  describe("triggerRebalancing", () => {
    it("creates a rebalancing event when dryRun is false", async () => {
      mockPortfolioService.getPortfolio.mockResolvedValue(buildPortfolio());
      mockAssetRepo.find.mockResolvedValue([
        buildAsset(),
        buildAsset({
          id: "asset-2",
          ticker: "MSFT",
          allocationPercentage: 50,
        }),
      ]);

      const result = await service.triggerRebalancing(
        "pf-1",
        RebalanceTrigger.MANUAL,
        "Test rebalance",
        false,
      );

      expect(result.event).toBeDefined();
      expect(mockRebalancingRepo.create).toHaveBeenCalled();
      expect(mockRebalancingRepo.save).toHaveBeenCalled();
    });

    it("returns dry-run data without creating event when dryRun is true", async () => {
      mockPortfolioService.getPortfolio.mockResolvedValue(buildPortfolio());
      mockAssetRepo.find.mockResolvedValue([
        buildAsset(),
        buildAsset({
          id: "asset-2",
          ticker: "MSFT",
          allocationPercentage: 50,
        }),
      ]);

      const result = await service.triggerRebalancing(
        "pf-1",
        RebalanceTrigger.MANUAL,
        "Test dry-run",
        true,
      );

      expect(result.event).not.toBeDefined();
      expect(mockRebalancingRepo.create).not.toHaveBeenCalled();
      expect(mockRebalancingRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("approveRebalancing", () => {
    it("approves a rebalancing event", async () => {
      const event = buildRebalancingEvent();
      mockRebalancingRepo.findOne.mockResolvedValue(event);

      const result = await service.approveRebalancing("re-1");

      expect(result.status).toBe(RebalanceStatus.IN_PROGRESS);
      expect(mockRebalancingRepo.save).toHaveBeenCalled();
    });

    it("throws BadRequestException if event not found", async () => {
      mockRebalancingRepo.findOne.mockResolvedValue(null);

      await expect(service.approveRebalancing("missing")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("executeRebalancing", () => {
    it("executes rebalancing and updates portfolio", async () => {
      const event = buildRebalancingEvent({
        portfolio: buildPortfolio(),
      });
      mockRebalancingRepo.findOne.mockResolvedValue(event);
      mockPortfolioRepo.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.executeRebalancing("re-1");

      expect(result.status).toBe(RebalanceStatus.COMPLETED);
      expect(mockPortfolioRepo.save).toHaveBeenCalled();
    });
  });

  describe("cancelRebalancing", () => {
    it("cancels a rebalancing event", async () => {
      const event = buildRebalancingEvent();
      mockRebalancingRepo.findOne.mockResolvedValue(event);

      const result = await service.cancelRebalancing("re-1", "User canceled");

      expect(result.status).toBe(RebalanceStatus.CANCELLED);
      expect(result.failureReason).toBe("User canceled");
      expect(mockRebalancingRepo.save).toHaveBeenCalled();
    });
  });

  describe("getRebalancingHistory", () => {
    it("returns rebalancing history for a portfolio", async () => {
      const events = [buildRebalancingEvent()];
      mockRebalancingRepo.find.mockResolvedValue(events);

      const result = await service.getRebalancingHistory("pf-1");

      expect(result).toEqual(events);
      expect(mockRebalancingRepo.find).toHaveBeenCalledWith({
        where: { portfolioId: "pf-1" },
        order: { createdAt: "DESC" },
        take: 10,
      });
    });
  });

  describe("calculateAllocationDrift", () => {
    it("calculates allocation drift", async () => {
      mockPortfolioService.getPortfolio.mockResolvedValue(buildPortfolio());
      mockAssetRepo.find.mockResolvedValue([
        buildAsset(),
        buildAsset({
          id: "asset-2",
          ticker: "MSFT",
          allocationPercentage: 50,
        }),
      ]);

      const drift = await service.calculateAllocationDrift("pf-1");

      expect(drift).toHaveProperty("AAPL");
      expect(drift).toHaveProperty("MSFT");
    });
  });
});
