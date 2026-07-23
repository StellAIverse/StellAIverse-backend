import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import {
  QuotaResult,
  RateLimitList,
  RateLimitPolicy,
  RateLimitStore,
} from "./rate-limit.types";

export const RATE_LIMIT_REDIS = Symbol("RATE_LIMIT_REDIS");
export const RATE_LIMIT_KEY_PREFIX = Symbol("RATE_LIMIT_KEY_PREFIX");

const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local refill_per_ms = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local ttl_ms = tonumber(ARGV[4])
local algorithm = ARGV[5]

local values = redis.call("HMGET", key, "value", "updated_at")
local value = tonumber(values[1])
local updated_at = tonumber(values[2])

if updated_at == nil then updated_at = now end
local elapsed = math.max(0, now - updated_at)
local allowed = 0
local remaining = 0
local wait_ms = 0

if algorithm == "leaky-bucket" then
  if value == nil then value = 0 end
  value = math.max(0, value - elapsed * refill_per_ms)
  if value + 1 <= capacity then
    value = value + 1
    allowed = 1
  end
  remaining = math.floor(math.max(0, capacity - value))
  if allowed == 0 then
    wait_ms = math.ceil((value + 1 - capacity) / refill_per_ms)
  else
    wait_ms = math.ceil(value / refill_per_ms)
  end
else
  if value == nil then value = capacity end
  value = math.min(capacity, value + elapsed * refill_per_ms)
  if value >= 1 then
    value = value - 1
    allowed = 1
  end
  remaining = math.floor(value)
  if allowed == 0 then
    wait_ms = math.ceil((1 - value) / refill_per_ms)
  else
    wait_ms = math.ceil((capacity - value) / refill_per_ms)
  end
end

redis.call("HSET", key, "value", value, "updated_at", now)
redis.call("PEXPIRE", key, ttl_ms)

return { allowed, remaining, wait_ms }
`;

@Injectable()
export class RedisRateLimitStore implements RateLimitStore, OnModuleDestroy {
  constructor(
    @Inject(RATE_LIMIT_REDIS) private readonly redis: Redis,
    @Inject(RATE_LIMIT_KEY_PREFIX) private readonly keyPrefix: string,
  ) {}

  async consume(
    identifier: string,
    policy: RateLimitPolicy,
    nowMs = Date.now(),
  ): Promise<QuotaResult> {
    const capacity = policy.limit + policy.burst;
    const refillPerMs = policy.limit / policy.windowMs;
    const ttlMs = Math.max(policy.windowMs, Math.ceil(capacity / refillPerMs));
    const result = (await this.redis.eval(
      TOKEN_BUCKET_SCRIPT,
      1,
      this.key("bucket", identifier),
      String(nowMs),
      String(refillPerMs),
      String(capacity),
      String(ttlMs),
      policy.algorithm ?? "token-bucket",
    )) as [number, number, number];

    const allowed = Number(result[0]) === 1;
    return {
      allowed,
      limit: capacity,
      remaining: Number(result[1]),
      resetMs: Math.max(0, Number(result[2])),
      reason: allowed ? "allowed" : "limited",
    };
  }

  async getPolicy(identifier: string): Promise<RateLimitPolicy | null> {
    const raw = await this.redis.get(this.key("policy", identifier));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RateLimitPolicy;
    return {
      limit: Number(parsed.limit),
      windowMs: Number(parsed.windowMs),
      burst: Number(parsed.burst),
      algorithm: parsed.algorithm ?? "token-bucket",
    };
  }

  async setPolicy(identifier: string, policy: RateLimitPolicy): Promise<void> {
    await this.redis.set(
      this.key("policy", identifier),
      JSON.stringify(policy),
    );
  }

  async deletePolicy(identifier: string): Promise<void> {
    await this.redis.del(this.key("policy", identifier));
  }

  async isMember(list: RateLimitList, identifier: string): Promise<boolean> {
    return (await this.redis.sismember(this.key(list), identifier)) === 1;
  }

  async setMember(
    list: RateLimitList,
    identifier: string,
    enabled: boolean,
  ): Promise<void> {
    if (enabled) {
      await this.redis.sadd(this.key(list), identifier);
    } else {
      await this.redis.srem(this.key(list), identifier);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis.status !== "end") {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  }

  private key(kind: string, identifier?: string): string {
    return identifier
      ? `${this.keyPrefix}:${kind}:${identifier}`
      : `${this.keyPrefix}:${kind}`;
  }
}
