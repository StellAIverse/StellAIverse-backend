import { Injectable, OnModuleInit } from "@nestjs/common";
import { Counter, Gauge, Histogram } from "prom-client";
import { register } from "../../config/metrics";

/**
 * Prometheus metrics for the Workers module.
 * Reuses the shared global registry from src/config/metrics.ts
 * so all worker metrics appear on the existing /metrics endpoint.
 */
@Injectable()
export class WorkerMetricsService implements OnModuleInit {
  // ── Counters ───────────────────────────────────────────────────────────────

  private jobsCreatedTotal: Counter<string>;
  private jobsCompletedTotal: Counter<string>;
  private jobsFailedTotal: Counter<string>;
  private dlqEntriesTotal: Counter<string>;
  private dlqRetriesTotal: Counter<string>;

  // ── Gauges ─────────────────────────────────────────────────────────────────

  private workerQueueDepth: Gauge<string>;
  private activeWorkers: Gauge<string>;

  // ── Histograms ─────────────────────────────────────────────────────────────

  private jobProcessingDuration: Histogram<string>;

  onModuleInit() {
    this.jobsCreatedTotal = new Counter({
      name: "stellaiverse_worker_jobs_created_total",
      help: "Total background jobs created",
      labelNames: ["worker_type"],
      registers: [register],
    });

    this.jobsCompletedTotal = new Counter({
      name: "stellaiverse_worker_jobs_completed_total",
      help: "Total background jobs completed successfully",
      labelNames: ["worker_type"],
      registers: [register],
    });

    this.jobsFailedTotal = new Counter({
      name: "stellaiverse_worker_jobs_failed_total",
      help: "Total background jobs that failed",
      labelNames: ["worker_type", "failure_reason"],
      registers: [register],
    });

    this.dlqEntriesTotal = new Counter({
      name: "stellaiverse_worker_dlq_entries_total",
      help: "Total jobs moved into the dead-letter queue",
      labelNames: ["worker_type"],
      registers: [register],
    });

    this.dlqRetriesTotal = new Counter({
      name: "stellaiverse_worker_dlq_retries_total",
      help: "Total DLQ jobs re-queued for retry",
      labelNames: ["worker_type"],
      registers: [register],
    });

    this.workerQueueDepth = new Gauge({
      name: "stellaiverse_worker_queue_depth",
      help: "Current number of jobs in each worker queue",
      labelNames: ["worker_type", "state"],
      registers: [register],
    });

    this.activeWorkers = new Gauge({
      name: "stellaiverse_worker_active_count",
      help: "Number of currently active worker processes per queue",
      labelNames: ["worker_type"],
      registers: [register],
    });

    this.jobProcessingDuration = new Histogram({
      name: "stellaiverse_worker_job_duration_seconds",
      help: "Time taken to process a background job (seconds)",
      labelNames: ["worker_type", "status"],
      buckets: [0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
      registers: [register],
    });
  }

  recordJobCreated(workerType: string): void {
    this.jobsCreatedTotal?.inc({ worker_type: workerType });
  }

  recordJobCompleted(workerType: string): void {
    this.jobsCompletedTotal?.inc({ worker_type: workerType });
  }

  recordJobFailed(workerType: string, failureReason: string): void {
    this.jobsFailedTotal?.inc({
      worker_type: workerType,
      failure_reason: failureReason,
    });
  }

  recordJobDuration(workerType: string, status: string, durationSeconds: number): void {
    this.jobProcessingDuration?.observe(
      { worker_type: workerType, status },
      durationSeconds,
    );
  }

  recordDlqEntry(workerType: string): void {
    this.dlqEntriesTotal?.inc({ worker_type: workerType });
  }

  recordDlqRetry(workerType: string): void {
    this.dlqRetriesTotal?.inc({ worker_type: workerType });
  }

  setQueueDepth(workerType: string, state: string, value: number): void {
    this.workerQueueDepth?.set({ worker_type: workerType, state }, value);
  }

  setActiveWorkers(workerType: string, value: number): void {
    this.activeWorkers?.set({ worker_type: workerType }, value);
  }
}
