import { RateLimiterService } from "./rate-limiter.service";
import {
  QuotaResult,
  RateLimitList,
  RateLimitPolicy,
  RateLimitStore,
} from "./rate-limit.types";

class AtomicTestStore implements RateLimitStore {
  readonly policies = new Map<string, RateLimitPolicy>();
  readonly lists = {
    whitelist: new Set<string>(),
    blacklist: new Set<string>(),
  };
  private readonly buckets = new Map<
    string,
    { tokens: number; updatedAt: number }
  >();

  async consume(
    identifier: string,
    policy: RateLimitPolicy,
    nowMs = Date.now(),
  ): Promise<QuotaResult> {
    const capacity = policy.limit + policy.burst;
    const refillPerMs = policy.limit / policy.windowMs;
    const current = this.buckets.get(identifier) ?? {
      tokens: capacity,
      updatedAt: nowMs,
    };
    const tokens = Math.min(
      capacity,
      current.tokens + Math.max(0, nowMs - current.updatedAt) * refillPerMs,
    );
    const allowed = tokens >= 1;
    const remainingTokens = allowed ? tokens - 1 : tokens;
    this.buckets.set(identifier, {
      tokens: remainingTokens,
      updatedAt: nowMs,
    });

    return {
      allowed,
      limit: capacity,
      remaining: Math.floor(remainingTokens),
      resetMs: allowed
        ? policy.windowMs
        : Math.ceil((1 - tokens) / refillPerMs),
      reason: allowed ? "allowed" : "limited",
    };
  }

  async getPolicy(identifier: string): Promise<RateLimitPolicy | null> {
    return this.policies.get(identifier) ?? null;
  }

  async setPolicy(identifier: string, policy: RateLimitPolicy): Promise<void> {
    this.policies.set(identifier, policy);
  }

  async deletePolicy(identifier: string): Promise<void> {
    this.policies.delete(identifier);
  }

  async isMember(list: RateLimitList, identifier: string): Promise<boolean> {
    return this.lists[list].has(identifier);
  }

  async setMember(
    list: RateLimitList,
    identifier: string,
    enabled: boolean,
  ): Promise<void> {
    if (enabled) this.lists[list].add(identifier);
    else this.lists[list].delete(identifier);
  }
}

describe("RateLimiterService", () => {
  it("shares an atomic limit across concurrent service instances", async () => {
    const store = new AtomicTestStore();
    const firstInstance = new RateLimiterService(store);
    const secondInstance = new RateLimiterService(store);

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 ? firstInstance : secondInstance).checkQuota(
          "user:42",
          10,
          60_000,
        ),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(10);
  });

  it("uses an identifier policy override", async () => {
    const store = new AtomicTestStore();
    const service = new RateLimiterService(store);
    await service.setPolicy("api-key:abc", {
      limit: 1,
      windowMs: 60_000,
      burst: 0,
    });

    expect((await service.checkQuota("api-key:abc", 100, 60_000)).allowed).toBe(
      true,
    );
    expect((await service.checkQuota("api-key:abc", 100, 60_000)).allowed).toBe(
      false,
    );
  });

  it("allows whitelisted and rejects blacklisted identifiers", async () => {
    const store = new AtomicTestStore();
    const service = new RateLimiterService(store);

    await service.setListMembership("whitelist", "user:trusted", true);
    const allowed = await service.checkQuota("user:trusted", 1, 60_000);
    expect(allowed).toMatchObject({ allowed: true, reason: "whitelisted" });

    await service.setListMembership("blacklist", "user:trusted", true);
    const rejected = await service.checkQuota("user:trusted", 1, 60_000);
    expect(rejected).toMatchObject({ allowed: false, reason: "blacklisted" });
    expect(store.lists.whitelist.has("user:trusted")).toBe(false);
  });

  it("rejects invalid policies", async () => {
    const service = new RateLimiterService(new AtomicTestStore());
    await expect(
      service.setPolicy("user:42", { limit: 0, windowMs: 60_000, burst: 0 }),
    ).rejects.toThrow("positive integer");
  });
});
