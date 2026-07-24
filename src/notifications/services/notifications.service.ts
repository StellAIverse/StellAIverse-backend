import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Repository, LessThan } from 'typeorm';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { UpdateNotificationDto } from '../dto/update-notification.dto';
import { Notification } from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';
import { NotificationDeliveryLog } from '../entities/notification-delivery-log.entity';
import {
  NotificationType,
  NotificationStatus,
  NotificationChannel,
} from '../entities/notification.enums';
import { NotificationJobData } from '../processors/notification.processor';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private preferenceRepository: Repository<NotificationPreference>,
    @InjectRepository(NotificationDeliveryLog)
    private deliveryLogRepository: Repository<NotificationDeliveryLog>,
    @InjectQueue('notifications')
    private notificationsQueue: Queue,
  ) {}

  async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
    const preferences = await this.getUserPreferences(createNotificationDto.userId);
    
    if (!this.isChannelEnabled(preferences, createNotificationDto.type)) {
      this.logger.debug(
        `Notification channel ${createNotificationDto.type} disabled for user ${createNotificationDto.userId}`,
      );
      throw new BadRequestException(`Notification channel ${createNotificationDto.type} is disabled`);
    }

    const recipient = await this.getRecipient(preferences, createNotificationDto);
    const notification = this.notificationRepository.create({
      ...createNotificationDto,
      recipient,
      status: NotificationStatus.PENDING,
      isRead: false,
      isArchived: false,
      retryCount: 0,
    });

    const savedNotification = await this.notificationRepository.save(notification);

    await this.queueNotification(savedNotification);

    this.logger.log(`Created notification ${savedNotification.id} for user ${createNotificationDto.userId}`);
    return savedNotification;
  }

  async findAllByUserId(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      includeArchived?: boolean;
      type?: NotificationType;
    } = {},
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    const { limit = 20, offset = 0, includeArchived = false, type } = options;

    const queryBuilder = this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId });

    if (!includeArchived) {
      queryBuilder.andWhere('notification.isArchived = false');
    }

    if (type) {
      queryBuilder.andWhere('notification.type = :type', { type });
    }

    queryBuilder
      .orderBy('notification.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    const [notifications, total] = await queryBuilder.getManyAndCount();

    const unreadCount = await this.getUnreadCount(userId);

    return { notifications, total, unreadCount };
  }

  async findOne(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    return notification;
  }

  async update(
    id: string,
    userId: string,
    updateNotificationDto: UpdateNotificationDto,
  ): Promise<Notification> {
    const notification = await this.findOne(id, userId);

    if (updateNotificationDto.isRead !== undefined) {
      notification.isRead = updateNotificationDto.isRead;
    }

    if (updateNotificationDto.isArchived !== undefined) {
      notification.isArchived = updateNotificationDto.isArchived;
    }

    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false, isArchived: false },
      { isRead: true },
    );
  }

  async remove(id: string, userId: string): Promise<void> {
    const notification = await this.findOne(id, userId);
    await this.notificationRepository.remove(notification);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false, isArchived: false },
    });
  }

  async getQueueMetrics(): Promise<{
    pending: number;
    processing: number;
    delivered: number;
    failed: number;
    deadLetter: number;
  }> {
    const [pending, processing, delivered, failed, deadLetter] = await Promise.all([
      this.notificationRepository.count({ where: { status: NotificationStatus.PENDING } }),
      this.notificationRepository.count({ where: { status: NotificationStatus.PROCESSING } }),
      this.notificationRepository.count({ where: { status: NotificationStatus.DELIVERED } }),
      this.notificationRepository.count({ where: { status: NotificationStatus.FAILED } }),
      this.notificationRepository.count({ where: { status: NotificationStatus.DEAD_LETTER } }),
    ]);

    return { pending, processing, delivered, failed, deadLetter };
  }

  async retryFailedNotifications(): Promise<number> {
    const failedNotifications = await this.notificationRepository.find({
      where: {
        status: NotificationStatus.FAILED,
        nextRetryAt: LessThan(new Date()),
      },
    });

    let queuedCount = 0;
    for (const notification of failedNotifications) {
      await this.queueNotification(notification);
      queuedCount++;
    }

    this.logger.log(`Requeued ${queuedCount} failed notifications`);
    return queuedCount;
  }

  private async queueNotification(notification: Notification): Promise<void> {
    const jobData: NotificationJobData = {
      notificationId: notification.id,
      retryCount: notification.retryCount,
    };

    const delay = notification.nextRetryAt
      ? notification.nextRetryAt.getTime() - Date.now()
      : 0;

    await this.notificationsQueue.add('process-notification', jobData, {
      delay: Math.max(0, delay),
      attempts: notification.retryCount < 5 ? 5 - notification.retryCount : 1,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  private async getUserPreferences(userId: string): Promise<NotificationPreference> {
    let preferences = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      preferences = this.preferenceRepository.create({
        userId,
        emailEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,
      });
      await this.preferenceRepository.save(preferences);
    }

    return preferences;
  }

  private isChannelEnabled(preferences: NotificationPreference, type: NotificationType): boolean {
    switch (type) {
      case NotificationType.EMAIL:
        return preferences.emailEnabled;
      case NotificationType.PUSH:
        return preferences.pushEnabled;
      case NotificationType.IN_APP:
        return preferences.inAppEnabled;
      default:
        return true;
    }
  }

  private async getRecipient(
    preferences: NotificationPreference,
    dto: CreateNotificationDto,
  ): Promise<string> {
    if (dto.recipient) {
      return dto.recipient;
    }

    if (dto.type === NotificationType.EMAIL && preferences.channelPreferences.email?.email) {
      return preferences.channelPreferences.email.email;
    }

    throw new BadRequestException('No recipient found for notification');
  }
}