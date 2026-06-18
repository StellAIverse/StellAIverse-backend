import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ILike, Not } from "typeorm";
import { PortfolioService } from "./portfolio.service";
import {
  Portfolio,
  PortfolioStatus,
  PortfolioType,
} from "../entities/portfolio.entity";
import { PortfolioAsset } from "../entities/portfolio-asset.entity";
import { OptimizationHistory } from "../entities/optimization-history.entity";
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
