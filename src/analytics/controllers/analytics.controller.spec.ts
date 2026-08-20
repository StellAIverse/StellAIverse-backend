import { Test, TestingModule } from "@nestjs/testing";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "../analytics.service";
import { EventType } from "../entities/analytics-event.entity";
import { IngestEventDto, BatchIngestEventsDto } from "../dto/ingest-events.dto";

describe("AnalyticsController", () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;

  const mockAnalyticsService = {
    ingestEvent: jest.fn(),
    ingestBatch: jest.fn(),
    getDailyActiveUsers: jest.fn(),
    getEventCountsByType: jest.fn(),
    getFunnelConversion: jest.fn(),
    getTopEvents: jest.fn(),
    getRetentionCohorts: jest.fn(),
    getMetrics: jest.fn(),
    optOut: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("ingestEvent", () => {
    it("should accept a single event", async () => {
      const dto: IngestEventDto = { eventType: EventType.PAGE_VIEW, idempotencyKey: "123" };
      const req = { headers: {}, ip: "127.0.0.1" };
      
      mockAnalyticsService.ingestEvent.mockResolvedValue({ id: "event-id" });
      
      const result = await controller.ingestEvent(dto, req);
      expect(result).toEqual({ status: "accepted", eventId: "event-id" });
      expect(service.ingestEvent).toHaveBeenCalled();
    });
  });

  describe("reporting endpoints", () => {
    it("should get top events", async () => {
      mockAnalyticsService.getTopEvents.mockResolvedValue([{ eventName: "test", count: 10 }]);
      const result = await controller.getTopEvents("2026-01-01", "2026-01-31", 5);
      expect(result).toEqual([{ eventName: "test", count: 10 }]);
      expect(service.getTopEvents).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 5);
    });

    it("should get retention cohorts", async () => {
      mockAnalyticsService.getRetentionCohorts.mockResolvedValue([{ cohortDay: "2026-01-01", size: 100, retentionRates: { 1: 50 } }]);
      const result = await controller.getRetentionCohorts("2026-01-01", "2026-01-31");
      expect(result[0].size).toBe(100);
      expect(service.getRetentionCohorts).toHaveBeenCalled();
    });
  });
});
