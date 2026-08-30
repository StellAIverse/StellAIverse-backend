import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { RateLimitAdminController } from "./rate-limit-admin.controller";
import {
  RATE_LIMIT_KEY_PREFIX,
  RATE_LIMIT_REDIS,
  RATE_LIMIT_FALLBACK_STORE,
  RedisRateLimitStore,
} from "./redis-rate-limit.store";
import { MemoryRateLimitStore } from "./memory-rate-limit.store";
import { RateLimiterService } from "./rate-limiter.service";
import { RATE_LIMIT_STORE } from "./rate-limit.types";

@Global()
@Module({
  controllers: [RateLimitAdminController],
  providers: [
    {
      provide: RATE_LIMIT_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.get<string>("REDIS_URL") ?? "redis://localhost:6379", {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        }),
    },
    {
      provide: RATE_LIMIT_KEY_PREFIX,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>("RATE_LIMIT_KEY_PREFIX") ??
        "stellaiverse:rate-limit",
    },
    MemoryRateLimitStore,
    {
      provide: RATE_LIMIT_FALLBACK_STORE,
      useExisting: MemoryRateLimitStore,
    },
    {
      provide: RATE_LIMIT_STORE,
      useFactory: (
        redis: Redis,
        prefix: string,
        fallback: MemoryRateLimitStore,
      ) => new RedisRateLimitStore(redis, prefix, fallback),
      inject: [
        RATE_LIMIT_REDIS,
        RATE_LIMIT_KEY_PREFIX,
        RATE_LIMIT_FALLBACK_STORE,
      ],
    },
    RateLimiterService,
  ],
  exports: [RateLimiterService, RATE_LIMIT_STORE],
})
export class RateLimitModule {}
