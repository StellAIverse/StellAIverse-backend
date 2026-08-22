import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { InjectQueue } from "@nestjs/bull";
import { Queue } from "bull";
import { Repository, In } from "typeorm";
import { CreateNotificationDto } from "../dto/create-notification.dto";
import { UpdateNotificationDto } from "../dto/update-notification.dto";
import { Notification } from "../entities/notification.entity";
import { NotificationPreference } from "../entities/notification-preference.entity";
import { NotificationDeliveryLog } from "../entities/notification-delivery-log.entity";
import {
  NotificationType,
  NotificationStatus,
  NotificationChannel,
} from "../entities/notification.enums";
import { NotificationJobData } from "../processors/notification.processor";
import { TemplateService, RenderedTemplate } from "./template.service";

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
    @InjectQueue("notifications")
    private notificationsQueue: Queue,
    private readonly templateService: TemplateService,
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<Notification> {
    const preferences = await this.getUserPreferences(
      createNotificationDto.userId,
    );

    if (!this.isChannelEnabled(preferences, createNotificationDto.type)) {
      this.logger.debug(
        `Notification channel ${createNotificationDto.type} disabled for user ${createNotificationDto.userId}`,
      );
      throw new BadRequestException(
        `Notification channel ${createNotificationDto.type} is disabled`,
      );
    }

    const recipient = await this.getRecipient(
      preferences,
      createNotificationDto,
    );

    // Render the template into subject/content unless the caller supplied overrides.
    const rendered = this.renderTemplate(createNotificationDto);
    const metadata = this.buildMetadata(
      preferences,
      createNotificationDto,
      rendered,
    );

    const notification = this.notificationRepository.create({
      ...createNotificationDto,
      recipient,
      subject: createNotificationDto.subject ?? rendered?.subject,
      content: createNotificationDto.content ?? rendered?.html,
      metadata,
      status: NotificationStatus.PENDING,
      isRead: false,
      isArchived: false,
      retryCount: 0,
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    await this.queueNotification(savedNotification);

    this.logger.log(
      `Created notification ${savedNotification.id} for user ${createNotificationDto.userId}`,
    );
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
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }> {
    const { limit = 20, offset = 0, includeArchived = false, type } = options;

    const queryBuilder = this.notificationRepository
      .createQueryBuilder("notification")
      .where("notification.userId = :userId", { userId });

    if (!includeArchived) {
      queryBuilder.andWhere("notification.isArchived = false");
    }

    if (type) {
      queryBuilder.andWhere("notification.type = :type", { type });
    }

    queryBuilder
      .orderBy("notification.createdAt", "DESC")
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
    const [pending, processing, delivered, failed, deadLetter] =
      await Promise.all([
        this.notificationRepository.count({
          where: { status: NotificationStatus.PENDING },
        }),
        this.notificationRepository.count({
          where: { status: NotificationStatus.PROCESSING },
        }),
        this.notificationRepository.count({
          where: { status: NotificationStatus.DELIVERED },
        }),
        this.notificationRepository.count({
          where: { status: NotificationStatus.FAILED },
        }),
        this.notificationRepository.count({
          where: { status: NotificationStatus.DEAD_LETTER },
        }),
      ]);

    return { pending, processing, delivered, failed, deadLetter };
  }

  /**
   * Paginated view of undeliverable notifications for the admin surface.
   * Defaults to both FAILED and DEAD_LETTER; narrow with `status`/`type`/`channel`.
   */
  async findFailed(
    options: {
      status?: NotificationStatus;
      type?: NotificationType;
      channel?: NotificationChannel;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ notifications: Notification[]; total: number }> {
    const { status, type, channel, limit = 20, offset = 0 } = options;

    const statuses = status
      ? [status]
      : [NotificationStatus.FAILED, NotificationStatus.DEAD_LETTER];

    const queryBuilder = this.notificationRepository
      .createQueryBuilder("notification")
      .where("notification.status IN (:...statuses)", { statuses });

    if (type) {
      queryBuilder.andWhere("notification.type = :type", { type });
    }

    if (channel) {
      queryBuilder.andWhere("notification.channel = :channel", { channel });
    }

    queryBuilder
      .orderBy("notification.updatedAt", "DESC")
      .skip(offset)
      .take(limit);

    const [notifications, total] = await queryBuilder.getManyAndCount();
    return { notifications, total };
  }

  /**
   * Requeue a single failed/dead-letter notification. Resets its retry state so
   * it receives a fresh set of Bull attempts, then re-enqueues it.
   */
  async requeueOne(id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    if (
      notification.status !== NotificationStatus.FAILED &&
      notification.status !== NotificationStatus.DEAD_LETTER
    ) {
      throw new BadRequestException(
        `Only failed or dead-letter notifications can be requeued (current status: ${notification.status})`,
      );
    }

    this.resetForRetry(notification);
    const saved = await this.notificationRepository.save(notification);
    await this.queueNotification(saved);

    this.logger.log(`Requeued notification ${saved.id}`);
    return saved;
  }

  /**
   * Bulk-requeue every failed notification. Includes DEAD_LETTER items by default
   * so operators can recover them — the previous implementation could not.
   */
  async requeueFailed(
    options: { includeDeadLetter?: boolean } = {},
  ): Promise<number> {
    const { includeDeadLetter = true } = options;

    const statuses = includeDeadLetter
      ? [NotificationStatus.FAILED, NotificationStatus.DEAD_LETTER]
      : [NotificationStatus.FAILED];

    const notifications = await this.notificationRepository.find({
      where: { status: In(statuses) },
    });

    let queuedCount = 0;
    for (const notification of notifications) {
      this.resetForRetry(notification);
      const saved = await this.notificationRepository.save(notification);
      await this.queueNotification(saved);
      queuedCount++;
    }

    this.logger.log(
      `Requeued ${queuedCount} failed notifications (includeDeadLetter=${includeDeadLetter})`,
    );
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

    await this.notificationsQueue.add("process-notification", jobData, {
      delay: Math.max(0, delay),
      attempts: notification.retryCount < 5 ? 5 - notification.retryCount : 1,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });
  }

  private async getUserPreferences(
    userId: string,
  ): Promise<NotificationPreference> {
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

  private isChannelEnabled(
    preferences: NotificationPreference,
    type: NotificationType,
  ): boolean {
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

    switch (dto.type) {
      case NotificationType.EMAIL: {
        const email =
          preferences.channelPreferences?.[NotificationType.EMAIL]?.email;
        if (email) {
          return email;
        }
        throw new BadRequestException(
          "No recipient email found for notification",
        );
      }
      // Push tokens travel in metadata; the in-app channel targets the user record.
      case NotificationType.PUSH:
      case NotificationType.IN_APP:
        return dto.userId;
      default:
        throw new BadRequestException("No recipient found for notification");
    }
  }

  /**
   * Reset delivery bookkeeping so a requeued notification gets a fresh set of Bull
   * attempts. Clearing `nextRetryAt` makes {@link queueNotification} enqueue with no
   * delay; resetting `retryCount` restores the full `attempts` budget.
   */
  private resetForRetry(notification: Notification): void {
    notification.status = NotificationStatus.PENDING;
    notification.retryCount = 0;
    notification.nextRetryAt = null;
    notification.failureReason = null;
    notification.providerResponseCode = null;
  }

  /**
   * Render the notification's template at enqueue time. Returns `undefined` when
   * no template is registered so explicit subject/content overrides still apply.
   */
  private renderTemplate(
    dto: CreateNotificationDto,
  ): RenderedTemplate | undefined {
    if (!dto.template || !this.templateService.has(dto.template)) {
      return undefined;
    }
    return this.templateService.render(dto.template, dto.templateData ?? {});
  }

  /**
   * Assemble the persisted `metadata` blob: caller-supplied metadata, the plain-text
   * rendering (for transports like SMTP that prefer it), and resolved push tokens.
   */
  private buildMetadata(
    preferences: NotificationPreference,
    dto: CreateNotificationDto,
    rendered?: RenderedTemplate,
  ): Record<string, any> | undefined {
    const metadata: Record<string, any> = { ...(dto.metadata ?? {}) };

    // Only attach the template's text part when the HTML body also came from it,
    // so the text/HTML pair stays consistent.
    if (rendered && !dto.content) {
      metadata.renderedText = rendered.text;
    }

    if (dto.type === NotificationType.PUSH && !metadata.pushTokens) {
      const tokens =
        preferences.channelPreferences?.[NotificationType.PUSH]?.pushTokens;
      if (tokens?.length) {
        metadata.pushTokens = tokens;
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }
}
