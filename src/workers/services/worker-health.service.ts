import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { WorkerMetricsService } from "./worker-metrics.service";

export type WorkerStatus = "healthy" | "degraded" | "unhealthy";

export interface QueueHealthDetail {
  name: string;
  status: WorkerStatus;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  redisConnected: boolean;
}

export interface WorkersHealthReport {
  status: WorkerStatus;
  timestamp: string;
  uptime: number;
  queues: QueueHealthDetail[];
  deadLetter: {
    total: number;
  };
}

@Injectable()
export class WorkerHealthService {
  private readonly logger = new Logger(WorkerHealthService.name);

  /** Threshold: mark queue "degraded" when waiting jobs exceed this value */
  private readonly DEGRADED_QUEUE_THRESHOLD = 500;
  /** Threshold: mark queue "unhealthy" when waiting jobs exceed this value */
  private readonly UNHEALTHY_QUEUE_THRESHOLD = 2000;

  constructor(
    @InjectQueue("email-jobs") private emailQueue: Queue,
    @InjectQueue("webhook-jobs") private webhookQueue: Queue,
    @InjectQueue("analytics-jobs") private analyticsQueue: Queue,
    @InjectQueue("worker-dead-letter") private dlqQueue: Queue,
    private readonly metricsService: WorkerMetricsService,
  ) {}

  /**
   * Run a full health check across all worker queues and return a report.
   */
  async getHealthReport(): Promise<WorkersHealthReport> {
    const namedQueues = [
      { name: "email", queue: this.emailQueue },
      { name: "webhook", queue: this.webhookQueue },
      { name: "analytics", queue: this.analyticsQueue },
    ];

    const queueDetails = await Promise.all(
      namedQueues.map(({ name, queue }) => this.checkQueue(name, queue)),
    );

    // Sync depth metrics
    for (const detail of queueDetails) {
      this.metricsService.setQueueDepth(detail.name, "waiting", detail.waiting);
      this.metricsService.setQueueDepth(detail.name, "active", detail.active);
      this.metricsService.setQueueDepth(detail.name, "failed", detail.failed);
      this.metricsService.setQueueDepth(detail.name, "delayed", detail.delayed);
      this.metricsService.setActiveWorkers(detail.name, detail.active);
    }

    const dlqCount = await this.dlqQueue.count().catch(() => -1);
    const overallStatus = this.deriveOverallStatus(queueDetails);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      queues: queueDetails,
      deadLetter: { total: dlqCount },
    };
  }

  /**
   * Quick liveness check — returns true when all Redis connections respond.
   */
  async isAlive(): Promise<boolean> {
    try {
      await this.emailQueue.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async checkQueue(
    name: string,
    queue: Queue,
  ): Promise<QueueHealthDetail> {
    let redisConnected = false;

    try {
      await queue.client.ping();
      redisConnected = true;
    } catch {
      // Redis unreachable — queue is unhealthy
    }

    if (!redisConnected) {
      return {
        name,
        status: "unhealthy",
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
        redisConnected: false,
      };
    }

    const [waiting, active, completed, failed, delayed, paused] =
      await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.getPausedCount(),
      ]);

    let status: WorkerStatus = "healthy";
    if (waiting > this.UNHEALTHY_QUEUE_THRESHOLD) {
      status = "unhealthy";
    } else if (waiting > this.DEGRADED_QUEUE_THRESHOLD || failed > 100) {
      status = "degraded";
    }

    return {
      name,
      status,
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
      redisConnected,
    };
  }

  private deriveOverallStatus(queues: QueueHealthDetail[]): WorkerStatus {
    if (queues.some((q) => q.status === "unhealthy")) return "unhealthy";
    if (queues.some((q) => q.status === "degraded")) return "degraded";
    return "healthy";
  }
}
