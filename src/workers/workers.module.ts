import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { WorkersController } from "./workers.controller";
import { WorkersAdminController } from "./workers-admin.controller";
import { WorkersService } from "./workers.service";
import { EmailWorkerProcessor } from "./processors/email-worker.processor";
import { WebhookWorkerProcessor } from "./processors/webhook-worker.processor";
import { AnalyticsWorkerProcessor } from "./processors/analytics-worker.processor";
import { WorkerHealthService } from "./services/worker-health.service";
import { IdempotencyService } from "./services/idempotency.service";
import { DeadLetterService } from "./services/dead-letter.service";
import { WorkerMetricsService } from "./services/worker-metrics.service";
import { JobEntity } from "./entities/job.entity";
import { IdempotencyKey } from "./entities/idempotency-key.entity";
import { WorkerHealthIndicator } from "./indicators/worker-health.indicator";

/**
 * Workers Module
 * 
 * Provides reliable async processing for background jobs with:
 * - Email delivery
 * - Webhook processing
 * - Analytics aggregation
 * - Retry strategies with exponential backoff
 * - Dead-letter queue handling
 * - Idempotency guarantees
 * - Health checks and metrics
 * - Admin UI for job management
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([JobEntity, IdempotencyKey]),
    BullModule.registerQueue(
      {
        name: "email-jobs",
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: {
            age: 86400, // 24 hours
            count: 1000,
          },
          removeOnFail: false,
        },
      },
      {
        name: "webhook-jobs",
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          removeOnComplete: {
            age: 86400,
            count: 1000,
          },
          removeOnFail: false,
        },
      },
      {
        name: "analytics-jobs",
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "fixed",
            delay: 5000,
          },
          removeOnComplete: {
            age: 172800, // 48 hours
            count: 500,
          },
          removeOnFail: false,
        },
      },
      {
        name: "worker-dead-letter",
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false,
        },
      },
    ),
  ],
  controllers: [WorkersController, WorkersAdminController],
  providers: [
    WorkersService,
    EmailWorkerProcessor,
    WebhookWorkerProcessor,
    AnalyticsWorkerProcessor,
    WorkerHealthService,
    IdempotencyService,
    DeadLetterService,
    WorkerMetricsService,
    WorkerHealthIndicator,
  ],
  exports: [WorkersService, WorkerHealthService, IdempotencyService],
})
export class WorkersModule {}
