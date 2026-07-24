import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
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
import { JwtAuthGuard } from "../auth/jwt.guard";
import { WorkersService } from "./workers.service";
import { WorkerHealthService } from "./services/worker-health.service";
import { CreateEmailJobDto } from "./dto/create-email-job.dto";
import { CreateWebhookJobDto } from "./dto/create-webhook-job.dto";
import { CreateAnalyticsJobDto } from "./dto/create-analytics-job.dto";
import { JobStatusDto, QueueStatsResponseDto } from "./dto/job-status.dto";

@ApiTags("Workers")
@Controller("workers")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("JWT-auth")
export class WorkersController {
  constructor(
    private readonly workersService: WorkersService,
    private readonly healthService: WorkerHealthService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Job Creation Endpoints
  // ────────────────────────────────────────────────────────────────────────────

  @Post("email")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Enqueue an email delivery job",
    description:
      "Adds an email to the delivery queue with retry support and idempotency protection.",
  })
  @ApiResponse({
    status: 201,
    description: "Email job created successfully",
    type: JobStatusDto,
  })
  @ApiResponse({ status: 400, description: "Invalid email payload" })
  async createEmailJob(
    @Body() dto: CreateEmailJobDto,
  ): Promise<JobStatusDto> {
    const { to, subject, body, html, from, cc, bcc, attachments, ...options } =
      dto;

    return this.workersService.addEmailJob(
      { to, subject, body, html, from, cc, bcc, attachments },
      options,
    );
  }

  @Post("webhook")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Enqueue a webhook delivery job",
    description:
      "Adds a webhook HTTP request to the delivery queue with configurable retries and timeouts.",
  })
  @ApiResponse({
    status: 201,
    description: "Webhook job created successfully",
    type: JobStatusDto,
  })
  @ApiResponse({ status: 400, description: "Invalid webhook payload" })
  async createWebhookJob(
    @Body() dto: CreateWebhookJobDto,
  ): Promise<JobStatusDto> {
    const { url, method, headers, body, retryOn, timeout, ...options } = dto;

    return this.workersService.addWebhookJob(
      { url, method, headers, body, retryOn, timeout },
      options,
    );
  }

  @Post("analytics")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Enqueue an analytics aggregation job",
    description:
      "Schedules an analytics aggregation for the specified event type and time range.",
  })
  @ApiResponse({
    status: 201,
    description: "Analytics job created successfully",
    type: JobStatusDto,
  })
  @ApiResponse({ status: 400, description: "Invalid analytics payload" })
  async createAnalyticsJob(
    @Body() dto: CreateAnalyticsJobDto,
  ): Promise<JobStatusDto> {
    const {
      eventType,
      aggregationType,
      startDate,
      endDate,
      dimensions,
      filters,
      ...options
    } = dto;

    return this.workersService.addAnalyticsJob(
      { eventType, aggregationType, startDate, endDate, dimensions, filters },
      options,
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Job Inspection & Management
  // ────────────────────────────────────────────────────────────────────────────

  @Get("jobs/:id")
  @ApiOperation({
    summary: "Get job status by ID",
    description: "Returns the current status and details of a background job.",
  })
  @ApiResponse({
    status: 200,
    description: "Job status retrieved",
    type: JobStatusDto,
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  async getJob(@Param("id") id: string): Promise<JobStatusDto> {
    const job = await this.workersService.getJobStatus(id);
    if (!job) {
      throw new Error(`Job ${id} not found`);
    }
    return job;
  }

  @Get("jobs")
  @ApiOperation({
    summary: "List jobs with optional filtering",
    description: "Returns a paginated list of background jobs.",
  })
  @ApiQuery({
    name: "jobType",
    required: false,
    enum: ["email", "webhook", "analytics"],
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["waiting", "active", "completed", "failed", "delayed", "paused"],
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: "List of jobs",
    schema: {
      type: "object",
      properties: {
        jobs: { type: "array", items: { $ref: "#/components/schemas/JobStatusDto" } },
        total: { type: "number" },
      },
    },
  })
  async listJobs(
    @Query("jobType") jobType?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ): Promise<{ jobs: JobStatusDto[]; total: number }> {
    return this.workersService.getJobs({
      jobType,
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Delete("jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Cancel a job",
    description: "Removes a job from the queue (if not yet completed).",
  })
  @ApiResponse({ status: 204, description: "Job cancelled" })
  @ApiResponse({ status: 404, description: "Job not found" })
  async cancelJob(@Param("id") id: string): Promise<void> {
    await this.workersService.cancelJob(id);
  }

  @Post("jobs/:id/retry")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Retry a failed job",
    description:
      "Re-enqueues a failed job with the same payload and settings.",
  })
  @ApiResponse({
    status: 201,
    description: "Job retried successfully",
    type: JobStatusDto,
  })
  @ApiResponse({ status: 400, description: "Job is not in failed state" })
  async retryJob(@Param("id") id: string): Promise<JobStatusDto> {
    return this.workersService.retryJob(id);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Monitoring & Stats
  // ────────────────────────────────────────────────────────────────────────────

  @Get("stats")
  @ApiOperation({
    summary: "Get queue statistics",
    description:
      "Returns current queue depths, active jobs, and completed/failed counts for all worker queues.",
  })
  @ApiResponse({
    status: 200,
    description: "Queue statistics",
    type: QueueStatsResponseDto,
  })
  async getStats(): Promise<QueueStatsResponseDto> {
    return this.workersService.getQueueStats();
  }

  @Get("health")
  @ApiOperation({
    summary: "Check worker health status",
    description:
      "Returns health status for all worker queues including Redis connectivity and queue depths.",
  })
  @ApiResponse({
    status: 200,
    description: "Workers health report",
  })
  async getHealth() {
    return this.healthService.getHealthReport();
  }
}
