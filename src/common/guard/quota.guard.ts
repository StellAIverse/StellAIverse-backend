import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createHash } from "node:crypto";
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from "../decorators/rate-limit.decorator";
import { DEFAULT_QUOTA, QUOTA_LEVELS } from "src/config/quota.config";
import { RateLimiterService } from "src/quota/rate-limiter.service";
import {
  rateLimitDecisionsTotal,
  rateLimitRejectionsTotal,
} from "src/config/metrics";

@Injectable()
export class QuotaGuard implements CanActivate {
  private metrics?: any;
  private dynamicScaling?: any;
  private analytics?: any;
  private premiumBonus?: any;

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimiterService: RateLimiterService,
    @Optional() metrics?: any,
    @Optional() dynamicScaling?: any,
    @Optional() analytics?: any,
    @Optional() premiumBonus?: any,
  ) {
    this.metrics = metrics;
    this.dynamicScaling = dynamicScaling;
    this.analytics = analytics;
    this.premiumBonus = premiumBonus;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    ) as RateLimitOptions | undefined;

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const trackerKey = this.getTrackerKey(request);

    // Merge options with level config
    const levelConfig =
      QUOTA_LEVELS[(options.level as string) || "free"] || DEFAULT_QUOTA;
    const baseLimit = options.limit ?? levelConfig.limit;
    const baseWindowMs = options.windowMs ?? levelConfig.windowMs;
    const baseBurst = options.burst ?? levelConfig.burst;

    const endpoint =
      request.route?.path || request.originalUrl || request.url || "unknown";
    const userId = String(request.user?.id || trackerKey);
    const userTier = request.user?.tier || options.level || "unknown";
    const policy = (options.level as string) || "custom";

    const dynamic = this.dynamicScaling?.getAdjustment({
      key: trackerKey,
      userId,
      endpoint,
      policy,
      baseLimit,
      baseWindowMs,
      baseBurst,
    });

    const dynamicLimit = dynamic?.limit ?? baseLimit;
    const dynamicWindowMs = dynamic?.windowMs ?? baseWindowMs;
    const dynamicBurst = dynamic?.burst ?? baseBurst;

    if (dynamic) {
      const direction =
        dynamic.multiplier > 1.01
          ? "up"
          : dynamic.multiplier < 0.99
            ? "down"
            : "stable";
      this.metrics?.rateLimitScalingDecisions.inc({
        policy,
        endpoint,
        direction,
        predicted_burst: String(dynamic.predictedBurst),
      });
      this.metrics?.rateLimitScalingMultiplier.set(
        {
          policy,
          endpoint,
        },
        dynamic.multiplier,
      );
      this.metrics?.rateLimitPredictionConfidence.set(
        {
          policy,
          endpoint,
        },
        dynamic.confidence,
      );
      this.metrics?.rateLimitPredictionLatency.observe(
        {
          policy,
          endpoint,
        },
        dynamic.predictionLatencyMs,
      );
    }

    const control = this.analytics?.getEffectiveControl(
      request.user?.id,
      dynamicLimit,
      dynamicWindowMs,
      dynamicBurst,
    );

    const controlledLimit = control?.limit ?? dynamicLimit;
    const controlledWindowMs = control?.windowMs ?? dynamicWindowMs;
    const controlledBurst = control?.burst ?? dynamicBurst;

    const premiumAdjustment = this.premiumBonus
      ? await this.premiumBonus.getAdjustment({
          userId,
          userTier: String(userTier),
          endpoint,
          policy,
          baseLimit: controlledLimit,
          baseWindowMs: controlledWindowMs,
          baseBurst: controlledBurst,
        })
      : undefined;

    const limit = premiumAdjustment?.limit ?? controlledLimit;
    const windowMs = premiumAdjustment?.windowMs ?? controlledWindowMs;
    const burst = premiumAdjustment?.burst ?? controlledBurst;

    const startedAt = Date.now();

    const result = await this.rateLimiterService.checkQuota(
      trackerKey,
      limit,
      windowMs,
      burst,
      options.algorithm ?? "token-bucket",
    );

    const decisionMs = Date.now() - startedAt;
    rateLimitDecisionsTotal.inc({
      policy,
      outcome: result.allowed
        ? (result.reason ?? "allowed")
        : (result.reason ?? "limited"),
      identifier_type: trackerKey.split(":", 1)[0],
    });

    this.metrics?.rateLimitHits.inc({ policy, user_tier: userTier, endpoint });
    this.metrics?.rateLimitCurrentUsage.set(
      {
        policy,
        user_id: String(userId),
        endpoint,
      },
      Math.max(0, limit - result.remaining),
    );
    this.metrics?.rateLimitResetTime.set(
      {
        policy,
        user_id: String(userId),
        endpoint,
      },
      Date.now() + result.resetMs,
    );

    if (!result.allowed) {
      rateLimitRejectionsTotal.inc({
        policy,
        reason: result.reason ?? "limited",
      });
      this.metrics?.rateLimitExceeded.inc({
        policy,
        user_tier: userTier,
        endpoint,
      });
      this.metrics?.throttlingEvents.inc({
        severity: result.remaining <= 0 ? "high" : "medium",
        policy,
        user_tier: userTier,
      });
    }

    if (premiumAdjustment && premiumAdjustment.bonusApplied) {
      this.metrics?.premiumTierUsage.inc({
        feature: premiumAdjustment.feature,
        user_tier: String(userTier),
        plan: policy,
      });

      this.metrics?.premiumBonusClaims.inc({
        bonus_type:
          premiumAdjustment.activeBoostIds.length > 0 ? "boost" : "tier",
        user_tier: String(userTier),
        source:
          premiumAdjustment.activeBoostIds.length > 0
            ? "manual_or_campaign"
            : "tier_policy",
      });

      if (premiumAdjustment.componentMultipliers.referral > 0) {
        this.metrics?.referralBonusUsage.inc({
          bonus_type: "rate_limit",
          referrer_tier: String(userTier),
          referee_tier: String(userTier),
        });
      }
    }

    this.dynamicScaling?.recordFeedback({
      context: {
        key: trackerKey,
        userId,
        endpoint,
        policy,
        baseLimit,
        baseWindowMs,
        baseBurst,
      },
      allowed: result.allowed,
      remaining: result.remaining,
    });

    if (premiumAdjustment) {
      this.premiumBonus?.recordUsage({
        userId,
        userTier: String(userTier),
        endpoint,
        feature: premiumAdjustment.feature,
        policy,
        baseLimit: controlledLimit,
        effectiveLimit: limit,
        allowed: result.allowed,
        remaining: result.remaining,
        adjustment: premiumAdjustment,
      });
    }

    this.analytics?.recordRateLimitDecision({
      key: trackerKey,
      userId: String(userId),
      endpoint,
      policy,
      userTier: String(userTier),
      allowed: result.allowed,
      remaining: result.remaining,
      limit,
      resetMs: result.resetMs,
      decisionMs,
    });

    const response = context.switchToHttp().getResponse();

    // Set headers
    response.header("X-RateLimit-Limit", result.limit);
    response.header("X-RateLimit-Remaining", result.remaining);
    response.header(
      "X-RateLimit-Reset",
      Math.ceil((Date.now() + result.resetMs) / 1000),
    );

    if (!result.allowed) {
      response.header(
        "Retry-After",
        Math.max(1, Math.ceil(result.resetMs / 1000)),
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Rate limit exceeded",
          retryAfterMs: result.resetMs,
          reason: result.reason,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getTrackerKey(req: any): string {
    const userId = req.user?.id;
    if (userId) {
      return `user:${userId}`;
    }

    const apiKey = req.headers?.["x-api-key"];
    if (typeof apiKey === "string" && apiKey.length > 0) {
      const digest = createHash("sha256").update(apiKey).digest("hex");
      return `api-key:${digest}`;
    }

    const xff = req.headers?.["x-forwarded-for"];
    const ip = typeof xff === "string" ? xff.split(",")[0].trim() : req.ip;

    return `ip:${ip || "unknown"}`;
  }
}
