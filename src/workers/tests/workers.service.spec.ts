import { Test, TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bull";
import { getRepositoryToken } from "@nestjs/typeorm";
import { WorkersService } from "../workers.service";
import { IdempotencyService } from "../services/idempotency.service";
import { WorkerMetricsService } from "../services/worker-metrics.service";
import { JobEntity } from "../entities/job.entity";

// ─── Shared mocks ────────────────────────────────────────────────────────────

const mockBullJob = {
  id: "bull-job-1",
  data: {},
  opts: { attempts: 3 },
  attemptsMade: 0,
  getState: jest.fn().mockResolvedValue("waiting"),
  progress: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  retry: jest.fn().mockResolvedValue(undefined),
  finished: jest.fn().mockResolvedValue({ done: true }),
};

const makeQueue = () => ({
  add: jest.fn().mockResolvedValue(mockBullJob),
  getJob: jest.fn().mockResolvedValue(mockBullJob),
  getWaitingCount: jest.fn().mockResolvedValue(0),
  getActiveCount: jest.fn().mockResolvedValue(0),
  getCompletedCount: jest.fn().mockResolvedValue(0),
  getFailedCount: jest.fn().mockResolvedValue(0),
  getDelayedCount: jest.fn().mockResolvedValue(0),
  getPausedCount: jest.fn().mockResolvedValue(0),
});

const makeRepo = () => ({
  create: jest.fn().mockImplementation((data) => ({
    id: "entity-uuid-1",
    bullJobId: null,
    status: "pending",
    ...data,
  })),
  save: jest.fn().mockImplementation(async (e) => e),
  findOne: jest.fn().mockResolvedValue(null),
  remove: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  createQueryBuilder: jest.fn().mockReturnValue({
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 5 }),
  }),
});

const mockIdempotencyService = {
  checkIdempotency: jest.fn().mockResolvedValue(null),
  registerIdempotencyKey: jest.fn().mockResolvedValue(undefined),
  updateIdempotencyKeyStatus: jest.fn().mockResolvedValue(undefined),
};

const mockMetricsService = {
  recordJobCreated: jest.fn(),
  recordJobCompleted: jest.fn(),
  recordJobFailed: jest.fn(),
  recordJobDuration: jest.fn(),
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("WorkersService", () => {
  let service: WorkersService;
  let emailQueue: ReturnType<typeof makeQueue>;
  let webhookQueue: ReturnType<typeof makeQueue>;
  let analyticsQueue: ReturnType<typeof makeQueue>;
  let dlqQueue: ReturnType<typeof makeQueue>;
  let jobRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    emailQueue = makeQueue();
    webhookQueue = makeQueue();
    analyticsQueue = makeQueue();
    dlqQueue = makeQueue();
    jobRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkersService,
        { provide: getQueueToken("email-jobs"), useValue: emailQueue },
        { provide: getQueueToken("webhook-jobs"), useValue: webhookQueue },
        { provide: getQueueToken("analytics-jobs"), useValue: analyticsQueue },
        { provide: getQueueToken("worker-dead-letter"), useValue: dlqQueue },
        { provide: getRepositoryToken(JobEntity), useValue: jobRepo },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
        { provide: WorkerMetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get<WorkersService>(WorkersService);
    jest.clearAllMocks();
  });

  // ── addEmailJob ──────────────────────────────────────────────────────────

  describe("addEmailJob", () => {
    const emailPayload = {
      to: "user@example.com",
      subject: "Hello",
      body: "World",
    };

    it("creates a job entity and adds it to the email queue", async () => {
      const result = await service.addEmailJob(emailPayload);

      expect(jobRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ jobType: "email", payload: emailPayload }),
      );
      expect(jobRepo.save).toHaveBeenCalledTimes(2); // initial + update bullJobId
      expect(emailQueue.add).toHaveBeenCalledWith("email", emailPayload, expect.any(Object));
      expect(result.jobType).toBe("email");
      expect(result.bullJobId).toBe("bull-job-1");
    });

    it("records job created metric", async () => {
      await service.addEmailJob(emailPayload);
      expect(mockMetricsService.recordJobCreated).toHaveBeenCalledWith("email");
    });

    it("cleans up DB record if queue.add throws", async () => {
      emailQueue.add.mockRejectedValueOnce(new Error("Redis down"));

      await expect(service.addEmailJob(emailPayload)).rejects.toThrow("Redis down");
      expect(jobRepo.remove).toHaveBeenCalled();
    });

    it("returns existing job when idempotency key matches", async () => {
      const existingJobId = "entity-uuid-existing";

      mockIdempotencyService.checkIdempotency.mockResolvedValueOnce({
        jobId: existingJobId,
        status: "completed",
      });

      jobRepo.findOne.mockResolvedValueOnce({
        id: existingJobId,
        bullJobId: "bull-999",
        jobType: "email",
        status: "completed",
        payload: emailPayload,
        result: { messageId: "msg-1" },
        attempts: 1,
        maxAttempts: 3,
        priority: 10,
        idempotencyKey: "key-abc",
        createdAt: new Date(),
      });

      mockBullJob.getState.mockResolvedValueOnce("completed");

      const result = await service.addEmailJob(emailPayload, {
        idempotencyKey: "key-abc",
      });

      // Should NOT have added to queue again
      expect(emailQueue.add).not.toHaveBeenCalled();
      expect(result.idempotencyKey).toBe("key-abc");
    });
  });

  // ── addWebhookJob ────────────────────────────────────────────────────────

  describe("addWebhookJob", () => {
    const webhookPayload = {
      url: "https://example.com/hook",
      method: "POST" as const,
      body: { event: "test" },
    };

    it("creates a job entity and adds it to the webhook queue", async () => {
      const result = await service.addWebhookJob(webhookPayload);

      expect(webhookQueue.add).toHaveBeenCalledWith(
        "webhook",
        webhookPayload,
        expect.any(Object),
      );
      expect(result.jobType).toBe("webhook");
    });
  });

  // ── addAnalyticsJob ──────────────────────────────────────────────────────

  describe("addAnalyticsJob", () => {
    const analyticsPayload = {
      eventType: "page_view",
      aggregationType: "count" as const,
      startDate: new Date("2024-01-01"),
      endDate: new Date("2024-01-31"),
    };

    it("creates a job entity and adds it to the analytics queue", async () => {
      const result = await service.addAnalyticsJob(analyticsPayload);

      expect(analyticsQueue.add).toHaveBeenCalledWith(
        "analytics",
        analyticsPayload,
        expect.any(Object),
      );
      expect(result.jobType).toBe("analytics");
    });
  });

  // ── getJobStatus ──────────────────────────────────────────────────────────

  describe("getJobStatus", () => {
    it("returns null when job not found", async () => {
      jobRepo.findOne.mockResolvedValueOnce(null);
      const result = await service.getJobStatus("nonexistent-id");
      expect(result).toBeNull();
    });

    it("returns job status with live Bull state", async () => {
      const entity = {
        id: "entity-1",
        bullJobId: "bull-1",
        jobType: "email",
        status: "active",
        payload: {},
        attempts: 1,
        maxAttempts: 3,
        priority: 10,
        createdAt: new Date(),
      };
      jobRepo.findOne.mockResolvedValueOnce(entity);
      mockBullJob.getState.mockResolvedValueOnce("completed");

      const result = await service.getJobStatus("entity-1");

      expect(result.status).toBe("completed");
      expect(result.id).toBe("entity-1");
    });
  });

  // ── cancelJob ────────────────────────────────────────────────────────────

  describe("cancelJob", () => {
    it("throws when job not found", async () => {
      jobRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.cancelJob("bad-id")).rejects.toThrow();
    });

    it("removes Bull job and marks entity as failed", async () => {
      const entity = {
        id: "entity-1",
        bullJobId: "bull-1",
        jobType: "email",
        status: "waiting",
      };
      jobRepo.findOne.mockResolvedValueOnce(entity);
      emailQueue.getJob.mockResolvedValueOnce(mockBullJob);

      await service.cancelJob("entity-1");

      expect(mockBullJob.remove).toHaveBeenCalled();
      expect(jobRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", error: "Job cancelled by user" }),
      );
    });
  });

  // ── retryJob ──────────────────────────────────────────────────────────────

  describe("retryJob", () => {
    it("throws when job not found", async () => {
      jobRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.retryJob("bad-id")).rejects.toThrow();
    });

    it("throws when job is not in failed state", async () => {
      jobRepo.findOne.mockResolvedValueOnce({
        id: "entity-1",
        jobType: "email",
        status: "active",
      });
      await expect(service.retryJob("entity-1")).rejects.toThrow(
        "not in failed state",
      );
    });

    it("re-enqueues a failed job with retry metadata", async () => {
      jobRepo.findOne.mockResolvedValueOnce({
        id: "entity-1",
        bullJobId: "bull-1",
        jobType: "email",
        status: "failed",
        payload: { to: "a@b.com", subject: "x", body: "y" },
        priority: 5,
        maxAttempts: 3,
        metadata: {},
      });

      const retried = await service.retryJob("entity-1");

      expect(emailQueue.add).toHaveBeenCalled();
      expect(retried.jobType).toBe("email");
    });
  });

  // ── getQueueStats ─────────────────────────────────────────────────────────

  describe("getQueueStats", () => {
    it("returns stats for all queues", async () => {
      const stats = await service.getQueueStats();
      expect(stats.queues).toHaveLength(4);
      const names = stats.queues.map((q) => q.name);
      expect(names).toContain("email");
      expect(names).toContain("webhook");
      expect(names).toContain("analytics");
      expect(names).toContain("dead-letter");
    });
  });
});
