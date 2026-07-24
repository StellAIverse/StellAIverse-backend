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
export class SendGridProvider implements NotificationProvider {
  private readonly logger = new Logger(SendGridProvider.name);
  private config: EmailProviderConfig;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;

  constructor(private configService: ConfigService) {
    this.config = {
      apiKey: this.configService.get<string>('SENDGRID_API_KEY', ''),
      fromEmail: this.configService.get<string>(
        'SENDGRID_FROM_EMAIL',
        'notifications@stellaiverse.com',
      ),
      fromName: this.configService.get<string>(
        'SENDGRID_FROM_NAME',
        'StellAIverse',
      ),
      rateLimitPerMinute: this.configService.get<number>(
        'SENDGRID_RATE_LIMIT',
        100,
      ),
    };
  }

  async send(notification: Notification): Promise<ProviderResponse> {
    try {
      await this.applyRateLimit();

      if (!this.config.apiKey) {
        this.logger.warn(
          'SendGrid API key not configured, running in test mode',
        );
        this.logger.log(`[TEST MODE] Would send email to: ${notification.recipient}`);
        this.logger.log(`[TEST MODE] Subject: ${notification.subject}`);
        this.logger.log(`[TEST MODE] Template: ${notification.template}`);

        return {
          success: true,
          messageId: `test_${Date.now()}`,
          response: { test_mode: true },
        };
      }

      const emailData = this.buildEmailData(notification);

      const response = await axios.post(
        'https://api.sendgrid.com/v3/mail/send',
        emailData,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.requestCount++;
      this.lastRequestTime = Date.now();

      return {
        success: true,
        messageId: response.headers['x-message-id'],
        statusCode: response.status,
        response: response.data,
      };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        statusCode: error.response?.status || 500,
        response: error.response?.data,
      };
    }
  }

  private buildEmailData(notification: Notification) {
    return {
      from: {
        email: this.config.fromEmail,
        name: this.config.fromName,
      },
      to: [
        {
          email: notification.recipient,
        },
      ],
      subject: notification.subject,
      html: notification.content,
      template_id: this.getTemplateId(notification.template),
      dynamic_template_data: notification.templateData,
    };
  }

  private getTemplateId(template: string): string | undefined {
    const templateIds: Record<string, string> = {
      welcome: this.configService.get<string>('SENDGRID_TEMPLATE_WELCOME', ''),
      password_reset: this.configService.get<string>(
        'SENDGRID_TEMPLATE_PASSWORD_RESET',
        '',
      ),
      email_verification: this.configService.get<string>(
        'SENDGRID_TEMPLATE_EMAIL_VERIFICATION',
        '',
      ),
    };
    return templateIds[template] || undefined;
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
      this.logger.log(`Rate limit reached, waiting ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.lastRequestTime = Date.now();
    }
  }
}