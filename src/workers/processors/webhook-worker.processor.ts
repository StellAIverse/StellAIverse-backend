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
import { HttpService } from "@nestjs/axios";
import { firstValueFrom, timeout } from "rxjs";
import { JobEntity } from "../entities/job.entity";
import { DeadLetterService } from "../services/dead-letter.service";
import { WorkerMetricsService } from "../services/worker-metrics.service";
import { IdempotencyService } from "../services/idempotency.service";
import { WebhookJobPayload } from "../workers.service";

@Processor("webhook-jobs")
export class WebhookWorkerProcessor {
  private readonly logger = new Logger(WebhookWorkerProcessor.name);

  constructor(
    @InjectRepository(JobEntity)
    private jobRepository: Repository<JobEntity>,
    private readonly httpService: HttpService,
    private readonly deadLetterService: DeadLetterService,
    private readonly metricsService: WorkerMetricsService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Main job processor — delivers webhook with retry-on-status logic
   */
  @Process()
  async handleWebhookJob(job: Job<WebhookJobPayload>): Promise<any> {
    const startTime = Date.now();
    this.logger.log(
      `Processing webhook job ${job.id} → ${job.data.method} ${job.data.url} (attempt ${job.attemptsMade + 1})`,
    );

    await job.progress(10);

    // Validate payload
    if (!job.data.url) {
      throw new Error("Webhook URL is required");
    }

    await this.updateJobStatus(String(job.id), "active");

    await job.progress(30);

    const timeoutMs = job.data.timeout ?? 30000;
    const retryOn = job.data.retryOn ?? [500, 502, 503, 504, 429];

    let response: any;

    try {
      const requestConfig = {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "StellAIverse-Webhook/1.0",
          "X-Webhook-Job-Id": String(job.id),
          "X-Webhook-Attempt": String(job.attemptsMade + 1),
          ...job.data.headers,
        },
        timeout: timeoutMs,
      };

      await job.progress(50);

      const observable = this.buildRequest(
        job.data.method,
        job.data.url,
        job.data.body,
        requestConfig,
      ).pipe(timeout(timeoutMs));

      response = await firstValueFrom(observable);
    } catch (err) {
      // Convert axios/timeout errors to retryable errors
      const statusCode = err.response?.status;
      const isRetryableStatus = statusCode && retryOn.includes(statusCode);
      const isNetworkError =
        !statusCode &&
        (err.code === "ECONNREFUSED" ||
          err.code === "ENOTFOUND" ||
          err.code === "ETIMEDOUT" ||
          err.name === "TimeoutError");

      if (isRetryableStatus || isNetworkError) {
        const reason = isRetryableStatus
          ? `HTTP ${statusCode}`
          : `Network error: ${err.code || err.name}`;
        this.logger.warn(
          `Webhook job ${job.id} will retry — ${reason}`,
        );
        throw err; // Let Bull handle retry
      }

      // Non-retryable (4xx client errors except 429)
      this.logger.error(
        `Webhook job ${job.id} non-retryable error: ${err.message}`,
      );
      throw err;
    }

    await job.progress(90);

    // Check response status against retry list
    if (retryOn.includes(response.status)) {
      throw new Error(
        `Webhook returned retryable status ${response.status}`,
      );
    }

    const duration = (Date.now() - startTime) / 1000;
    this.metricsService.recordJobDuration("webhook", "success", duration);

    const result = {
      statusCode: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.data,
      deliveredAt: new Date().toISOString(),
    };

    await this.updateJobStatus(String(job.id), "completed", result);

    await job.progress(100);

    this.logger.log(
      `Webhook job ${job.id} delivered successfully. Status: ${response.status}`,
    );

    return result;
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<WebhookJobPayload>, result: any) {
    this.metricsService.recordJobCompleted("webhook");

    const jobEntity = await this.getJobEntity(String(job.id));
    if (jobEntity?.idempotencyKey) {
      await this.idempotencyService.updateIdempotencyKeyStatus(
        jobEntity.idempotencyKey,
        "completed",
        result,
      );
    }

    this.logger.debug(
      `Webhook job ${job.id} completed in ${job.finishedOn - job.processedOn}ms`,
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job<WebhookJobPayload>, error: Error) {
    const duration = job.finishedOn
      ? (job.finishedOn - (job.processedOn || 0)) / 1000
      : 0;

    this.metricsService.recordJobDuration("webhook", "failed", duration);
    this.metricsService.recordJobFailed("webhook", this.categorizeError(error));

    await this.updateJobStatus(String(job.id), "failed", null, error.message);

    if (job.attemptsMade >= (job.opts.attempts || 5)) {
      await this.deadLetterService.moveToDeadLetter(job, "webhook", error.message);

      const jobEntity = await this.getJobEntity(String(job.id));
      if (jobEntity?.idempotencyKey) {
        await this.idempotencyService.updateIdempotencyKeyStatus(
          jobEntity.idempotencyKey,
          "failed",
        );
      }

      this.logger.warn(
        `Webhook job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`,
      );
    } else {
      this.logger.warn(
        `Webhook job ${job.id} failed (attempt ${job.attemptsMade}): ${error.message}`,
      );
    }
  }

  @OnQueueStalled()
  async onStalled(job: Job<WebhookJobPayload>) {
    this.logger.warn(
      `Webhook job ${job.id} stalled — will be re-queued automatically`,
    );
    this.metricsService.recordJobFailed("webhook", "stalled");
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private buildRequest(
    method: string,
    url: string,
    body: any,
    config: any,
  ) {
    switch (method.toUpperCase()) {
      case "GET":
        return this.httpService.get(url, config);
      case "POST":
        return this.httpService.post(url, body, config);
      case "PUT":
        return this.httpService.put(url, body, config);
      case "PATCH":
        return this.httpService.patch(url, body, config);
      case "DELETE":
        return this.httpService.delete(url, config);
      default:
        return this.httpService.post(url, body, config);
    }
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
    if (msg.includes("timeout") || (error as any).code === "ETIMEDOUT")
      return "timeout";
    if (msg.includes("connect") || (error as any).code === "ECONNREFUSED")
      return "connection_refused";
    if ((error as any).code === "ENOTFOUND") return "dns_failure";
    if (msg.includes("429") || msg.includes("rate limit")) return "rate_limited";
    if (msg.includes("5")) return "server_error";
    return "unknown";
  }
}
