import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { IdempotencyService } from "../services/idempotency.service";
import { IdempotencyKey } from "../entities/idempotency-key.entity";

const now = new Date();
const future = new Date(now.getTime() + 86400000);
const past = new Date(now.getTime() - 1000);

const makeKey = (overrides: Partial<IdempotencyKey> = {}): IdempotencyKey =>
  ({
    id: "ik-1",
    key: "test-key",
    jobId: "job-1",
    jobType: "email",
    status: "processing",
    result: null,
    expiresAt: future,
    createdAt: now,
    ...overrides,
  } as IdempotencyKey);

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn().mockImplementation((d) => ({ ...d })),
  save: jest.fn().mockImplementation(async (e) => e),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  remove: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  count: jest.fn().mockResolvedValue(0),
});

describe("IdempotencyService", () => {
  let service: IdempotencyService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: getRepositoryToken(IdempotencyKey), useValue: repo },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    jest.clearAllMocks();
  });

  // ── checkIdempotency ──────────────────────────────────────────────────────

  describe("checkIdempotency", () => {
    it("returns null when no record exists", async () => {
      repo.findOne.mockResolvedValueOnce(null);
      const result = await service.checkIdempotency("unknown-key", "email");
      expect(result).toBeNull();
    });

    it("returns jobId and status for a valid key", async () => {
      repo.findOne.mockResolvedValueOnce(makeKey({ status: "completed" }));
      const result = await service.checkIdempotency("test-key", "email");
      expect(result).toEqual({ jobId: "job-1", status: "completed" });
    });

    it("treats expired keys as non-existent and removes them", async () => {
      const expiredKey = makeKey({ expiresAt: past });
      repo.findOne.mockResolvedValueOnce(expiredKey);

      const result = await service.checkIdempotency("test-key", "email");

      expect(result).toBeNull();
      expect(repo.remove).toHaveBeenCalledWith(expiredKey);
    });
  });

  // ── registerIdempotencyKey ────────────────────────────────────────────────

  describe("registerIdempotencyKey", () => {
    it("creates and saves a key record", async () => {
      await service.registerIdempotencyKey("new-key", "job-123", "email");

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          key: "new-key",
          jobId: "job-123",
          jobType: "email",
          status: "processing",
        }),
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it("sets expiry based on ttlMs parameter", async () => {
      const ttl = 3600000; // 1 hour
      await service.registerIdempotencyKey("key-x", "job-x", "webhook", ttl);

      const created = repo.create.mock.calls[0][0];
      const expectedExpiry = new Date(Date.now() + ttl);
      expect(created.expiresAt.getTime()).toBeCloseTo(
        expectedExpiry.getTime(),
        -3, // within 1 second
      );
    });
  });

  // ── updateIdempotencyKeyStatus ────────────────────────────────────────────

  describe("updateIdempotencyKeyStatus", () => {
    it("updates status to completed with result", async () => {
      await service.updateIdempotencyKeyStatus("test-key", "completed", {
        messageId: "msg-1",
      });

      expect(repo.update).toHaveBeenCalledWith(
        { key: "test-key" },
        { status: "completed", result: { messageId: "msg-1" } },
      );
    });

    it("updates status to failed with null result when no result provided", async () => {
      await service.updateIdempotencyKeyStatus("test-key", "failed");

      expect(repo.update).toHaveBeenCalledWith(
        { key: "test-key" },
        { status: "failed", result: null },
      );
    });
  });

  // ── purgeExpiredKeys ──────────────────────────────────────────────────────

  describe("purgeExpiredKeys", () => {
    it("deletes expired keys and returns count", async () => {
      repo.delete.mockResolvedValueOnce({ affected: 7 });
      const count = await service.purgeExpiredKeys();
      expect(count).toBe(7);
      expect(repo.delete).toHaveBeenCalled();
    });

    it("returns 0 when nothing was deleted", async () => {
      repo.delete.mockResolvedValueOnce({ affected: 0 });
      const count = await service.purgeExpiredKeys();
      expect(count).toBe(0);
    });
  });

  // ── deleteKey ────────────────────────────────────────────────────────────

  describe("deleteKey", () => {
    it("deletes the specified key", async () => {
      await service.deleteKey("my-key");
      expect(repo.delete).toHaveBeenCalledWith({ key: "my-key" });
    });
  });

  // ── getStats ─────────────────────────────────────────────────────────────

  describe("getStats", () => {
    it("returns aggregated statistics", async () => {
      repo.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(2)  // processing
        .mockResolvedValueOnce(5)  // completed
        .mockResolvedValueOnce(1)  // failed
        .mockResolvedValueOnce(2); // expired

      const stats = await service.getStats();

      expect(stats).toEqual({
        total: 10,
        processing: 2,
        completed: 5,
        failed: 1,
        expired: 2,
      });
    });
  });
});
