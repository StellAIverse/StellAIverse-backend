import { RedisRateLimitStore } from "./redis-rate-limit.store";

describe("RedisRateLimitStore", () => {
  it("executes the token bucket as one Redis script", async () => {
    const redis = {
      eval: jest.fn().mockResolvedValue([1, 4, 12_000]),
      status: "ready",
      quit: jest.fn(),
      disconnect: jest.fn(),
    } as any;
    const store = new RedisRateLimitStore(redis, "test:rate-limit");

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
    const store = new RedisRateLimitStore(redis, "test:rate-limit");

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
});
