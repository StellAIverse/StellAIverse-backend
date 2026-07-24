import { Injectable } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { WorkerHealthService } from "../services/worker-health.service";

/**
 * Terminus health indicator for the Workers module.
 * Plugs into the existing /health/readiness endpoint in HealthModule.
 */
@Injectable()
export class WorkerHealthIndicator extends HealthIndicator {
  constructor(private readonly workerHealthService: WorkerHealthService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const report = await this.workerHealthService.getHealthReport();

    const result = this.getStatus(key, report.status !== "unhealthy", {
      status: report.status,
      queues: report.queues.map((q) => ({
        name: q.name,
        status: q.status,
        waiting: q.waiting,
        active: q.active,
        failed: q.failed,
      })),
      deadLetter: report.deadLetter,
    });

    if (report.status === "unhealthy") {
      throw new HealthCheckError("Workers unhealthy", result);
    }

    return result;
  }
}
