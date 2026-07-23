import { Inject, Injectable } from "@nestjs/common";
import {
  IdentifierRateLimitState,
  QuotaResult,
  RATE_LIMIT_STORE,
  RateLimitList,
  RateLimitPolicy,
  RateLimitStore,
} from "./rate-limit.types";

@Injectable()
export class RateLimiterService {
  constructor(
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
  ) {}

  async checkQuota(
    identifier: string,
    limit: number,
    windowMs: number,
    burst = 0,
    algorithm: RateLimitPolicy["algorithm"] = "token-bucket",
  ): Promise<QuotaResult> {
    this.assertIdentifier(identifier);
    const requested = this.validatePolicy({
      limit,
      windowMs,
      burst,
      algorithm,
    });

    if (await this.store.isMember("blacklist", identifier)) {
      return {
        allowed: false,
        limit: requested.limit + requested.burst,
        remaining: 0,
        resetMs: requested.windowMs,
        reason: "blacklisted",
      };
    }

    if (await this.store.isMember("whitelist", identifier)) {
      const capacity = requested.limit + requested.burst;
      return {
        allowed: true,
        limit: capacity,
        remaining: capacity,
        resetMs: 0,
        reason: "whitelisted",
      };
    }

    const override = await this.store.getPolicy(identifier);
    return this.store.consume(identifier, override ?? requested);
  }

  async getIdentifierState(
    identifier: string,
  ): Promise<IdentifierRateLimitState> {
    this.assertIdentifier(identifier);
    const [policy, whitelisted, blacklisted] = await Promise.all([
      this.store.getPolicy(identifier),
      this.store.isMember("whitelist", identifier),
      this.store.isMember("blacklist", identifier),
    ]);
    return { identifier, policy, whitelisted, blacklisted };
  }

  async setPolicy(
    identifier: string,
    policy: RateLimitPolicy,
  ): Promise<IdentifierRateLimitState> {
    this.assertIdentifier(identifier);
    await this.store.setPolicy(identifier, this.validatePolicy(policy));
    return this.getIdentifierState(identifier);
  }

  async deletePolicy(identifier: string): Promise<void> {
    this.assertIdentifier(identifier);
    await this.store.deletePolicy(identifier);
  }

  async setListMembership(
    list: RateLimitList,
    identifier: string,
    enabled: boolean,
  ): Promise<IdentifierRateLimitState> {
    this.assertIdentifier(identifier);
    await this.store.setMember(list, identifier, enabled);

    if (enabled) {
      const opposite: RateLimitList =
        list === "whitelist" ? "blacklist" : "whitelist";
      await this.store.setMember(opposite, identifier, false);
    }

    return this.getIdentifierState(identifier);
  }

  private validatePolicy(policy: RateLimitPolicy): RateLimitPolicy {
    if (!Number.isInteger(policy.limit) || policy.limit < 1) {
      throw new RangeError("Rate limit must be a positive integer");
    }
    if (!Number.isInteger(policy.windowMs) || policy.windowMs < 1) {
      throw new RangeError("Rate-limit window must be a positive integer");
    }
    if (!Number.isInteger(policy.burst) || policy.burst < 0) {
      throw new RangeError("Rate-limit burst must be a non-negative integer");
    }
    if (
      policy.algorithm !== undefined &&
      policy.algorithm !== "token-bucket" &&
      policy.algorithm !== "leaky-bucket"
    ) {
      throw new RangeError("Unsupported rate-limit algorithm");
    }
    return { algorithm: "token-bucket", ...policy };
  }

  private assertIdentifier(identifier: string): void {
    if (!identifier || identifier.length > 512) {
      throw new RangeError("Rate-limit identifier must be 1 to 512 characters");
    }
  }
}
