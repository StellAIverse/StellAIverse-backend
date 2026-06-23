# Metrics & Prometheus Integration

## Overview

StellAIverse Backend exposes Prometheus-compatible metrics at `GET /metrics` (no auth required).

## Endpoint

```
GET /metrics
```

Returns metrics in Prometheus text format (`text/plain; version=0.0.4`).

## How It Works

- `MetricsModule` registers a global `MetricsInterceptor` that automatically tracks every HTTP request.
- `prom-client` collects Node.js default metrics (CPU, memory, event loop, GC) with the `stellaiverse_` prefix.
- Custom metrics are defined in `src/config/metrics.ts` and exported for use across the codebase.

## Available Metrics (≥ 20 custom metrics)

### HTTP

| Metric | Type | Labels |
|--------|------|--------|
| `stellaiverse_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` |
| `stellaiverse_http_requests_total` | Counter | `method`, `route`, `status_code` |
| `stellaiverse_http_requests_in_progress` | Gauge | `method`, `route` |
| `stellaiverse_http_errors_total` | Counter | `method`, `route`, `status_code` |

### Authentication

| Metric | Type | Labels |
|--------|------|--------|
| `stellaiverse_auth_attempts_total` | Counter | `method` |
| `stellaiverse_auth_success_total` | Counter | `method` |
| `stellaiverse_auth_failures_total` | Counter | `method`, `reason` |
| `stellaiverse_user_signups_total` | Counter | `method` |
| `stellaiverse_active_users` | Gauge | — |

### Database

| Metric | Type | Labels |
|--------|------|--------|
| `stellaiverse_database_query_duration_seconds` | Histogram | `operation`, `table` |
| `stellaiverse_active_connections` | Gauge | `type` |

### Job Queue

| Metric | Type | Labels |
|--------|------|--------|
| `stellaiverse_job_duration_seconds` | Histogram | `job_type`, `status` |
| `stellaiverse_job_success_total` | Counter | `job_type` |
| `stellaiverse_job_failure_total` | Counter | `job_type`, `failure_reason` |
| `stellaiverse_queue_length` | Gauge | `queue_name`, `state` |

### Application

| Metric | Type | Labels |
|--------|------|--------|
| `stellaiverse_errors_total` | Counter | `type`, `severity` |

### Node.js Default Metrics (via `collectDefaultMetrics`)

All standard `prom-client` default metrics are collected with the `stellaiverse_` prefix, including:
- `stellaiverse_nodejs_heap_size_used_bytes`
- `stellaiverse_nodejs_heap_size_total_bytes`
- `stellaiverse_nodejs_eventloop_lag_seconds`
- `stellaiverse_nodejs_active_handles_total`
- `stellaiverse_process_cpu_seconds_total`
- and more...

## Adding New Metrics

1. Import the registry and create the metric in `src/config/metrics.ts`:

```typescript
import * as client from "prom-client";
import { register } from "./metrics";

export const myCounter = new client.Counter({
  name: "stellaiverse_my_event_total",
  help: "Total number of my events",
  labelNames: ["label_a"],
  registers: [register],
});
```

2. Import and use it anywhere in the app:

```typescript
import { myCounter } from "../config/metrics";

myCounter.inc({ label_a: "value" });
```

## Grafana Dashboard

A pre-built Grafana dashboard template is available at:

```
docs/dashboards/stellaiverse-backend.json
```

Import it into Grafana:
1. Navigate to **Dashboards → Import**
2. Upload `stellaiverse-backend.json`
3. Select your Prometheus datasource
4. Click **Import**

## Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: stellaiverse-backend
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: /metrics
    scrape_interval: 15s
```
