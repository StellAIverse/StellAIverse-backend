import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { WorkersService } from "./workers.service";
import { DeadLetterService } from "./services/dead-letter.service";
import { IdempotencyService } from "./services/idempotency.service";
import { WorkerHealthService } from "./services/worker-health.service";

/**
 * Admin endpoints for managing the worker system.
 * These endpoints should typically be restricted to admin users.
 */
@ApiTags("Workers Admin")
@Controller("workers/admin")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("JWT-auth")
export class WorkersAdminController {
  constructor(
    @InjectQueue("email-jobs") private emailQueue: Queue,
    @InjectQueue("webhook-jobs") private webhookQueue: Queue,
    @InjectQueue("analytics-jobs") private analyticsQueue: Queue,
    @InjectQueue("worker-dead-letter") private dlqQueue: Queue,
    private readonly workersService: WorkersService,
    private readonly deadLetterService: DeadLetterService,
    private readonly idempotencyService: IdempotencyService,
    private readonly healthService: WorkerHealthService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Dead-Letter Queue Management
  // ────────────────────────────────────────────────────────────────────────────

  @Get("dlq")
  @ApiOperation({
    summary: "List dead-letter queue jobs",
    description: "Returns all jobs that failed permanently and were moved to the DLQ.",
  })
  @ApiQuery({ name: "start", required: false, type: Number })
  @ApiQuery({ name: "end", required: false, type: Number })
  @ApiResponse({ status: 200, description: "DLQ job list" })
  async listDlqJobs(
    @Query("start") start?: number,
    @Query("end") end?: number,
  ) {
    return this.deadLetterService.listDeadLetterJobs(
      start ? Number(start) : 0,
      end ? Number(end) : 49,
    );
  }

  @Get("dlq/stats")
  @ApiOperation({
    summary: "Get DLQ statistics",
    description: "Returns counts and breakdown of DLQ jobs by worker type.",
  })
  @ApiResponse({ status: 200, description: "DLQ statistics" })
  async getDlqStats() {
    return this.deadLetterService.getStats();
  }

  @Post("dlq/:bullJobId/retry")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Retry a DLQ job",
    description: "Re-enqueues a DLQ job onto its original worker queue.",
  })
  @ApiResponse({ status: 201, description: "Job re-queued successfully" })
  @ApiResponse({ status: 404, description: "DLQ job not found" })
  async retryDlqJob(@Param("bullJobId") bullJobId: string) {
    const dlqJob = await this.dlqQueue.getJob(bullJobId);
    if (!dlqJob) {
      throw new Error(`DLQ job ${bullJobId} not found`);
    }

    const entry = dlqJob.data;
    let targetQueue: Queue;

    switch (entry.workerType) {
      case "email":
        targetQueue = this.emailQueue;
        break;
      case "webhook":
        targetQueue = this.webhookQueue;
        break;
      case "analytics":
        targetQueue = this.analyticsQueue;
        break;
      default:
        throw new Error(`Unknown worker type: ${entry.workerType}`);
    }

    const newJobId = await this.deadLetterService.retryDeadLetterJob(
      bullJobId,
      targetQueue,
    );

    return {
      message: `DLQ job ${bullJobId} re-queued as ${newJobId}`,
      newJobId,
    };
  }

  @Delete("dlq/:bullJobId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a DLQ job",
    description: "Removes a job from the DLQ without re-queuing.",
  })
  @ApiResponse({ status: 204, description: "DLQ job deleted" })
  @ApiResponse({ status: 404, description: "DLQ job not found" })
  async deleteDlqJob(@Param("bullJobId") bullJobId: string): Promise<void> {
    await this.deadLetterService.deleteDeadLetterJob(bullJobId);
  }

  @Delete("dlq")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Purge all DLQ jobs",
    description: "⚠️ Permanently removes all jobs from the dead-letter queue.",
  })
  @ApiResponse({
    status: 200,
    description: "DLQ purged",
    schema: {
      type: "object",
      properties: {
        message: { type: "string" },
        purged: { type: "number" },
      },
    },
  })
  async purgeDlq() {
    const purged = await this.deadLetterService.purgeDeadLetterQueue();
    return { message: `Purged ${purged} jobs from dead-letter queue`, purged };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Idempotency Management
  // ────────────────────────────────────────────────────────────────────────────

  @Get("idempotency/stats")
  @ApiOperation({
    summary: "Get idempotency key statistics",
    description: "Returns counts for processing, completed, failed, and expired keys.",
  })
  @ApiResponse({ status: 200, description: "Idempotency stats" })
  async getIdempotencyStats() {
    return this.idempotencyService.getStats();
  }

  @Post("idempotency/purge-expired")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Purge expired idempotency keys",
    description: "Cleans up idempotency keys that have passed their expiration time.",
  })
  @ApiResponse({
    status: 200,
    description: "Expired keys purged",
    schema: {
      type: "object",
      properties: {
        message: { type: "string" },
        purged: { type: "number" },
      },
    },
  })
  async purgeExpiredIdempotencyKeys() {
    const purged = await this.idempotencyService.purgeExpiredKeys();
    return { message: `Purged ${purged} expired idempotency keys`, purged };
  }

  @Delete("idempotency/:key")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete a specific idempotency key",
    description: "Removes an idempotency key from the system (admin override).",
  })
  @ApiResponse({ status: 204, description: "Idempotency key deleted" })
  async deleteIdempotencyKey(@Param("key") key: string): Promise<void> {
    await this.idempotencyService.deleteKey(key);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Queue Management
  // ────────────────────────────────────────────────────────────────────────────

  @Post("queues/:queueName/pause")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Pause a worker queue",
    description: "Stops processing new jobs in the specified queue (jobs remain in queue).",
  })
  @ApiResponse({ status: 200, description: "Queue paused" })
  async pauseQueue(@Param("queueName") queueName: string) {
    const queue = this.getQueueByName(queueName);
    await queue.pause();
    return { message: `Queue ${queueName} paused` };
  }

  @Post("queues/:queueName/resume")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Resume a paused worker queue",
    description: "Resumes processing jobs in a paused queue.",
  })
  @ApiResponse({ status: 200, description: "Queue resumed" })
  async resumeQueue(@Param("queueName") queueName: string) {
    const queue = this.getQueueByName(queueName);
    await queue.resume();
    return { message: `Queue ${queueName} resumed` };
  }

  @Post("queues/:queueName/clean")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Clean old completed jobs from a queue",
    description: "Removes completed jobs older than the specified grace period.",
  })
  @ApiQuery({
    name: "olderThanMs",
    required: false,
    type: Number,
    description: "Grace period in milliseconds (default: 86400000 = 24h)",
  })
  @ApiResponse({
    status: 200,
    description: "Old jobs cleaned",
    schema: {
      type: "object",
      properties: {
        message: { type: "string" },
        cleaned: { type: "array", items: { type: "string" } },
      },
    },
  })
  async cleanQueue(
    @Param("queueName") queueName: string,
    @Query("olderThanMs") olderThanMs?: number,
  ) {
    const queue = this.getQueueByName(queueName);
    const grace = olderThanMs ? Number(olderThanMs) : 86400000;
    const cleaned = await queue.clean(grace, "completed");
    return {
      message: `Cleaned ${cleaned.length} old jobs from ${queueName}`,
      cleaned,
    };
  }

  @Delete("queues/:queueName/empty")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Empty a worker queue",
    description: "⚠️ Removes all jobs from the specified queue (waiting, delayed, failed).",
  })
  @ApiResponse({
    status: 200,
    description: "Queue emptied",
    schema: {
      type: "object",
      properties: {
        message: { type: "string" },
      },
    },
  })
  async emptyQueue(@Param("queueName") queueName: string) {
    const queue = this.getQueueByName(queueName);
    await queue.empty();
    return { message: `Queue ${queueName} emptied` };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // System Maintenance
  // ────────────────────────────────────────────────────────────────────────────

  @Post("maintenance/clean-old-jobs")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Clean old completed jobs from database",
    description: "Removes database records for jobs completed longer than the specified period.",
  })
  @ApiQuery({
    name: "olderThanMs",
    required: false,
    type: Number,
    description: "Grace period in milliseconds (default: 86400000 = 24h)",
  })
  @ApiResponse({
    status: 200,
    description: "Old jobs cleaned",
    schema: {
      type: "object",
      properties: {
        message: { type: "string" },
        cleaned: { type: "number" },
      },
    },
  })
  async cleanOldJobs(@Query("olderThanMs") olderThanMs?: number) {
    const grace = olderThanMs ? Number(olderThanMs) : 86400000;
    const cleaned = await this.workersService.cleanOldJobs(grace);
    return { message: `Cleaned ${cleaned} old job records`, cleaned };
  }

  @Get("maintenance/health-check")
  @ApiOperation({
    summary: "Comprehensive system health check",
    description: "Runs health checks on all queues, Redis, idempotency, and DLQ.",
  })
  @ApiResponse({ status: 200, description: "Health check report" })
  async healthCheck() {
    const [workerHealth, idempotencyStats, dlqStats] = await Promise.all([
      this.healthService.getHealthReport(),
      this.idempotencyService.getStats(),
      this.deadLetterService.getStats(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      workers: workerHealth,
      idempotency: idempotencyStats,
      deadLetter: dlqStats,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Helper
  // ────────────────────────────────────────────────────────────────────────────

  private getQueueByName(name: string): Queue {
    switch (name.toLowerCase()) {
      case "email":
        return this.emailQueue;
      case "webhook":
        return this.webhookQueue;
      case "analytics":
        return this.analyticsQueue;
      case "dead-letter":
      case "dlq":
        return this.dlqQueue;
      default:
        throw new Error(`Unknown queue: ${name}`);
    }
  }
}
