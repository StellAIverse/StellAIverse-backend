import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JobEntity } from "src/workers/entities/job.entity";

export interface TriggeredJob {
  id: string;
  jobType: string;
  status: string;
  payload: Record<string, any>;
  scheduledAt: Date;
}

/**
 * Administrative job control (issue #365): inspect background jobs recorded
 * in `background_jobs` and enqueue administrative triggers (reindexing,
 * batch tasks). Execution itself is picked up by the workers module
 * processors, which poll for pending jobs of the given type.
 */
@Injectable()
export class JobControlService {
  /** Job types admins are allowed to trigger manually. */
  private static readonly TRIGGERABLE = new Set([
    "reindex",
    "batch-task",
    "cleanup-old-jobs",
    "refresh-metrics",
  ]);

  constructor(
    @InjectRepository(JobEntity)
    private readonly jobRepo: Repository<JobEntity>,
  ) {}

  async list(params: {
    page?: number;
    limit?: number;
    status?: string;
    jobType?: string;
  }): Promise<{
    data: JobEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const qb = this.jobRepo.createQueryBuilder("job");
    if (params.status)
      qb.andWhere("job.status = :status", { status: params.status });
    if (params.jobType)
      qb.andWhere("job.jobType = :jobType", { jobType: params.jobType });
    qb.orderBy("job.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async get(jobId: string): Promise<JobEntity> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    return job;
  }

  async trigger(
    actorId: string,
    jobType: string,
    payload: Record<string, any>,
  ): Promise<TriggeredJob> {
    if (!JobControlService.TRIGGERABLE.has(jobType)) {
      throw new NotFoundException(
        `Unknown or non-triggerable job type "${jobType}". Allowed: ${[...JobControlService.TRIGGERABLE].join(", ")}`,
      );
    }
    const job = await this.jobRepo.save(
      this.jobRepo.create({
        jobType,
        status: "pending",
        payload: { ...payload, triggeredBy: actorId },
        priority: 10,
        maxAttempts: 3,
        scheduledAt: new Date(),
      }),
    );
    return {
      id: job.id,
      jobType: job.jobType,
      status: job.status,
      payload: job.payload,
      scheduledAt: job.scheduledAt,
    };
  }
}
