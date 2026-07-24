import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bull";
import { InjectRepository } from "@nestjs/typeorm";
import { Queue, Job } from "bull";
import { Repository } from "typeorm";
import { JobEntity } from "../entities/job.entity";
import { WorkerMetricsService } from "./worker-metrics.service";

export interface DeadLetterEntry {
  originalJobId: string;
  originalBullId: string;
  jobType: string;
  workerType: string;
  payload: any;
  failureReason: string;
  attempts: number;
  failedAt: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectQueue("worker-dead-letter")
    private deadLetterQueue: Queue,
    @InjectRepository(JobEntity)
    private jobRepository: Repository<JobEntity>,
    private readonly metricsService: WorkerMetricsService,
  ) {}

  /**
   * Move a failed job into the dead-letter queue.
   */
  async moveToDeadLetter(
    job: Job,
    workerType: string,
    failureReason: string,
  ): Promise<void> {
    const entry: DeadLetterEntry = {
      originalJobId: job.data?.id || String(job.id),
      originalBullId: String(job.id),
      jobType: job.data?.type || job.name || workerType,
      workerType,
      payload: job.data,
      failureReason,
      attempts: job.attemptsMade,
      failedAt: new Date().toISOString(),
      metadata: job.data?.metadata,
    };

    await this.deadLetterQueue.add("dead-letter", entry, {
      priority: 1,
      removeOnComplete: false,
      removeOnFail: false,
    });

    this.metricsService.recordDlqEntry(workerType);
    this.logger.warn(
      `Job ${job.id} (${workerType}) moved to DLQ. Reason: ${failureReason}`,
    );
  }

  /**
   * List all entries in the dead-letter queue.
   */
  async listDeadLetterJobs(
    start = 0,
    end = 49,
  ): Promise<{ jobs: DeadLetterEntry[]; total: number }> {
    const [jobs, total] = await Promise.all([
      this.deadLetterQueue.getJobs(
        ["waiting", "active", "completed", "failed", "delayed"],
        start,
        end,
      ),
      this.deadLetterQueue.count(),
    ]);

    return {
      jobs: jobs.map((j) => j.data as DeadLetterEntry),
      total,
    };
  }

  /**
   * Retry a DLQ entry — re-enqueue on the appropriate worker queue.
   * Returns the new job ID.
   */
  async retryDeadLetterJob(
    dlqBullJobId: string,
    targetQueue: Queue,
  ): Promise<string> {
    const dlqJob = await this.deadLetterQueue.getJob(dlqBullJobId);

    if (!dlqJob) {
      throw new Error(`DLQ job ${dlqBullJobId} not found`);
    }

    const entry = dlqJob.data as DeadLetterEntry;

    // Re-enqueue on the original worker queue
    const newJob = await targetQueue.add(
      entry.jobType,
      entry.payload,
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        priority: 5,
      },
    );

    // Remove from DLQ
    await dlqJob.remove();

    this.metricsService.recordDlqRetry(entry.workerType);

    this.logger.log(
      `DLQ job ${dlqBullJobId} re-queued as ${newJob.id} on ${entry.workerType} queue`,
    );

    return String(newJob.id);
  }

  /**
   * Delete a specific entry from the dead-letter queue without re-queuing.
   */
  async deleteDeadLetterJob(dlqBullJobId: string): Promise<void> {
    const dlqJob = await this.deadLetterQueue.getJob(dlqBullJobId);

    if (!dlqJob) {
      throw new Error(`DLQ job ${dlqBullJobId} not found`);
    }

    await dlqJob.remove();
    this.logger.log(`DLQ job ${dlqBullJobId} deleted`);
  }

  /**
   * Purge all entries from the dead-letter queue.
   */
  async purgeDeadLetterQueue(): Promise<number> {
    const jobs = await this.deadLetterQueue.getJobs([
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
    ]);

    await Promise.all(jobs.map((j) => j.remove()));
    this.logger.warn(`Purged ${jobs.length} entries from dead-letter queue`);
    return jobs.length;
  }

  /**
   * DLQ health statistics.
   */
  async getStats(): Promise<{
    total: number;
    byWorker: Record<string, number>;
  }> {
    const jobs = await this.deadLetterQueue.getJobs([
      "waiting",
      "active",
      "completed",
      "failed",
    ]);

    const byWorker: Record<string, number> = {};
    for (const job of jobs) {
      const entry = job.data as DeadLetterEntry;
      const workerType = entry?.workerType ?? "unknown";
      byWorker[workerType] = (byWorker[workerType] || 0) + 1;
    }

    return { total: jobs.length, byWorker };
  }
}
