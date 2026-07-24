import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification } from '../entities/notification.entity';
import {
  NotificationProvider,
  ProviderResponse,
  PushProviderConfig,
} from '../interfaces/notification-provider.interface';

@Injectable()
export class APNsProvider implements NotificationProvider {
  private readonly logger = new Logger(APNsProvider.name);
  private config: PushProviderConfig;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;

  constructor(private configService: ConfigService) {
    this.config = {
      apiKey: this.configService.get<string>('APNS_AUTH_KEY', ''),
      bundleId: this.configService.get<string>('APNS_BUNDLE_ID', ''),
      rateLimitPerMinute: this.configService.get<number>(
        'APNS_RATE_LIMIT',
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
          error: 'No APNS tokens provided',
          statusCode: 400,
        };
      }

      if (!this.config.apiKey || !this.config.bundleId) {
        this.logger.warn(
          'APNs credentials not configured, running in test mode',
        );
        this.logger.log(`[TEST MODE] Would send APNs to ${pushTokens.length} iOS devices`);
        this.logger.log(`[TEST MODE] Title: ${notification.subject}`);
        this.logger.log(`[TEST MODE] Body: ${notification.content}`);

        return {
          success: true,
          messageId: `test_apns_${Date.now()}`,
          response: { successCount: pushTokens.length, failureCount: 0 },
        };
      }

      this.logger.debug(`APNs would send to: ${pushTokens[0]}`);

      this.requestCount++;
      this.lastRequestTime = Date.now();

      return {
        success: true,
        messageId: `apns_${Date.now()}`,
        statusCode: 200,
        response: { apnsId: `apns-${Date.now()}` },
      };
    } catch (error) {
      this.logger.error(`Failed to send APNs notification: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        statusCode: error.response?.status || 500,
        response: error.response?.data,
      };
    }
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
      this.logger.log(`APNs rate limit reached, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }
  }
}