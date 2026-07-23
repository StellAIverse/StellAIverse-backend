export interface QuotaResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  reason?: "allowed" | "limited" | "whitelisted" | "blacklisted";
}

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
  burst: number;
  algorithm?: "token-bucket" | "leaky-bucket";
}

export interface IdentifierRateLimitState {
  identifier: string;
  policy: RateLimitPolicy | null;
  whitelisted: boolean;
  blacklisted: boolean;
}

export type RateLimitList = "whitelist" | "blacklist";

export const RATE_LIMIT_STORE = Symbol("RATE_LIMIT_STORE");

export interface RateLimitStore {
  consume(
    identifier: string,
    policy: RateLimitPolicy,
    nowMs?: number,
  ): Promise<QuotaResult>;
  getPolicy(identifier: string): Promise<RateLimitPolicy | null>;
  setPolicy(identifier: string, policy: RateLimitPolicy): Promise<void>;
  deletePolicy(identifier: string): Promise<void>;
  isMember(list: RateLimitList, identifier: string): Promise<boolean>;
  setMember(
    list: RateLimitList,
    identifier: string,
    enabled: boolean,
  ): Promise<void>;
}
