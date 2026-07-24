import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Notification } from '../entities/notification.entity';
import {
  NotificationProvider,
  ProviderResponse,
  EmailProviderConfig,
} from '../interfaces/notification-provider.interface';

@Injectable()
export class MailgunProvider implements NotificationProvider {
  private readonly logger = new Logger(MailgunProvider.name);
  private config: EmailProviderConfig;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;

  constructor(private configService: ConfigService) {
    this.config = {
      apiKey: this.configService.get<string>('MAILGUN_API_KEY', ''),
      domain: this.configService.get<string>('MAILGUN_DOMAIN', ''),
      fromEmail: this.configService.get<string>(
        'MAILGUN_FROM_EMAIL',
        'notifications@mg.stellaiverse.com',
      ),
      fromName: this.configService.get<string>(
        'MAILGUN_FROM_NAME',
        'StellAIverse',
      ),
      rateLimitPerMinute: this.configService.get<number>(
        'MAILGUN_RATE_LIMIT',
        100,
      ),
    };
  }

  async send(notification: Notification): Promise<ProviderResponse> {
    try {
      await this.applyRateLimit();

      if (!this.config.apiKey || !this.config.domain) {
        this.logger.warn(
          'Mailgun API key or domain not configured, running in test mode',
        );
        this.logger.log(`[TEST MODE] Would send email to: ${notification.recipient}`);
        this.logger.log(`[TEST MODE] Subject: ${notification.subject}`);

        return {
          success: true,
          messageId: `test_mailgun_${Date.now()}`,
          response: { test_mode: true, id: `test_${Date.now()}` },
        };
      }

      const formData = this.buildFormData(notification);

      const response = await axios.post(
        `https://api.mailgun.net/v3/${this.config.domain}/messages`,
        formData,
        {
          auth: {
            username: 'api',
            password: this.config.apiKey,
          },
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      this.requestCount++;
      this.lastRequestTime = Date.now();

      return {
        success: true,
        messageId: response.data.id,
        statusCode: response.status,
        response: response.data,
      };
    } catch (error) {
      this.logger.error(`Failed to send email via Mailgun: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        statusCode: error.response?.status || 500,
        response: error.response?.data,
      };
    }
  }

  private buildFormData(notification: Notification) {
    const from = `${this.config.fromName} <${this.config.fromEmail}>`;
    return {
      from,
      to: notification.recipient,
      subject: notification.subject,
      html: notification.content,
    };
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
      this.logger.log(`Mailgun rate limit reached, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }
  }
}