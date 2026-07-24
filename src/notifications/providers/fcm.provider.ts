import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Notification } from '../entities/notification.entity';
import {
  NotificationProvider,
  ProviderResponse,
  PushProviderConfig,
} from '../interfaces/notification-provider.interface';

@Injectable()
export class FCMProvider implements NotificationProvider {
  private readonly logger = new Logger(FCMProvider.name);
  private config: PushProviderConfig;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;

  constructor(private configService: ConfigService) {
    this.config = {
      apiKey: this.configService.get<string>('FCM_SERVER_KEY', ''),
      projectId: this.configService.get<string>('FCM_PROJECT_ID', ''),
      rateLimitPerMinute: this.configService.get<number>(
        'FCM_RATE_LIMIT',
        500,
      ),
    };
  }

  async send(notification: Notification): Promise<ProviderResponse> {
    try {
      await this.applyRateLimit();

      const pushTokens = notification.metadata?.pushTokens || [];
      if (!pushTokens.length) {
        return {
          success: false,
          error: 'No push tokens provided',
          statusCode: 400,
        };
      }

      if (!this.config.apiKey) {
        this.logger.warn('FCM API key not configured, running in test mode');
        this.logger.log(`[TEST MODE] Would send push to ${pushTokens.length} devices`);
        this.logger.log(`[TEST MODE] Title: ${notification.subject}`);
        this.logger.log(`[TEST MODE] Body: ${notification.content}`);

        return {
          success: true,
          messageId: `test_push_${Date.now()}`,
          response: { successCount: pushTokens.length, failureCount: 0 },
        };
      }

      const message = this.buildFCMMessage(notification, pushTokens);

      const response = await axios.post(
        `https://fcm.googleapis.com/v1/projects/${this.config.projectId}/messages:send`,
        message,
        {
          headers: {
            Authorization: `Bearer ${await this.getAccessToken()}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.requestCount++;
      this.lastRequestTime = Date.now();

      return {
        success: true,
        messageId: response.data.name,
        statusCode: response.status,
        response: response.data,
      };
    } catch (error) {
      this.logger.error(`Failed to send push notification: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        statusCode: error.response?.status || 500,
        response: error.response?.data,
      };
    }
  }

  private buildFCMMessage(notification: Notification, tokens: string[]) {
    return {
      message: {
        token: tokens[0],
        notification: {
          title: notification.subject,
          body: notification.content,
        },
        data: notification.templateData || {},
        android: {
          notification: {
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      },
    };
  }

  private async getAccessToken(): Promise<string> {
    return this.config.apiKey;
  }

  private async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    if (this.lastRequestTime < oneMinuteAgo) {
      this.requestCount = 0;
      this.lastRequestTime = now;
      return;
    }

    if (this.requestCount >= this.config.rateLimitPerMinute) {
      const waitTime = 60000 - (now - this.lastRequestTime);
      this.logger.log(`FCM rate limit reached, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }
  }
}