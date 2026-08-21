import { RedisRateLimitStore } from "./redis-rate-limit.store";
import { MemoryRateLimitStore } from "./memory-rate-limit.store";

describe("RedisRateLimitStore", () => {
  it("executes the token bucket as one Redis script", async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 4, 12_000]),
      status: "ready",
      quit: jest.fn(),
      disconnect: jest.fn(),
    } as any;
    const store = new RedisRateLimitStore(
      redis,
      "test:rate-limit",
      new MemoryRateLimitStore(),
    );

    const result = await store.consume(
      "user:42",
      { limit: 5, windowMs: 60_000, burst: 0 },
      1_000,
    );

    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(redis.eval.mock.calls[0][2]).toBe("test:rate-limit:bucket:user:42");
    expect(result).toEqual({
      allowed: true,
      limit: 5,
      remaining: 4,
      resetMs: 12_000,
      reason: "allowed",
    });
  });

  it("passes the selected leaky bucket algorithm to the atomic script", async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([0, 0, 500]),
      status: "ready",
      quit: jest.fn(),
      disconnect: jest.fn(),
    } as any;
    const store = new RedisRateLimitStore(
      redis,
      "test:rate-limit",
      new MemoryRateLimitStore(),
    );

    const result = await store.consume(
      "ip:127.0.0.1",
      {
        limit: 2,
        windowMs: 1_000,
        burst: 1,
        algorithm: "leaky-bucket",
      },
      2_000,
    );

    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(redis.eval.mock.calls[0].at(-1)).toBe("leaky-bucket");
    expect(result).toMatchObject({
      allowed: false,
      limit: 3,
      remaining: 0,
      resetMs: 500,
      reason: "limited",
    });
  });

  it("falls back to the memory store when Redis fails", async () => {
    const memoryStore = new MemoryRateLimitStore();
    const redis = {
      eval: jest.fn().mockRejectedValue(new Error("Redis connection failed")),
      status: "ready",
      quit: jest.fn(),
      disconnect: jest.fn(),
    } as any;
    const store = new RedisRateLimitStore(
      redis,
      "test:rate-limit",
      memoryStore,
    );

    const result = await store.consume(
      "user:42",
      { limit: 5, windowMs: 60_000, burst: 0 },
      1_000,
    );

    expect(redis.eval).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      allowed: true,
      limit: 5,
      remaining: 4,
      reason: "fallback",
    });
  });

  it("falls back to the memory store for policy operations when Redis fails", async () => {
    const memoryStore = new MemoryRateLimitStore();
    const redis = {
      get: jest.fn().mockRejectedValue(new Error("Redis down")),
      set: jest.fn().mockRejectedValue(new Error("Redis down")),
      del: jest.fn().mockRejectedValue(new Error("Redis down")),
      sismember: jest.fn().mockRejectedValue(new Error("Redis down")),
      sadd: jest.fn().mockRejectedValue(new Error("Redis down")),
      srem: jest.fn().mockRejectedValue(new Error("Redis down")),
      status: "ready",
      quit: jest.fn(),
      disconnect: jest.fn(),
    } as any;
    const store = new RedisRateLimitStore(
      redis,
      "test:rate-limit",
      memoryStore,
    );

    expect(await store.getPolicy("user:42")).toBeNull();
    await store.setPolicy("user:42", { limit: 10, windowMs: 60_000, burst: 0 });
    expect(await store.getPolicy("user:42")).toEqual({
      limit: 10,
      windowMs: 60_000,
      burst: 0,
      algorithm: "token-bucket",
    });
    expect(await store.isMember("whitelist", "user:42")).toBe(false);
    await store.setMember("whitelist", "user:42", true);
    expect(await store.isMember("whitelist", "user:42")).toBe(true);
    await store.deletePolicy("user:42");
    expect(await store.getPolicy("user:42")).toBeNull();
  });
});
