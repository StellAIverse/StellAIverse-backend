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
import * as nodemailer from "nodemailer";
import { ConfigService } from "@nestjs/config";
import { JobEntity } from "../entities/job.entity";
import { DeadLetterService } from "../services/dead-letter.service";
import { WorkerMetricsService } from "../services/worker-metrics.service";
import { IdempotencyService } from "../services/idempotency.service";
import { EmailJobPayload } from "../workers.service";

@Processor("email-jobs")
export class EmailWorkerProcessor {
  private readonly logger = new Logger(EmailWorkerProcessor.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(JobEntity)
    private jobRepository: Repository<JobEntity>,
    private readonly deadLetterService: DeadLetterService,
    private readonly metricsService: WorkerMetricsService,
    private readonly idempotencyService: IdempotencyService,
    private readonly configService: ConfigService,
  ) {
    // Configure nodemailer transporter
    this.transporter = nodemailer.createTransport({
      host: this.configService.get("SMTP_HOST", "smtp.ethereal.email"),
      port: this.configService.get("SMTP_PORT", 587),
      secure: this.configService.get("SMTP_SECURE", "false") === "true",
      auth: {
        user: this.configService.get("SMTP_USER"),
        pass: this.configService.get("SMTP_PASSWORD"),
      },
    });
  }

  /**
   * Main job processor — handles email delivery with idempotency
   */
  @Process()
  async handleEmailJob(job: Job<EmailJobPayload>): Promise<any> {
    const startTime = Date.now();
    this.logger.log(
      `Processing email job ${job.id} (attempt ${job.attemptsMade + 1})`,
    );

    await job.progress(10);

    // Validate payload
    if (!job.data.to) {
      throw new Error("Email recipient (to) is required");
    }

    if (!job.data.subject) {
      throw new Error("Email subject is required");
    }

    // Update job record to active
    await this.updateJobStatus(String(job.id), "active");

    await job.progress(30);

    // Prepare email options
    const mailOptions: nodemailer.SendMailOptions = {
      from: job.data.from || this.configService.get("EMAIL_FROM", "noreply@stellaiverse.com"),
      to: Array.isArray(job.data.to) ? job.data.to.join(", ") : job.data.to,
      subject: job.data.subject,
      text: job.data.body,
    };

    if (job.data.html) {
      mailOptions.html = job.data.html;
    }

    if (job.data.cc?.length) {
      mailOptions.cc = job.data.cc.join(", ");
    }

    if (job.data.bcc?.length) {
      mailOptions.bcc = job.data.bcc.join(", ");
    }

    if (job.data.attachments?.length) {
      mailOptions.attachments = job.data.attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      }));
    }

    await job.progress(60);

    // Send the email
    const info = await this.transporter.sendMail(mailOptions);

    await job.progress(90);

    const duration = (Date.now() - startTime) / 1000;
    this.metricsService.recordJobDuration("email", "success", duration);

    const result = {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    };

    // Update job record
    await this.updateJobStatus(String(job.id), "completed", result);

    await job.progress(100);

    this.logger.log(
      `Email job ${job.id} sent successfully to ${job.data.to}. MessageId: ${info.messageId}`,
    );

    return result;
  }

  @OnQueueCompleted()
  async onCompleted(job: Job<EmailJobPayload>, result: any) {
    this.metricsService.recordJobCompleted("email");

    // Update idempotency key if applicable
    const jobEntity = await this.getJobEntity(String(job.id));
    if (jobEntity?.idempotencyKey) {
      await this.idempotencyService.updateIdempotencyKeyStatus(
        jobEntity.idempotencyKey,
        "completed",
        result,
      );
    }

    this.logger.debug(
      `Email job ${job.id} completed in ${job.finishedOn - job.processedOn}ms`,
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job<EmailJobPayload>, error: Error) {
    const duration = job.finishedOn
      ? (job.finishedOn - (job.processedOn || 0)) / 1000
      : 0;

    this.metricsService.recordJobDuration(
      "email",
      "failed",
      duration,
    );
    this.metricsService.recordJobFailed("email", this.categorizeError(error));

    // Update job record
    await this.updateJobStatus(String(job.id), "failed", null, error.message);

    // Move to DLQ if all attempts exhausted
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      await this.deadLetterService.moveToDeadLetter(job, "email", error.message);

      // Update idempotency key to failed
      const jobEntity = await this.getJobEntity(String(job.id));
      if (jobEntity?.idempotencyKey) {
        await this.idempotencyService.updateIdempotencyKeyStatus(
          jobEntity.idempotencyKey,
          "failed",
        );
      }

      this.logger.warn(
        `Email job ${job.id} moved to DLQ after ${job.attemptsMade} attempts`,
      );
    } else {
      this.logger.warn(
        `Email job ${job.id} failed (attempt ${job.attemptsMade}): ${error.message}`,
      );
    }
  }

  @OnQueueStalled()
  async onStalled(job: Job<EmailJobPayload>) {
    this.logger.warn(
      `Email job ${job.id} stalled — will be re-queued automatically`,
    );
    this.metricsService.recordJobFailed("email", "stalled");
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async updateJobStatus(
    bullJobId: string,
    status: string,
    result?: any,
    error?: string,
  ): Promise<void> {
    try {
      const updates: Partial<JobEntity> = { status };

      if (status === "active") {
        updates.processedAt = new Date();
      } else if (status === "completed") {
        updates.completedAt = new Date();
        updates.result = result;
      } else if (status === "failed") {
        updates.failedAt = new Date();
        updates.error = error;
      }

      await this.jobRepository.update({ bullJobId }, updates);
    } catch (err) {
      this.logger.warn(`Could not update job status for Bull ID ${bullJobId}: ${err.message}`);
    }
  }

  private async getJobEntity(bullJobId: string): Promise<JobEntity | null> {
    return this.jobRepository.findOne({ where: { bullJobId } });
  }

  private categorizeError(error: Error): string {
    const msg = error.message.toLowerCase();
    if (msg.includes("timeout")) return "timeout";
    if (msg.includes("auth") || msg.includes("credentials")) return "auth";
    if (msg.includes("recipient") || msg.includes("to")) return "validation";
    if (msg.includes("connect") || msg.includes("network")) return "network";
    return "unknown";
  }
}
