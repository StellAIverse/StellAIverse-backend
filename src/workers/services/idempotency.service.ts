import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan } from "typeorm";
import { IdempotencyKey } from "../entities/idempotency-key.entity";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyKey)
    private idempotencyRepository: Repository<IdempotencyKey>,
  ) {}

  /**
   * Check if a job with this key was already submitted.
   * Returns { jobId, status } when a match is found, null otherwise.
   */
  async checkIdempotency(
    key: string,
    jobType: string,
  ): Promise<{ jobId: string; status: string } | null> {
    const record = await this.idempotencyRepository.findOne({
      where: { key, jobType },
    });

    if (!record) return null;

    // Treat expired records as non-existent
    if (record.expiresAt < new Date()) {
      await this.idempotencyRepository.remove(record);
      return null;
    }

    return { jobId: record.jobId, status: record.status };
  }

  /**
   * Register a new idempotency key after the job is successfully enqueued.
   */
  async registerIdempotencyKey(
    key: string,
    jobId: string,
    jobType: string,
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<void> {
    const record = this.idempotencyRepository.create({
      key,
      jobId,
      jobType,
      status: "processing",
      expiresAt: new Date(Date.now() + ttlMs),
    });

    await this.idempotencyRepository.save(record);
    this.logger.debug(`Idempotency key registered: ${key} → job ${jobId}`);
  }

  /**
   * Update key status once the job finishes (completed / failed).
   */
  async updateIdempotencyKeyStatus(
    key: string,
    status: "completed" | "failed",
    result?: any,
  ): Promise<void> {
    await this.idempotencyRepository.update(
      { key },
      { status, result: result ?? null },
    );
    this.logger.debug(`Idempotency key ${key} updated to ${status}`);
  }

  /**
   * Purge all expired idempotency keys. Intended for a scheduled cron task.
   */
  async purgeExpiredKeys(): Promise<number> {
    const result = await this.idempotencyRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    const removed = result.affected || 0;
    if (removed > 0) {
      this.logger.log(`Purged ${removed} expired idempotency keys`);
    }
    return removed;
  }

  /**
   * Delete a specific key (useful for admin operations).
   */
  async deleteKey(key: string): Promise<void> {
    await this.idempotencyRepository.delete({ key });
    this.logger.debug(`Idempotency key deleted: ${key}`);
  }

  /**
   * Return statistics about the idempotency key table.
   */
  async getStats(): Promise<{
    total: number;
    processing: number;
    completed: number;
    failed: number;
    expired: number;
  }> {
    const [total, processing, completed, failed, expired] = await Promise.all([
      this.idempotencyRepository.count(),
      this.idempotencyRepository.count({ where: { status: "processing" } }),
      this.idempotencyRepository.count({ where: { status: "completed" } }),
      this.idempotencyRepository.count({ where: { status: "failed" } }),
      this.idempotencyRepository.count({
        where: { expiresAt: LessThan(new Date()) },
      }),
    ]);

    return { total, processing, completed, failed, expired };
  }
}
