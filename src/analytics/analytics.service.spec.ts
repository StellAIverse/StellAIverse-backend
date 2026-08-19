import { Test, TestingModule } from "@nestjs/testing";
import { AnalyticsService } from "./analytics.service";
import { getRepositoryToken } from "@nestjs/typeorm";
import { AnalyticsEvent, EventType } from "./entities/analytics-event.entity";
import { DailyMetric } from "./entities/daily-metric.entity";
import { Repository } from "typeorm";

describe("AnalyticsService", () => {
  let service: AnalyticsService;

  const mockQueryBuilder = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ identifiers: [{ id: "test-id" }] }),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue({ count: "10" }),
    getCount: jest.fn().mockResolvedValue(5),
  };

  const mockEventRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    query: jest.fn().mockResolvedValue([]),
  };

  const mockMetricRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(AnalyticsEvent),
          useValue: mockEventRepository,
        },
        {
          provide: getRepositoryToken(DailyMetric),
          useValue: mockMetricRepository,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("ingestEvent", () => {
    it("should gracefully handle deduplication via orIgnore", async () => {
      const result = await service.ingestEvent(
        { eventType: EventType.CLICK, idempotencyKey: "123" },
        { userId: "user-1" },
      );
      
      expect(result.idempotencyKey).toBe("123");
      expect(result.userId).toBe("user-1");
      expect(mockQueryBuilder.orIgnore).toHaveBeenCalled();
    });
  });
  
  describe("ingestBatch", () => {
    it("should gracefully handle batch deduplication", async () => {
      const result = await service.ingestBatch(
        { events: [{ eventType: EventType.CLICK, idempotencyKey: "123" }] },
        { userId: "user-1" },
      );
      
      expect(result.accepted).toBe(1);
      expect(mockQueryBuilder.orIgnore).toHaveBeenCalled();
    });
  });
});
