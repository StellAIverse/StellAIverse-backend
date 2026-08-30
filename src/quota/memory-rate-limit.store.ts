import {
  RateLimitList,
  RateLimitPolicy,
  RateLimitStore,
  QuotaResult,
} from "./rate-limit.types";

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly policies = new Map<string, RateLimitPolicy>();
  private readonly lists = {
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
    const raw = this.policies.get(identifier);
    if (!raw) return null;
    return {
      limit: Number(raw.limit),
      windowMs: Number(raw.windowMs),
      burst: Number(raw.burst),
      algorithm: raw.algorithm ?? "token-bucket",
    };
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
    if (enabled) {
      this.lists[list].add(identifier);
    } else {
      this.lists[list].delete(identifier);
    }
  }
}
