import { Injectable, Logger } from '@nestjs/common';
import { Notification } from '../entities/notification.entity';
import {
  NotificationProvider,
  ProviderResponse,
} from '../interfaces/notification-provider.interface';

@Injectable()
export class InAppProvider implements NotificationProvider {
  private readonly logger = new Logger(InAppProvider.name);

  async send(notification: Notification): Promise<ProviderResponse> {
    try {
      this.logger.log(
        `In-app notification stored for user ${notification.userId}: ${notification.subject}`,
      );
      
      return {
        success: true,
        messageId: notification.id,
        statusCode: 200,
        response: {
          stored: true,
          unreadCount: notification.metadata?.unreadCount || 1,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to store in-app notification: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        statusCode: 500,
      };
    }
  }
}