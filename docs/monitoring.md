# Logging & Monitoring

This document describes the structured logging format, the metrics the service
exports, the health-check endpoints, and the alerting thresholds (#367).

## Structured logging

Logs are emitted as structured JSON via the pino-based Nest logger
(`src/config/nest-pino-logger.ts`, `src/config/logger.ts`); request/response
logging is applied by `src/common/middleware/logging.middleware.ts` and errors
are captured by `src/common/filters/global-exception.filter.ts`.

Every log line includes at least:

| Field       | Description                                             |
| ----------- | ------------------------------------------------------- |
| `level`     | Severity (`trace`/`debug`/`info`/`warn`/`error`/`fatal`)|
| `time`      | ISO-8601 / epoch-ms timestamp                           |
| `requestId` | Correlation ID for the request (propagated per request) |
| `userId`    | Authenticated user id when present                      |
| `method`    | HTTP method                                             |
| `url`       | Request path                                            |
| `statusCode`| Response status                                         |
| `msg`       | Human-readable message                                  |

Because the output is JSON, it can be shipped directly to Loki, ELK, or any
JSON log pipeline without a custom parser.

## Metrics

Prometheus metrics are exposed (unauthenticated, for in-cluster scraping) at:

```
GET /metrics        # text/plain; version=0.0.4
```

Metric definitions live in `src/config/metrics.ts` and are recorded by
`src/metrics/metrics.interceptor.ts`. Default Node/process metrics are exported
with the `stellaiverse_` prefix.

| Metric                                             | Type      | Labels                        | Meaning                              |
| -------------------------------------------------- | --------- | ----------------------------- | ------------------------------------ |
| `stellaiverse_http_requests_total`                 | counter   | method, route, status_code    | Total HTTP requests                  |
| `stellaiverse_http_errors_total`                   | counter   | method, route, status_code    | Total error responses                |
| `stellaiverse_http_request_duration_seconds`       | histogram | method, route, status_code    | Request latency (SLI)                |
| `stellaiverse_http_requests_in_progress`           | gauge     | method, route                 | In-flight requests (saturation)      |
| `stellaiverse_database_query_duration_seconds`     | histogram | operation, table              | DB query latency                     |
| `stellaiverse_active_connections`                  | gauge     | type                          | Active connections                   |
| `stellaiverse_auth_attempts_total`                 | counter   | method                        | Authentication attempts              |
| `stellaiverse_auth_success_total`                  | counter   | method                        | Successful authentications           |
| `stellaiverse_auth_failures_total`                 | counter   | method, reason                | Failed authentications               |

A ready-to-import Grafana dashboard is provided at
`monitoring/grafana/stellaiverse-backend-dashboard.json`.

## Health checks

Terminus-backed endpoints (all public, no auth), suitable for orchestrator
probes:

| Endpoint            | Purpose    | Use as                     |
| ------------------- | ---------- | -------------------------- |
| `GET /health`       | Full check | Manual / dashboards        |
| `GET /health/live`  | Liveness   | Kubernetes `livenessProbe` |
| `GET /health/ready` | Readiness  | Kubernetes `readinessProbe`|

- **Liveness** performs no dependency checks — it only confirms the process can
  serve HTTP, so a transient downstream outage does not cause a pod restart.
- **Readiness** verifies critical dependencies; the orchestrator routes traffic
  to the pod only while it returns `200`.

Example Kubernetes probe configuration:

```yaml
livenessProbe:
  httpGet: { path: /health/live, port: 3000 }
  initialDelaySeconds: 10
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /health/ready, port: 3000 }
  initialDelaySeconds: 5
  periodSeconds: 5
```

## SLOs and alerting thresholds

Example Prometheus rules live in `monitoring/prometheus/alerts.yml`.

| SLO / signal        | Threshold                              | Severity | Alert                        |
| ------------------- | -------------------------------------- | -------- | ---------------------------- |
| Availability        | error rate > 5% for 5m                 | critical | `HighHttpErrorRate`          |
| Target up           | `up == 0` for 1m                       | critical | `TargetDown`                 |
| Latency             | p95 request latency > 1s for 10m       | warning  | `HighRequestLatencyP95`      |
| DB latency          | p95 query latency > 500ms for 10m      | warning  | `HighDatabaseQueryLatencyP95`|
| Saturation          | in-flight requests > 100 for 5m        | warning  | `RequestQueueBacklog`        |
| Event-loop lag      | lag > 200ms for 5m                     | warning  | `EventLoopLagHigh`           |
| Auth failures       | > 5 failures/s for 5m                  | warning  | `AuthFailureSpike`           |
