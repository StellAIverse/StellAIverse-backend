# Distributed rate limiting

The API uses Redis-backed rate limits for endpoints decorated with `@RateLimit`
or `@SensitiveRateLimit`. One atomic Lua operation updates each bucket, so all
application instances observe the same counter.

## Configuration

```env
REDIS_URL=redis://default:password@redis:6379
RATE_LIMIT_KEY_PREFIX=stellaiverse:rate-limit
```

## Keying strategies

Use the `key` option on `@RateLimit` to control how requests are grouped:

- `user` — one bucket per authenticated user ID (`user:<id>`).
- `ip` — one bucket per client IP (`ip:<ip>`).
- `api-key` — one bucket per SHA-256 digest of `X-API-Key` (`api-key:<digest>`).
- `global` — a single shared bucket (`global:default`) for route-wide throttling.

When `key` is omitted, the guard auto-selects the identifier in this order:

1. Authenticated user ID
2. `X-API-Key`
3. `X-Forwarded-For` / `req.ip`

Example global throttle:

```ts
@RateLimit({ limit: 1000, windowMs: 60_000, key: "global" })
```

## Resilience and fallback

If Redis is unavailable, the rate limiter falls back to an in-memory token
bucket so the API remains available. Fallback decisions are recorded with
`reason: "fallback"` and emitted as metrics. Because in-memory counters are
local to each process, limits are not shared across instances during a Redis
outage.

## Policies and algorithms

`@RateLimit` accepts a request limit, window, burst allowance, algorithm, and
key strategy:

```ts
@RateLimit({
  limit: 100,
  windowMs: 60_000,
  burst: 20,
  algorithm: "token-bucket",
  key: "ip",
})
```

Supported algorithms:

- `token-bucket` refills tokens continuously and permits bursts up to
  `limit + burst`.
- `leaky-bucket` drains queued request volume continuously and rejects requests
  that would exceed `limit + burst`.

The default is `token-bucket`. Per-identifier policies stored through the admin
API override decorator values.

## Response headers and metrics

Decorated responses include:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`, as a Unix timestamp in seconds
- `Retry-After`, in seconds, on HTTP 429 responses

Prometheus exposes the following metrics through the existing `/metrics`
endpoint:

- `stellaiverse_rate_limit_decisions_total` — total rate-limit decisions
- `stellaiverse_rate_limit_rejections_total` — total 429 responses
- `stellaiverse_rate_limit_redis_errors_total` — total Redis errors
- `stellaiverse_rate_limit_fallback_total` — total fallback decisions
- `stellaiverse_rate_limit_redis_duration_seconds` — Redis operation latency

## High-traffic endpoints

For high-traffic routes:

1. Use `key: "global"` or `key: "ip"` to limit explosion of Redis keys.
2. Keep `burst` small to smooth traffic spikes.
3. Prefer wider windows (e.g., `windowMs: 60_000`) over short windows to reduce
   Lua script execution frequency.
4. Monitor `stellaiverse_rate_limit_redis_duration_seconds` and alert if p99
   exceeds 10 ms.
5. If Redis latency rises, the automatic fallback keeps the API serving, but
   consider scaling Redis or adding a read replica.

## Administration

All routes below require the existing `ADMIN` role through `RolesGuard`:

| Method   | Route                                      | Purpose                         |
| -------- | ------------------------------------------ | ------------------------------- |
| `GET`    | `/admin/rate-limits/:identifier`           | View policy and list membership |
| `PUT`    | `/admin/rate-limits/:identifier/policy`    | Set a policy override           |
| `DELETE` | `/admin/rate-limits/:identifier/policy`    | Remove an override              |
| `PUT`    | `/admin/rate-limits/:identifier/whitelist` | Bypass rate limiting            |
| `DELETE` | `/admin/rate-limits/:identifier/whitelist` | Remove bypass                   |
| `PUT`    | `/admin/rate-limits/:identifier/blacklist` | Reject every request            |
| `DELETE` | `/admin/rate-limits/:identifier/blacklist` | Remove rejection                |

Policy request example:

```json
{
  "limit": 120,
  "windowMs": 60000,
  "burst": 30,
  "algorithm": "leaky-bucket"
}
```

Adding an identifier to one list removes it from the opposite list. A blacklist
decision takes precedence if inconsistent legacy data contains both entries.

## Verification

The unit suite uses two limiter service instances sharing one atomic test store
and submits concurrent requests. Exactly the configured capacity is accepted.
The Redis store test separately verifies that each production decision uses one
Lua `EVAL`, which is the cross-instance atomicity boundary. Additional tests
cover global key strategy, Redis failure fallback, and memory store behavior.
