# Distributed rate limiting

The API uses Redis-backed rate limits for endpoints decorated with `@RateLimit`
or `@SensitiveRateLimit`. One atomic Lua operation updates each bucket, so all
application instances observe the same counter.

## Configuration

```env
REDIS_URL=redis://default:password@redis:6379
RATE_LIMIT_KEY_PREFIX=stellaiverse:rate-limit
```

Redis is required for decorated routes. The limiter deliberately does not fall
back to a process-local counter because that would silently multiply limits by
the number of running API instances.

## Identifiers

The guard selects one identifier in this order:

1. Authenticated user ID, stored as `user:<id>`.
2. `X-API-Key`, stored as `api-key:<sha256>` so the credential is never written
   to Redis or logs.
3. The first `X-Forwarded-For` address or the request IP, stored as `ip:<ip>`.

Only trust `X-Forwarded-For` when the application is behind a configured trusted
proxy that replaces client-supplied forwarding headers.

## Policies and algorithms

`@RateLimit` accepts a request limit, window, burst allowance, and algorithm:

```ts
@RateLimit({
  limit: 100,
  windowMs: 60_000,
  burst: 20,
  algorithm: "token-bucket",
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

Prometheus exposes `stellaiverse_rate_limit_decisions_total` and
`stellaiverse_rate_limit_rejections_total` through the existing `/metrics`
endpoint.

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
Lua `EVAL`, which is the cross-instance atomicity boundary.
