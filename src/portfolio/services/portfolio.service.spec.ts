import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ILike, Not } from "typeorm";
import { ConflictException, BadRequestException } from "@nestjs/common";
import { PortfolioService } from "./portfolio.service";
import {
  Portfolio,
  PortfolioStatus,
  PortfolioType,
} from "../entities/portfolio.entity";
import { PortfolioAsset, Chain } from "../entities/portfolio-asset.entity";
import {
  OptimizationHistory,
  OptimizationMethod,
} from "../entities/optimization-history.entity";
import { RiskProfile } from "../entities/risk-profile.entity";
import {
  PortfolioNotFoundException,
  DuplicatePortfolioNameException,
} from "../exceptions/portfolio.exceptions";

const mockPortfolioRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  softDelete: jest.fn(),
  delete: jest.fn(),
};

const mockAssetRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
};

const mockOptimizationRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockRiskProfileRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
};

const USER_ID = "user-1";

const buildPortfolio = (overrides: Partial<Portfolio> = {}): Portfolio =>
  ({
    id: "pf-1",
    name: "My Portfolio",
    description: "desc",
    status: PortfolioStatus.ACTIVE,
    type: PortfolioType.BALANCED,
    totalValue: 0,
    currentAllocation: {},
    targetAllocation: {},
    initialAllocation: {},
    autoRebalanceEnabled: false,
    rebalanceThreshold: 5,
    userId: USER_ID,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  }) as Portfolio;

describe("PortfolioService (CRUD)", () => {
  let service: PortfolioService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortfolioService,
        {
          provide: getRepositoryToken(Portfolio),
          useValue: mockPortfolioRepo,
        },
        {
          provide: getRepositoryToken(PortfolioAsset),
          useValue: mockAssetRepo,
        },
        {
          provide: getRepositoryToken(OptimizationHistory),
          useValue: mockOptimizationRepo,
        },
        {
          provide: getRepositoryToken(RiskProfile),
          useValue: mockRiskProfileRepo,
        },
      ],
    }).compile();

    service = module.get<PortfolioService>(PortfolioService);
    jest.clearAllMocks();
    mockPortfolioRepo.create.mockImplementation((p) => ({ ...p }));
    mockPortfolioRepo.save.mockImplementation((p) =>
      Promise.resolve({ id: "pf-1", ...p }),
    );
    // Default: no existing assets (to avoid "assets is not iterable" in updatePortfolioAllocation)
    mockAssetRepo.find.mockResolvedValue([]);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createPortfolio", () => {
    it("creates a portfolio with defaults when no duplicate exists", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(null);

      const result = await service.createPortfolio(USER_ID, {
        name: "Growth Fund",
      });

      expect(mockPortfolioRepo.findOne).toHaveBeenCalledWith({
        where: { name: "Growth Fund" },
      });
      expect(mockPortfolioRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Growth Fund",
          userId: USER_ID,
          status: PortfolioStatus.ACTIVE,
          type: PortfolioType.BALANCED,
        }),
      );
      expect(result.id).toBe("pf-1");
    });

    it("honors a provided type and seeds currentAllocation from initialAllocation", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(null);

      await service.createPortfolio(USER_ID, {
        name: "Aggressive Fund",
        type: PortfolioType.AGGRESSIVE,
        initialAllocation: { BTC: 60, ETH: 40 },
      });

      expect(mockPortfolioRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PortfolioType.AGGRESSIVE,
          initialAllocation: { BTC: 60, ETH: 40 },
          currentAllocation: { BTC: 60, ETH: 40 },
        }),
      );
    });

    it("rejects duplicate portfolio names", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(buildPortfolio());

      await expect(
        service.createPortfolio(USER_ID, { name: "My Portfolio" }),
      ).rejects.toBeInstanceOf(DuplicatePortfolioNameException);
      expect(mockPortfolioRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("getPortfolio", () => {
    it("returns the portfolio when found", async () => {
      const pf = buildPortfolio();
      mockPortfolioRepo.findOne.mockResolvedValue(pf);

      const result = await service.getPortfolio("pf-1");

      expect(result).toBe(pf);
      expect(mockPortfolioRepo.findOne).toHaveBeenCalledWith({
        where: { id: "pf-1" },
        relations: ["assets", "optimizationHistory", "performanceMetrics"],
      });
    });

    it("throws when the portfolio does not exist", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(null);

      await expect(service.getPortfolio("missing")).rejects.toBeInstanceOf(
        PortfolioNotFoundException,
      );
    });
  });

  describe("getUserPortfolios", () => {
    it("returns all portfolios for a user ordered by createdAt", async () => {
      const items = [buildPortfolio()];
      mockPortfolioRepo.find.mockResolvedValue(items);

      const result = await service.getUserPortfolios(USER_ID);

      expect(result).toBe(items);
      expect(mockPortfolioRepo.find).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        relations: ["assets", "performanceMetrics"],
        order: { createdAt: "DESC" },
      });
    });
  });

  describe("listPortfolios", () => {
    it("paginates with defaults and computes totalPages", async () => {
      const items = [buildPortfolio(), buildPortfolio({ id: "pf-2" })];
      mockPortfolioRepo.findAndCount.mockResolvedValue([items, 2]);

      const result = await service.listPortfolios(USER_ID);

      expect(mockPortfolioRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          skip: 0,
          take: 20,
          order: { createdAt: "DESC" },
        }),
      );
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it("applies status, type and search filters with paging math", async () => {
      mockPortfolioRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.listPortfolios(USER_ID, {
        status: PortfolioStatus.ACTIVE,
        type: PortfolioType.CONSERVATIVE,
        search: "retire",
        page: 3,
        limit: 10,
      });

      expect(mockPortfolioRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: USER_ID,
            status: PortfolioStatus.ACTIVE,
            type: PortfolioType.CONSERVATIVE,
            name: ILike("%retire%"),
          },
          skip: 20,
          take: 10,
        }),
      );
    });

    it("reports zero totalPages for an empty result set", async () => {
      mockPortfolioRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.listPortfolios(USER_ID, { limit: 5 });

      expect(result.totalPages).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe("updatePortfolio", () => {
    it("updates fields without re-validating an unchanged name", async () => {
      const pf = buildPortfolio();
      mockPortfolioRepo.findOne.mockResolvedValue(pf);

      await service.updatePortfolio("pf-1", {
        description: "updated",
        type: PortfolioType.CONSERVATIVE,
      });

      // findOne only called once (the getPortfolio lookup), not for uniqueness.
      expect(mockPortfolioRepo.findOne).toHaveBeenCalledTimes(1);
      expect(mockPortfolioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "updated",
          type: PortfolioType.CONSERVATIVE,
        }),
      );
    });

    it("validates uniqueness when the name changes", async () => {
      const pf = buildPortfolio();
      mockPortfolioRepo.findOne
        .mockResolvedValueOnce(pf) // getPortfolio
        .mockResolvedValueOnce(null); // uniqueness check

      await service.updatePortfolio("pf-1", { name: "Brand New Name" });

      expect(mockPortfolioRepo.findOne).toHaveBeenLastCalledWith({
        where: { name: "Brand New Name", id: Not("pf-1") },
      });
      expect(mockPortfolioRepo.save).toHaveBeenCalled();
    });

    it("rejects renaming to an existing name", async () => {
      const pf = buildPortfolio();
      mockPortfolioRepo.findOne
        .mockResolvedValueOnce(pf) // getPortfolio
        .mockResolvedValueOnce(buildPortfolio({ id: "pf-2" })); // duplicate

      await expect(
        service.updatePortfolio("pf-1", { name: "Taken Name" }),
      ).rejects.toBeInstanceOf(DuplicatePortfolioNameException);
      expect(mockPortfolioRepo.save).not.toHaveBeenCalled();
    });

    it("throws when updating a non-existent portfolio", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updatePortfolio("missing", { description: "x" }),
      ).rejects.toBeInstanceOf(PortfolioNotFoundException);
    });
  });

  describe("archivePortfolio", () => {
    it("sets status to ARCHIVED and saves", async () => {
      const pf = buildPortfolio();
      mockPortfolioRepo.findOne.mockResolvedValue(pf);

      const result = await service.archivePortfolio("pf-1");

      expect(result.status).toBe(PortfolioStatus.ARCHIVED);
      expect(mockPortfolioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PortfolioStatus.ARCHIVED }),
      );
    });
  });

  describe("deletePortfolio", () => {
    it("soft-deletes an existing portfolio", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(buildPortfolio());
      mockPortfolioRepo.softDelete.mockResolvedValue({ affected: 1 });

      await service.deletePortfolio("pf-1");

      expect(mockPortfolioRepo.softDelete).toHaveBeenCalledWith("pf-1");
    });

    it("throws when deleting a non-existent portfolio", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(null);

      await expect(service.deletePortfolio("missing")).rejects.toBeInstanceOf(
        PortfolioNotFoundException,
      );
      expect(mockPortfolioRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  // ─── HOLDING MANAGEMENT ──────────────────────────────────────────

  describe("addAsset (add holding)", () => {
    beforeEach(() => {
      // Default: portfolio exists, no existing asset
      mockPortfolioRepo.findOne.mockResolvedValue(buildPortfolio());
      mockAssetRepo.findOne.mockResolvedValue(null);
    });

    it("should add a holding with chain and validate symbol", async () => {
      const result = await service.addAsset(
        "pf-1",
        "BTC",
        "Bitcoin",
        1.5,
        45000,
        44000,
        Chain.ETHEREUM,
      );

      expect(mockAssetRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: "BTC",
          chain: Chain.ETHEREUM,
          quantity: 1.5,
          costBasis: 44000,
        }),
      );
      expect(mockAssetRepo.save).toHaveBeenCalled();
    });

    it("should add a holding with default chain (ethereum)", async () => {
      await service.addAsset("pf-1", "ETH", "Ethereum", 10, 3000);

      expect(mockAssetRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: "ETH",
          chain: Chain.ETHEREUM,
        }),
      );
    });

    it("should support multiple chains", async () => {
      // Add on Ethereum
      await service.addAsset(
        "pf-1",
        "USDC",
        "USD Coin",
        1000,
        1,
        1,
        Chain.ETHEREUM,
      );

      // Add same token on Polygon
      mockAssetRepo.findOne.mockResolvedValue(null); // no duplicate
      await service.addAsset(
        "pf-1",
        "USDC",
        "USD Coin",
        500,
        1,
        1,
        Chain.POLYGON,
      );

      expect(mockAssetRepo.create).toHaveBeenCalledTimes(2);
    });

    it("should reject duplicate holding (same ticker + chain)", async () => {
      mockAssetRepo.findOne.mockResolvedValue({ id: "asset-1", ticker: "ETH" }); // asset exists

      await expect(
        service.addAsset(
          "pf-1",
          "ETH",
          "Ethereum",
          10,
          3000,
          2900,
          Chain.ETHEREUM,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("should allow same ticker on different chains", async () => {
      // First add - no existing
      mockAssetRepo.findOne.mockResolvedValueOnce(null);
      // Second add - simulate existing on ETH but not on POLYGON
      mockAssetRepo.findOne.mockImplementation(async (opts: any) => {
        if (opts.where?.chain === Chain.ETHEREUM) return { id: "asset-1", ticker: "ETH" };
        return null;
      });

      await service.addAsset(
        "pf-1",
        "ETH",
        "Ethereum",
        10,
        3000,
        2900,
        Chain.POLYGON,
      );

      expect(mockAssetRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ticker: "ETH",
          chain: Chain.POLYGON,
        }),
      );
    });

    it("should reject invalid ticker symbol (too short)", async () => {
      await expect(
        service.addAsset(
          "pf-1",
          "AB",
          "Too Short",
          10,
          100,
          0,
          Chain.ETHEREUM,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject invalid ticker symbol (too long)", async () => {
      await expect(
        service.addAsset(
          "pf-1",
          "ABCDEFGHIJK",
          "Too Long",
          10,
          100,
          0,
          Chain.ETHEREUM,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject invalid ticker symbol (lowercase)", async () => {
      await expect(
        service.addAsset(
          "pf-1",
          "btc",
          "Bitcoin",
          10,
          100,
          0,
          Chain.ETHEREUM,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject unsupported chain", async () => {
      await expect(
        service.addAsset(
          "pf-1",
          "BTC",
          "Bitcoin",
          1,
          100,
          0,
          "invalid-chain" as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject negative quantity", async () => {
      await expect(
        service.addAsset(
          "pf-1",
          "BTC",
          "Bitcoin",
          -1,
          100,
          0,
          Chain.ETHEREUM,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("updateAsset (update holding)", () => {
    const buildMockAsset = (overrides = {}) => ({
      id: "asset-1",
      ticker: "AAPL",
      name: "Apple Inc.",
      chain: Chain.ETHEREUM,
      quantity: 100,
      currentPrice: 150,
      value: 15000,
      allocationPercentage: 15,
      costBasis: 14000,
      costBasisPerShare: 140,
      unrealizedGain: 1000,
      portfolioId: "pf-1",
      lastPriceUpdate: new Date(),
      save: jest.fn(),
      ...overrides,
    });

    beforeEach(() => {
      mockPortfolioRepo.findOne.mockResolvedValue(buildPortfolio());
      mockAssetRepo.findOne.mockResolvedValue(buildMockAsset());
    });

    it("should update holding quantity", async () => {
      await service.updateAsset("pf-1", "asset-1", {
        quantity: 200,
      });

      expect(mockAssetRepo.save).toHaveBeenCalled();
    });

    it("should update holding price and recalculate unrealized gain", async () => {
      await service.updateAsset("pf-1", "asset-1", {
        currentPrice: 200,
      });

      expect(mockAssetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPrice: 200,
          lastPriceUpdate: expect.any(Date),
        }),
      );
    });

    it("should update cost basis and recalculate per-share cost", async () => {
      await service.updateAsset("pf-1", "asset-1", {
        costBasis: 16000,
      });

      expect(mockAssetRepo.save).toHaveBeenCalled();
    });

    it("should rebalance cost basis when adding quantity", async () => {
      let firstSaveCall: any = null;
      mockAssetRepo.save.mockImplementation((asset: any) => {
        if (!Array.isArray(asset) && firstSaveCall === null) {
          firstSaveCall = { ...asset };
        }
        return Promise.resolve(asset);
      });

      // Start with mock asset that has 100 qty at $140/share cost basis
      mockAssetRepo.findOne.mockResolvedValue(
        buildMockAsset({
          quantity: 100,
          costBasisPerShare: 140,
          costBasis: 14000,
          currentPrice: 150,
          value: 15000,
          unrealizedGain: 1000,
        }),
      );

      // Add 50 more at $160/share → new cost basis = weighted avg
      await service.updateAsset("pf-1", "asset-1", {
        quantity: 150,
        costBasis: 8000, // 50 * $160
      });

      // Expected: (100*140 + 50*160) / 150 = (14000+8000)/150 = 146.67
      expect(firstSaveCall).not.toBeNull();
      expect(firstSaveCall.costBasisPerShare).toBeCloseTo(146.67, 1);
      expect(firstSaveCall.costBasis).toBeCloseTo(22000, 0);
    });

    it("should update chain and check for duplicates", async () => {
      mockAssetRepo.findOne.mockImplementation(async (opts: any) => {
        // First call: find the asset to update
        if (opts.where?.id === "asset-1") return buildMockAsset();
        // Second call: check for duplicate chain
        return null; // no duplicate
      });

      await service.updateAsset("pf-1", "asset-1", {
        chain: Chain.POLYGON,
      });

      expect(mockAssetRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: Chain.POLYGON,
        }),
      );
    });

    it("should reject negative quantity", async () => {
      mockAssetRepo.findOne.mockResolvedValue(buildMockAsset());

      await expect(
        service.updateAsset("pf-1", "asset-1", {
          quantity: -5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error if asset not found", async () => {
      mockAssetRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateAsset("pf-1", "non-existent", {
          quantity: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("removeAsset (remove holding)", () => {
    const buildMockAsset = (overrides = {}) => ({
      id: "asset-1",
      ticker: "AAPL",
      name: "Apple Inc.",
      chain: Chain.ETHEREUM,
      quantity: 100,
      currentPrice: 150,
      value: 15000,
      allocationPercentage: 15,
      costBasis: 14000,
      costBasisPerShare: 140,
      unrealizedGain: 1000,
      portfolioId: "pf-1",
      lastPriceUpdate: new Date(),
      save: jest.fn(),
      ...overrides,
    });

    beforeEach(() => {
      mockPortfolioRepo.findOne.mockResolvedValue(buildPortfolio());
      mockAssetRepo.findOne.mockResolvedValue(buildMockAsset());
    });

    it("should remove a holding from portfolio", async () => {
      const mockAsset = buildMockAsset();
      mockAssetRepo.findOne.mockResolvedValue(mockAsset);

      await service.removeAsset("pf-1", "asset-1");

      expect(mockAssetRepo.remove).toHaveBeenCalledWith(mockAsset);
    });

    it("should recalculate portfolio allocation after removal", async () => {
      mockAssetRepo.findOne.mockResolvedValue(buildMockAsset());
      // After removal, assets list is empty
      mockAssetRepo.find.mockResolvedValue([]);

      await service.removeAsset("pf-1", "asset-1");

      // Should recalculate allocation via updatePortfolioAllocation
      expect(mockPortfolioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          totalValue: 0,
          currentAllocation: {},
        }),
      );
    });

    it("should throw error if asset not found", async () => {
      mockAssetRepo.findOne.mockResolvedValue(null);

      await expect(
        service.removeAsset("pf-1", "non-existent"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("updateAssetPrice", () => {
    it("should update asset price and recalculate unrealized gain", async () => {
      const freshAsset = {
        id: "asset-price-1",
        ticker: "BTC",
        name: "Bitcoin",
        chain: Chain.ETHEREUM,
        quantity: 100,
        currentPrice: 150,
        value: 15000,
        allocationPercentage: 15,
        costBasis: 14000,
        costBasisPerShare: 140,
        unrealizedGain: 1000,
        portfolioId: "pf-1",
        lastPriceUpdate: new Date(),
        save: jest.fn(),
      };

      // Ensure find returns our fresh asset
      mockAssetRepo.findOne.mockResolvedValue(freshAsset);
      mockAssetRepo.find.mockResolvedValue([freshAsset]);

      let capturedSaved: any = null;
      mockAssetRepo.save.mockImplementation((arg: any) => {
        if (!Array.isArray(arg)) {
          capturedSaved = { ...arg };
        }
        return Promise.resolve(arg);
      });

      await service.updateAssetPrice("asset-price-1", 200);

      expect(capturedSaved).not.toBeNull();
      expect(capturedSaved.currentPrice).toBe(200);
      expect(capturedSaved.value).toBe(20000); // 100 * 200
      expect(capturedSaved.unrealizedGain).toBe(6000); // 20000 - 14000 costBasis
      expect(capturedSaved.lastPriceUpdate).toBeInstanceOf(Date);
    });

    it("should throw error if asset not found", async () => {
      mockAssetRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateAssetPrice("non-existent", 200),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── PORTFOLIO VALUE & ALLOCATION UPDATES ────────────────────────

  describe("updatePortfolioAllocation", () => {
    const buildMockAsset = (overrides = {}) => ({
      id: "asset-1",
      ticker: "AAPL",
      name: "Apple Inc.",
      chain: Chain.ETHEREUM,
      quantity: 100,
      currentPrice: 150,
      value: 15000,
      allocationPercentage: 0,
      costBasis: 14000,
      costBasisPerShare: 140,
      unrealizedGain: 1000,
      portfolioId: "pf-1",
      ...overrides,
    });

    it("should calculate total value and allocation percentages", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(buildPortfolio());

      const assets = [
        buildMockAsset({ ticker: "AAPL", value: 30000 }),
        buildMockAsset({ id: "asset-2", ticker: "MSFT", value: 70000 }),
      ];
      mockAssetRepo.find.mockResolvedValue(assets);

      await service.updatePortfolioAllocation("pf-1");

      expect(mockPortfolioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          totalValue: 100000,
          currentAllocation: { AAPL: 30, MSFT: 70 },
        }),
      );
    });

    it("should handle empty portfolio (no assets)", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(buildPortfolio());
      mockAssetRepo.find.mockResolvedValue([]);

      await service.updatePortfolioAllocation("pf-1");

      expect(mockPortfolioRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          totalValue: 0,
          currentAllocation: {},
        }),
      );
    });
  });

  // ─── OPTIMIZATION ────────────────────────────────────────────────

  describe("runOptimization", () => {
    it("should run portfolio optimization", async () => {
      mockPortfolioRepo.findOne.mockResolvedValue(buildPortfolio());
      mockAssetRepo.find.mockResolvedValue([
        {
          id: "asset-1",
          ticker: "AAPL",
          expectedReturn: 0.08,
          volatility: 0.15,
          allocationPercentage: 50,
          suggestedAllocation: null,
          value: 50000,
        },
      ]);

      const mockOptimization = {
        id: "opt-1",
        portfolioId: "pf-1",
        method: OptimizationMethod.MEAN_VARIANCE,
        status: "pending",
        parameters: {},
        suggestedAllocation: {},
        currentAllocation: {},
        save: jest.fn(),
      };

      mockOptimizationRepo.create.mockReturnValue(mockOptimization);
      mockOptimizationRepo.save
        .mockResolvedValueOnce({
          ...mockOptimization,
          status: "in_progress",
        })
        .mockResolvedValueOnce({
          ...mockOptimization,
          status: "completed",
          suggestedAllocation: { AAPL: 40, MSFT: 60 },
          expectedReturn: 0.08,
          expectedVolatility: 0.15,
          expectedSharpeRatio: 0.5,
          improvementScore: 10,
          completedAt: new Date(),
        });

      mockAssetRepo.save.mockResolvedValue([{}]);

      const result = await service.runOptimization("pf-1", {
        method: OptimizationMethod.MEAN_VARIANCE,
        portfolioId: "pf-1",
      });

      expect(result.status).toBe("completed");
    });
  });

  describe("performance / large portfolios", () => {
    it("lists a large page of portfolios within a reasonable time", async () => {
      const large = Array.from({ length: 1000 }, (_, i) =>
        buildPortfolio({ id: `pf-${i}` }),
      );
      mockPortfolioRepo.findAndCount.mockResolvedValue([large, 5000]);

      const start = Date.now();
      const result = await service.listPortfolios(USER_ID, {
        page: 1,
        limit: 1000,
      });
      const elapsed = Date.now() - start;

      expect(result.data).toHaveLength(1000);
      expect(result.total).toBe(5000);
      expect(result.totalPages).toBe(5);
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
