import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import { Notification } from '../entities/notification.entity';
import { NotificationDeliveryLog } from '../entities/notification-delivery-log.entity';
import { NotificationStatus } from '../entities/notification.enums';
import { ProviderFactory } from '../providers/provider-factory.service';

export interface NotificationJobData {
  notificationId: string;
  retryCount: number;
}

@Processor('notifications')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  private readonly maxRetries = 5;
  private readonly baseDelay = 1000; // 1 second
  private readonly maxDelay = 300000; // 5 minutes

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationDeliveryLog)
    private deliveryLogRepository: Repository<NotificationDeliveryLog>,
    private providerFactory: ProviderFactory,
  ) {}

  @Process('process-notification')
  async processNotification(job: Job<NotificationJobData>) {
    const { notificationId, retryCount } = job.data;

    this.logger.debug(`Processing notification ${notificationId}, attempt ${retryCount + 1}`);

    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      this.logger.error(`Notification ${notificationId} not found`);
      return;
    }

    if (notification.status === NotificationStatus.DEAD_LETTER) {
      this.logger.warn(`Notification ${notificationId} is in dead letter queue, skipping`);
      return;
    }

    try {
      await this.notificationRepository.update(notificationId, {
        status: NotificationStatus.PROCESSING,
      });

      const provider = this.providerFactory.getProvider(notification.channel);
      const result = await provider.send(notification);

      if (result.success) {
        await this.handleSuccess(notification, result);
      } else {
        await this.handleFailure(notification, result.error || 'Unknown error', result.statusCode);
        throw new Error(result.error || 'Delivery failed');
      }
    } catch (error) {
      this.logger.error(`Failed to process notification ${notificationId}: ${error.message}`);
      throw error;
    }
  }

  private async handleSuccess(
    notification: Notification,
    result: { messageId?: string; response?: any },
  ) {
    const now = new Date();

    await this.notificationRepository.update(notification.id, {
      status: NotificationStatus.DELIVERED,
      deliveredAt: now,
      retryCount: notification.retryCount + 1,
    });

    await this.deliveryLogRepository.save({
      notificationId: notification.id,
      success: true,
      attemptNumber: notification.retryCount + 1,
      deliveredAt: now,
      providerResponse: result.response,
    });

    this.logger.log(`Notification ${notification.id} delivered successfully`);
  }

  private async handleFailure(
    notification: Notification,
    errorMessage: string,
    statusCode?: number,
  ) {
    const newRetryCount = notification.retryCount + 1;
    const shouldRetry = newRetryCount < this.maxRetries;
    const nextDelay = this.calculateBackoff(newRetryCount);
    const nextRetryAt = new Date(Date.now() + nextDelay);

    if (shouldRetry) {
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.FAILED,
        retryCount: newRetryCount,
        failureReason: errorMessage,
        providerResponseCode: statusCode,
        nextRetryAt,
      });
    } else {
      await this.notificationRepository.update(notification.id, {
        status: NotificationStatus.DEAD_LETTER,
        retryCount: newRetryCount,
        failureReason: errorMessage,
        providerResponseCode: statusCode,
      });
      this.logger.error(`Notification ${notification.id} moved to dead letter queue after ${this.maxRetries} attempts`);
    }

    await this.deliveryLogRepository.save({
      notificationId: notification.id,
      success: false,
      attemptNumber: newRetryCount,
      errorMessage,
    });
  }

  private calculateBackoff(retryCount: number): number {
    const delay = this.baseDelay * Math.pow(2, retryCount);
    return Math.min(delay, this.maxDelay);
  }
}