import { MemoryRateLimitStore } from "./memory-rate-limit.store";
import { RateLimitPolicy } from "./rate-limit.types";

describe("MemoryRateLimitStore", () => {
  let store: MemoryRateLimitStore;

  beforeEach(() => {
    store = new MemoryRateLimitStore();
  });

  it("allows requests up to the limit", async () => {
    const policy: RateLimitPolicy = { limit: 2, windowMs: 60_000, burst: 0 };

    const first = await store.consume("user:1", policy, 1_000);
    const second = await store.consume("user:1", policy, 1_000);

    expect(first).toMatchObject({ allowed: true, remaining: 1 });
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("rejects requests after the limit is exhausted", async () => {
    const policy: RateLimitPolicy = { limit: 1, windowMs: 60_000, burst: 0 };

    const first = await store.consume("user:1", policy, 1_000);
    const second = await store.consume("user:1", policy, 1_000);

    expect(first).toMatchObject({ allowed: true });
    expect(second).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("refills tokens over time", async () => {
    const policy: RateLimitPolicy = { limit: 1, windowMs: 60_000, burst: 0 };

    await store.consume("user:1", policy, 1_000);
    await store.consume("user:1", policy, 1_000);

    const later = await store.consume("user:1", policy, 61_000);
    expect(later).toMatchObject({ allowed: true });
  });

  it("manages policies", async () => {
    expect(await store.getPolicy("user:1")).toBeNull();
    await store.setPolicy("user:1", { limit: 5, windowMs: 60_000, burst: 0 });
    expect(await store.getPolicy("user:1")).toEqual({
      limit: 5,
      windowMs: 60_000,
      burst: 0,
      algorithm: "token-bucket",
    });
    await store.deletePolicy("user:1");
    expect(await store.getPolicy("user:1")).toBeNull();
  });

  it("manages whitelist and blacklist", async () => {
    expect(await store.isMember("whitelist", "user:1")).toBe(false);
    expect(await store.isMember("blacklist", "user:1")).toBe(false);

    await store.setMember("whitelist", "user:1", true);
    expect(await store.isMember("whitelist", "user:1")).toBe(true);
    expect(await store.isMember("blacklist", "user:1")).toBe(false);

    await store.setMember("blacklist", "user:1", true);
    expect(await store.isMember("blacklist", "user:1")).toBe(true);
    expect(await store.isMember("whitelist", "user:1")).toBe(true);

    await store.setMember("blacklist", "user:1", false);
    expect(await store.isMember("blacklist", "user:1")).toBe(false);
  });
});
