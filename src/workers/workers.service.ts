import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { InjectRepository } from "@nestjs/typeorm";
import { Queue, Job, JobOptions } from "bull";
import { Repository } from "typeorm";
import { JobEntity } from "./entities/job.entity";
import { IdempotencyService } from "./services/idempotency.service";
import { WorkerMetricsService } from "./services/worker-metrics.service";
import { CreateJobDto } from "./dto/create-job.dto";
import { JobStatusDto } from "./dto/job-status.dto";

export interface EmailJobPayload {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface WebhookJobPayload {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: any;
  retryOn?: number[];
  timeout?: number;
}

export interface AnalyticsJobPayload {
  eventType: string;
  aggregationType: "sum" | "count" | "avg" | "min" | "max";
  startDate: Date;
  endDate: Date;
  dimensions?: string[];
  filters?: Record<string, any>;
}

@Injectable()
export class WorkersService {
  private readonly logger = new Logger(WorkersService.name);

  constructor(
    @InjectQueue("email-jobs") private emailQueue: Queue,
    @InjectQueue("webhook-jobs") private webhookQueue: Queue,
    @InjectQueue("analytics-jobs") private analyticsQueue: Queue,
    @InjectQueue("worker-dead-letter") private deadLetterQueue: Queue,
    @InjectRepository(JobEntity)
    private jobRepository: Repository<JobEntity>,
    private readonly idempotencyService: IdempotencyService,
    private readonly metricsService: WorkerMetricsService,
  ) {}

  /**
   * Add an email job to the queue
   */
  async addEmailJob(
    payload: EmailJobPayload,
    options?: CreateJobDto,
  ): Promise<JobStatusDto> {
    return this.addJob("email", payload, options);
  }

  /**
   * Add a webhook job to the queue
   */
  async addWebhookJob(
    payload: WebhookJobPayload,
    options?: CreateJobDto,
  ): Promise<JobStatusDto> {
    return this.addJob("webhook", payload, options);
  }

  /**
   * Add an analytics job to the queue
   */
  async addAnalyticsJob(
    payload: AnalyticsJobPayload,
    options?: CreateJobDto,
  ): Promise<JobStatusDto> {
    return this.addJob("analytics", payload, options);
  }

  /**
   * Generic method to add any job type
   */
  private async addJob(
    jobType: "email" | "webhook" | "analytics",
    payload: any,
    options?: CreateJobDto,
  ): Promise<JobStatusDto> {
    const idempotencyKey = options?.idempotencyKey;

    // Check for existing job with same idempotency key
    if (idempotencyKey) {
      const existing = await this.idempotencyService.checkIdempotency(
        idempotencyKey,
        jobType,
      );
      
      if (existing) {
        this.logger.log(
          `Job with idempotency key ${idempotencyKey} already exists: ${existing.jobId}`,
        );
        
        // Return the existing job status
        const existingJob = await this.getJobStatus(existing.jobId);
        if (existingJob) {
          return existingJob;
        }
      }
    }

    // Select the appropriate queue
    const queue = this.getQueue(jobType);

    // Prepare job options
    const jobOptions: JobOptions = {
      priority: options?.priority,
      delay: options?.delay,
      attempts: options?.maxAttempts,
      backoff: options?.backoff,
      jobId: options?.jobId,
    };

    // Create database record first
    const jobEntity = this.jobRepository.create({
      jobType,
      payload,
      idempotencyKey,
      priority: options?.priority || 10,
      maxAttempts: options?.maxAttempts || 3,
      metadata: options?.metadata || {},
      scheduledAt: options?.delay ? new Date(Date.now() + options.delay) : null,
    });

    await this.jobRepository.save(jobEntity);

    try {
      // Add to Bull queue
      const bullJob = await queue.add(jobType, payload, jobOptions);

      // Update with Bull job ID
      jobEntity.bullJobId = String(bullJob.id);
      await this.jobRepository.save(jobEntity);

      // Register idempotency key
      if (idempotencyKey) {
        await this.idempotencyService.registerIdempotencyKey(
          idempotencyKey,
          jobEntity.id,
          jobType,
        );
      }

      // Record metrics
      this.metricsService.recordJobCreated(jobType);

      this.logger.log(
        `Job ${jobEntity.id} (${jobType}) added to queue with Bull ID ${bullJob.id}`,
      );

      return this.mapJobToStatus(jobEntity, bullJob);
    } catch (error) {
      // Clean up database record if queue add fails
      await this.jobRepository.remove(jobEntity);
      this.logger.error(`Failed to add job to queue: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get job status by ID
   */
  async getJobStatus(jobId: string): Promise<JobStatusDto | null> {
    const jobEntity = await this.jobRepository.findOne({
      where: { id: jobId },
    });

    if (!jobEntity) {
      return null;
    }

    // Try to get Bull job for real-time status
    if (jobEntity.bullJobId) {
      const queue = this.getQueue(jobEntity.jobType as any);
      const bullJob = await queue.getJob(jobEntity.bullJobId);

      if (bullJob) {
        return this.mapJobToStatus(jobEntity, bullJob);
      }
    }

    // Fall back to database status
    return this.mapJobToStatus(jobEntity);
  }

  /**
   * Get all jobs with filtering
   */
  async getJobs(filters?: {
    jobType?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ jobs: JobStatusDto[]; total: number }> {
    const queryBuilder = this.jobRepository.createQueryBuilder("job");

    if (filters?.jobType) {
      queryBuilder.andWhere("job.jobType = :jobType", {
        jobType: filters.jobType,
      });
    }

    if (filters?.status) {
      queryBuilder.andWhere("job.status = :status", { status: filters.status });
    }

    queryBuilder
      .orderBy("job.createdAt", "DESC")
      .skip(filters?.offset || 0)
      .take(filters?.limit || 50);

    const [jobs, total] = await queryBuilder.getManyAndCount();

    const jobStatuses = await Promise.all(
      jobs.map((job) => this.getJobStatus(job.id)),
    );

    return {
      jobs: jobStatuses.filter((j) => j !== null) as JobStatusDto[],
      total,
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    const jobEntity = await this.jobRepository.findOne({
      where: { id: jobId },
    });

    if (!jobEntity) {
      throw new BadRequestException(`Job ${jobId} not found`);
    }

    if (jobEntity.bullJobId) {
      const queue = this.getQueue(jobEntity.jobType as any);
      const bullJob = await queue.getJob(jobEntity.bullJobId);

      if (bullJob) {
        await bullJob.remove();
      }
    }

    jobEntity.status = "failed";
    jobEntity.error = "Job cancelled by user";
    jobEntity.failedAt = new Date();
    await this.jobRepository.save(jobEntity);

    this.logger.log(`Job ${jobId} cancelled`);
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<JobStatusDto> {
    const jobEntity = await this.jobRepository.findOne({
      where: { id: jobId },
    });

    if (!jobEntity) {
      throw new BadRequestException(`Job ${jobId} not found`);
    }

    if (jobEntity.status !== "failed") {
      throw new BadRequestException(
        `Job ${jobId} is not in failed state (current: ${jobEntity.status})`,
      );
    }

    // Create a new job with the same payload
    return this.addJob(
      jobEntity.jobType as any,
      jobEntity.payload,
      {
        priority: jobEntity.priority,
        maxAttempts: jobEntity.maxAttempts,
        metadata: {
          ...jobEntity.metadata,
          retryOf: jobId,
        },
      },
    );
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const queues = [
      { name: "email", queue: this.emailQueue },
      { name: "webhook", queue: this.webhookQueue },
      { name: "analytics", queue: this.analyticsQueue },
      { name: "dead-letter", queue: this.deadLetterQueue },
    ];

    const stats = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const [waiting, active, completed, failed, delayed, paused] =
          await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
            queue.getPausedCount(),
          ]);

        return {
          name,
          waiting,
          active,
          completed,
          failed,
          delayed,
          paused,
          total: waiting + active + delayed + paused,
        };
      }),
    );

    return { queues: stats, timestamp: new Date().toISOString() };
  }

  /**
   * Clean old completed jobs
   */
  async cleanOldJobs(olderThanMs: number = 86400000): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanMs);

    const result = await this.jobRepository
      .createQueryBuilder()
      .delete()
      .from(JobEntity)
      .where("status = :status", { status: "completed" })
      .andWhere("completed_at < :cutoffDate", { cutoffDate })
      .execute();

    this.logger.log(`Cleaned ${result.affected || 0} old completed jobs`);
    return result.affected || 0;
  }

  // Helper methods

  private getQueue(
    jobType: "email" | "webhook" | "analytics",
  ): Queue {
    switch (jobType) {
      case "email":
        return this.emailQueue;
      case "webhook":
        return this.webhookQueue;
      case "analytics":
        return this.analyticsQueue;
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
  }

  private async mapJobToStatus(
    jobEntity: JobEntity,
    bullJob?: Job,
  ): Promise<JobStatusDto> {
    let state = jobEntity.status;
    let progress = 0;

    if (bullJob) {
      state = await bullJob.getState();
      progress = (bullJob.progress() as number) || 0;
    }

    return {
      id: jobEntity.id,
      bullJobId: jobEntity.bullJobId,
      jobType: jobEntity.jobType,
      status: state,
      payload: jobEntity.payload,
      result: jobEntity.result,
      error: jobEntity.error,
      attempts: jobEntity.attempts,
      maxAttempts: jobEntity.maxAttempts,
      priority: jobEntity.priority,
      progress,
      idempotencyKey: jobEntity.idempotencyKey,
      createdAt: jobEntity.createdAt,
      processedAt: jobEntity.processedAt,
      completedAt: jobEntity.completedAt,
      failedAt: jobEntity.failedAt,
      scheduledAt: jobEntity.scheduledAt,
      metadata: jobEntity.metadata,
    };
  }
}
