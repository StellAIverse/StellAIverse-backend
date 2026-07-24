import { Test, TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bull";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DeadLetterService, DeadLetterEntry } from "../services/dead-letter.service";
import { WorkerMetricsService } from "../services/worker-metrics.service";
import { JobEntity } from "../entities/job.entity";

const makeDlqEntry = (overrides: Partial<DeadLetterEntry> = {}): DeadLetterEntry => ({
  originalJobId: "orig-1",
  originalBullId: "bull-orig-1",
  jobType: "email",
  workerType: "email",
  payload: { to: "a@b.com", subject: "Hello", body: "World" },
  failureReason: "SMTP connection failed",
  attempts: 3,
  failedAt: new Date().toISOString(),
  ...overrides,
});

const makeBullJob = (data: any = makeDlqEntry()) => ({
  id: "dlq-bull-1",
  name: "dead-letter",
  data,
  opts: { attempts: 1 },
  attemptsMade: 3,
  getState: jest.fn().mockResolvedValue("waiting"),
  remove: jest.fn().mockResolvedValue(undefined),
  progress: jest.fn().mockResolvedValue(undefined),
});

const makeDlqQueue = () => ({
  add: jest.fn().mockResolvedValue({ id: "new-dlq-job" }),
  getJob: jest.fn(),
  getJobs: jest.fn().mockResolvedValue([]),
  count: jest.fn().mockResolvedValue(0),
});

const mockMetrics = {
  recordDlqEntry: jest.fn(),
  recordDlqRetry: jest.fn(),
};

describe("DeadLetterService", () => {
  let service: DeadLetterService;
  let dlqQueue: ReturnType<typeof makeDlqQueue>;
  let targetQueue: { add: jest.Mock };

  beforeEach(async () => {
    dlqQueue = makeDlqQueue();
    targetQueue = { add: jest.fn().mockResolvedValue({ id: "new-job-1" }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterService,
        { provide: getQueueToken("worker-dead-letter"), useValue: dlqQueue },
        { provide: getRepositoryToken(JobEntity), useValue: { findOne: jest.fn() } },
        { provide: WorkerMetricsService, useValue: mockMetrics },
      ],
    }).compile();

    service = module.get<DeadLetterService>(DeadLetterService);
    jest.clearAllMocks();
  });

  // ── moveToDeadLetter ──────────────────────────────────────────────────────

  describe("moveToDeadLetter", () => {
    it("adds the failed job to the DLQ with correct metadata", async () => {
      const bullJob = makeBullJob();

      await service.moveToDeadLetter(bullJob as any, "email", "SMTP failed");

      expect(dlqQueue.add).toHaveBeenCalledWith(
        "dead-letter",
        expect.objectContaining({
          workerType: "email",
          failureReason: "SMTP failed",
          attempts: bullJob.attemptsMade,
        }),
        expect.any(Object),
      );
    });

    it("records a DLQ entry metric", async () => {
      const bullJob = makeBullJob();
      await service.moveToDeadLetter(bullJob as any, "webhook", "timeout");
      expect(mockMetrics.recordDlqEntry).toHaveBeenCalledWith("webhook");
    });
  });

  // ── listDeadLetterJobs ────────────────────────────────────────────────────

  describe("listDeadLetterJobs", () => {
    it("returns empty list when DLQ is empty", async () => {
      dlqQueue.getJobs.mockResolvedValueOnce([]);
      dlqQueue.count.mockResolvedValueOnce(0);

      const result = await service.listDeadLetterJobs();

      expect(result.jobs).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("returns entries with their data", async () => {
      const entry = makeDlqEntry();
      dlqQueue.getJobs.mockResolvedValueOnce([makeBullJob(entry)]);
      dlqQueue.count.mockResolvedValueOnce(1);

      const result = await service.listDeadLetterJobs();

      expect(result.total).toBe(1);
      expect(result.jobs[0].workerType).toBe("email");
    });
  });

  // ── retryDeadLetterJob ────────────────────────────────────────────────────

  describe("retryDeadLetterJob", () => {
    it("throws when DLQ job not found", async () => {
      dlqQueue.getJob.mockResolvedValueOnce(null);
      await expect(
        service.retryDeadLetterJob("nonexistent", targetQueue as any),
      ).rejects.toThrow("not found");
    });

    it("re-enqueues the original payload on the target queue", async () => {
      const entry = makeDlqEntry({ workerType: "email" });
      const dlqBullJob = makeBullJob(entry);
      dlqQueue.getJob.mockResolvedValueOnce(dlqBullJob);

      const newJobId = await service.retryDeadLetterJob(
        "dlq-bull-1",
        targetQueue as any,
      );

      expect(targetQueue.add).toHaveBeenCalledWith(
        entry.jobType,
        entry.payload,
        expect.any(Object),
      );
      expect(dlqBullJob.remove).toHaveBeenCalled();
      expect(newJobId).toBe("new-job-1");
    });

    it("records a DLQ retry metric", async () => {
      const entry = makeDlqEntry({ workerType: "webhook" });
      const dlqBullJob = makeBullJob(entry);
      dlqQueue.getJob.mockResolvedValueOnce(dlqBullJob);

      await service.retryDeadLetterJob("dlq-bull-1", targetQueue as any);

      expect(mockMetrics.recordDlqRetry).toHaveBeenCalledWith("webhook");
    });
  });

  // ── deleteDeadLetterJob ───────────────────────────────────────────────────

  describe("deleteDeadLetterJob", () => {
    it("throws when job not found", async () => {
      dlqQueue.getJob.mockResolvedValueOnce(null);
      await expect(service.deleteDeadLetterJob("bad-id")).rejects.toThrow(
        "not found",
      );
    });

    it("removes the specified job", async () => {
      const dlqBullJob = makeBullJob();
      dlqQueue.getJob.mockResolvedValueOnce(dlqBullJob);

      await service.deleteDeadLetterJob("dlq-bull-1");

      expect(dlqBullJob.remove).toHaveBeenCalled();
    });
  });

  // ── purgeDeadLetterQueue ──────────────────────────────────────────────────

  describe("purgeDeadLetterQueue", () => {
    it("removes all DLQ jobs and returns count", async () => {
      const jobs = [makeBullJob(), makeBullJob(), makeBullJob()];
      dlqQueue.getJobs.mockResolvedValueOnce(jobs);

      const count = await service.purgeDeadLetterQueue();

      expect(count).toBe(3);
      jobs.forEach((j) => expect(j.remove).toHaveBeenCalled());
    });

    it("returns 0 when queue is already empty", async () => {
      dlqQueue.getJobs.mockResolvedValueOnce([]);
      const count = await service.purgeDeadLetterQueue();
      expect(count).toBe(0);
    });
  });

  // ── getStats ──────────────────────────────────────────────────────────────

  describe("getStats", () => {
    it("returns total and per-worker breakdown", async () => {
      const jobs = [
        makeBullJob(makeDlqEntry({ workerType: "email" })),
        makeBullJob(makeDlqEntry({ workerType: "email" })),
        makeBullJob(makeDlqEntry({ workerType: "webhook" })),
      ];
      dlqQueue.getJobs.mockResolvedValueOnce(jobs);

      const stats = await service.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byWorker.email).toBe(2);
      expect(stats.byWorker.webhook).toBe(1);
    });
  });
});
