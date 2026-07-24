import {
  Process,
  Processor,
  OnQueueFailed,
  OnQueueCompleted,
  OnQueueStalled,
} from "@nestjs/bull";
import { Logger } from "@nestjs/common";
import { Job } from "bull";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JobEntity } from "../entities/job.entity";
import { DeadLetterService } from "../services/dead-letter.service";
import { WorkerMetricsService } from "../services/worker-metrics.service";
import { IdempotencyService } from "../services/idempotency.service";
import { AnalyticsJobPayload } from "../workers.service";

export interface AggregationResult {
  eventType: string;
  aggregationType: string;
  startDate: string;
  endDate: string;
  value: number;
  dimensions?: Record<string, Record<string, number>>;
  recordCount: number;
  processedAt: string;
  durationMs: number;
}

@Processor("analytics-jobs")
export class AnalyticsWorkerProcessor {
  private readonly logger = new Logger(AnalyticsWorkerProcessor.name);

  constructor(
    @InjectRepository(JobEntity)
    private jobRepository: Repository<JobEntity>,
    private readonly deadLetterService: DeadLetterService,
    private readonly metricsService: WorkerMetricsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Main job processor — aggregates analytics data for the specified window
   */
  @Process()
  async handleAnalyticsJob(
    job: Job<AnalyticsJobPayload>,
  ): Promise<AggregationResult> {
    const startTime = Date.now();
    this.logger.log(
      `Processing analytics job ${job.id} — ${job.data.aggregationType}(${job.data.eventType}) ` +
        `from ${job.data.startDate} to ${job.data.endDate} (attempt ${job.attemptsMade + 1})`,
    );

    await job.progress(10);

    // Validate required fields
    if (!job.data.eventType) {
      throw new Error("eventType is required for analytics jobs");
    }
    if (!job.data.startDate || !job.data.endDate) {
      throw new Error("startDate and endDate are required for analytics jobs");
    }

    const start = new Date(job.data.startDate);
    const end = new Date(job.data.endDate);

    if (start >= end) {
      throw new Error("startDate must be before endDate");
    }

    await this.updateJobStatus(String(job.id), "active");
    await job.progress(20);

    // ── Phase 1: Fetch raw event data ──────────────────────────────────────────
    // In a real implementation this queries your events table / data warehouse.
    // Here we simulate the pipeline with realistic timing.
    const rawData = await this.fetchRawData(
      job.data.eventType,
      start,
      end,
      job.data.filters,
    );

    await job.progress(50);

    // ── Phase 2: Run aggregation ───────────────────────────────────────────────
    const aggregated = this.aggregate(
      rawData,
      job.data.aggregationType,
      job.data.dimensions,
    );

    await job.progress(80);

    // ── Phase 3: Persist result ────────────────────────────────────────────────
    await this.persistResult(job.data.eventType, aggregated);

    const duration = Date.now() - startTime;
    this.metricsService.recordJobDuration("analytics", "success", duration / 1000);

    const result: AggregationResult = {
      eventType: job.data.eventType,
      aggregationType: job.data.aggregationType,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      value: aggregated.value,
      dimensions: aggregated.dimensions,
      recordCount: rawData.length,
      processedAt: new Date().toISOString(),
      durationMs: duration,
    };

    await this.updateJobStatus(String(job.id), "completed", result);
    await job.progress(100);

    this.logger.log(
      `Analytics job ${job.id} completed — ` +
        `${job.data.aggregationType}(${job.data.eventType}) = ${aggregated.value} ` +
        `(${rawData.length} records, ${duration}ms)`,
    );

    return result;
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<AnalyticsJobPayload>, result: AggregationResult) {
    this.metricsService.recordJobCompleted("analytics");

    const jobEntity = await this.getJobEntity(String(job.id));
    if (jobEntity?.idempotencyKey) {
      await this.idempotencyService.updateIdempotencyKeyStatus(
        jobEntity.idempotencyKey,
        "completed",
        result,
      );
    }

    this.logger.debug(
      `Analytics job ${job.id} completed in ${job.finishedOn - job.processedOn}ms`,
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job<AnalyticsJobPayload>, error: Error) {
    const duration = job.finishedOn
      ? (job.finishedOn - (job.processedOn || 0)) / 1000
      : 0;

    this.metricsService.recordJobDuration("analytics", "failed", duration);
    this.metricsService.recordJobFailed("analytics", this.categorizeError(error));

    await this.updateJobStatus(String(job.id), "failed", null, error.message);

    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      await this.deadLetterService.moveToDeadLetter(job, "analytics", error.message);

      const jobEntity = await this.getJobEntity(String(job.id));
      if (jobEntity?.idempotencyKey) {
        await this.idempotencyService.updateIdempotencyKeyStatus(
          jobEntity.idempotencyKey,
          "failed",
        );
      }

      this.logger.warn(
        `Analytics job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`,
      );
    }
  }

  @OnQueueStalled()
  async onStalled(job: Job<AnalyticsJobPayload>) {
    this.logger.warn(`Analytics job ${job.id} stalled — will be re-queued`);
    this.metricsService.recordJobFailed("analytics", "stalled");
  }

  // ─── Private pipeline steps ──────────────────────────────────────────────────

  /**
   * Fetch raw events from the data store.
   * Replace this stub with actual DB/warehouse queries in production.
   */
  private async fetchRawData(
    eventType: string,
    start: Date,
    end: Date,
    filters?: Record<string, any>,
  ): Promise<Array<{ timestamp: Date; value: number; dimensions: Record<string, string> }>> {
    // Simulate I/O delay proportional to time window
    const windowMs = end.getTime() - start.getTime();
    const simulatedIoMs = Math.min(500, windowMs / (1000 * 60 * 60)); // max 500 ms
    await this.sleep(simulatedIoMs);

    // Produce synthetic data for demonstration
    const recordCount = Math.floor(Math.random() * 900) + 100;
    const countries = ["US", "GB", "DE", "FR", "JP"];
    const devices = ["mobile", "desktop", "tablet"];

    return Array.from({ length: recordCount }, (_, i) => ({
      timestamp: new Date(
        start.getTime() + Math.random() * (end.getTime() - start.getTime()),
      ),
      value: Math.random() * 100,
      dimensions: {
        country: countries[i % countries.length],
        deviceType: devices[i % devices.length],
        ...this.applyFilters(filters),
      },
    }));
  }

  /**
   * Run the requested aggregation over the raw records.
   */
  private aggregate(
    records: Array<{ value: number; dimensions: Record<string, string> }>,
    type: string,
    dimensions?: string[],
  ): { value: number; dimensions?: Record<string, Record<string, number>> } {
    const values = records.map((r) => r.value);

    let value: number;
    switch (type) {
      case "sum":
        value = values.reduce((a, b) => a + b, 0);
        break;
      case "count":
        value = values.length;
        break;
      case "avg":
        value = values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0;
        break;
      case "min":
        value = values.length > 0 ? Math.min(...values) : 0;
        break;
      case "max":
        value = values.length > 0 ? Math.max(...values) : 0;
        break;
      default:
        value = values.length;
    }

    // Break down by requested dimensions
    let dimensionBreakdown: Record<string, Record<string, number>> | undefined;
    if (dimensions?.length) {
      dimensionBreakdown = {};
      for (const dim of dimensions) {
        dimensionBreakdown[dim] = {};
        for (const record of records) {
          const key = record.dimensions[dim] ?? "unknown";
          if (dimensionBreakdown[dim][key] === undefined) {
            dimensionBreakdown[dim][key] = 0;
          }
          dimensionBreakdown[dim][key] +=
            type === "count" ? 1 : record.value;
        }
      }
    }

    return { value: Math.round(value * 100) / 100, dimensions: dimensionBreakdown };
  }

  /**
   * Persist aggregated result.
   * Replace with actual write to DB / analytics store in production.
   */
  private async persistResult(
    eventType: string,
    result: { value: number },
  ): Promise<void> {
    await this.sleep(50); // simulate write
    this.logger.debug(
      `Persisted analytics result for ${eventType}: ${result.value}`,
    );
  }

  private applyFilters(
    filters?: Record<string, any>,
  ): Record<string, string> {
    if (!filters) return {};
    return Object.fromEntries(
      Object.entries(filters).map(([k, v]) => [k, String(v)]),
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async updateJobStatus(
    bullJobId: string,
    status: string,
    result?: any,
    error?: string,
  ): Promise<void> {
    try {
      const updates: Partial<JobEntity> = { status };
      if (status === "active") updates.processedAt = new Date();
      else if (status === "completed") {
        updates.completedAt = new Date();
        updates.result = result;
      } else if (status === "failed") {
        updates.failedAt = new Date();
        updates.error = error;
      }
      await this.jobRepository.update({ bullJobId }, updates);
    } catch (err) {
      this.logger.warn(
        `Could not update job status for Bull ID ${bullJobId}: ${err.message}`,
      );
    }
  }

  private async getJobEntity(bullJobId: string): Promise<JobEntity | null> {
    return this.jobRepository.findOne({ where: { bullJobId } });
  }

  private categorizeError(error: Error): string {
    const msg = error.message.toLowerCase();
    if (msg.includes("timeout")) return "timeout";
    if (msg.includes("validation") || msg.includes("required")) return "validation";
    if (msg.includes("database") || msg.includes("query")) return "database";
    if (msg.includes("startdate") || msg.includes("enddate")) return "invalid_range";
    return "unknown";
  }
}
