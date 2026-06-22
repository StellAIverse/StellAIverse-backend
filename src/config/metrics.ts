import * as client from "prom-client";

// Use the global default registry singleton exported by prom-client
export const { register } = client;

// Default metrics (CPU, memory, event loop, GC, etc.)
client.collectDefaultMetrics({
  register,
  prefix: "stellaiverse_",
});

// ── HTTP metrics ──────────────────────────────────────────────────────────────

export const httpRequestDuration = new client.Histogram({
  name: "stellaiverse_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.5, 1, 3, 5, 10],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: "stellaiverse_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const httpRequestsInProgress = new client.Gauge({
  name: "stellaiverse_http_requests_in_progress",
  help: "Number of HTTP requests currently in progress",
  labelNames: ["method", "route"],
  registers: [register],
});

export const httpErrorTotal = new client.Counter({
  name: "stellaiverse_http_errors_total",
  help: "Total number of HTTP error responses",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

// ── Database metrics ──────────────────────────────────────────────────────────

export const databaseQueryDuration = new client.Histogram({
  name: "stellaiverse_database_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "table"],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

export const activeConnections = new client.Gauge({
  name: "stellaiverse_active_connections",
  help: "Number of active connections",
  labelNames: ["type"],
  registers: [register],
});

// ── Auth metrics ──────────────────────────────────────────────────────────────

export const authAttemptsTotal = new client.Counter({
  name: "stellaiverse_auth_attempts_total",
  help: "Total number of authentication attempts",
  labelNames: ["method"],
  registers: [register],
});

export const authSuccessTotal = new client.Counter({
  name: "stellaiverse_auth_success_total",
  help: "Total number of successful authentications",
  labelNames: ["method"],
  registers: [register],
});

export const authFailureTotal = new client.Counter({
  name: "stellaiverse_auth_failures_total",
  help: "Total number of failed authentication attempts",
  labelNames: ["method", "reason"],
  registers: [register],
});

// ── Business metrics ──────────────────────────────────────────────────────────

export const userSignups = new client.Counter({
  name: "stellaiverse_user_signups_total",
  help: "Total number of user signups",
  labelNames: ["method"],
  registers: [register],
});

export const activeUsers = new client.Gauge({
  name: "stellaiverse_active_users",
  help: "Number of currently active users",
  registers: [register],
});

// ── Job queue metrics ─────────────────────────────────────────────────────────

export const jobDuration = new client.Histogram({
  name: "stellaiverse_job_duration_seconds",
  help: "Duration of compute job processing in seconds",
  labelNames: ["job_type", "status"],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
  registers: [register],
});

export const jobSuccessTotal = new client.Counter({
  name: "stellaiverse_job_success_total",
  help: "Total number of successfully completed jobs",
  labelNames: ["job_type"],
  registers: [register],
});

export const jobFailureTotal = new client.Counter({
  name: "stellaiverse_job_failure_total",
  help: "Total number of failed jobs",
  labelNames: ["job_type", "failure_reason"],
  registers: [register],
});

export const queueLength = new client.Gauge({
  name: "stellaiverse_queue_length",
  help: "Number of jobs in various queue states",
  labelNames: ["queue_name", "state"],
  registers: [register],
});

export const errorTotal = new client.Counter({
  name: "stellaiverse_errors_total",
  help: "Total number of application errors",
  labelNames: ["type", "severity"],
  registers: [register],
});
