import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import { Transporter } from "nodemailer";
import { Notification } from "../entities/notification.entity";
import { NotificationChannel } from "../entities/notification.enums";
import {
  NotificationProvider,
  ProviderResponse,
} from "../interfaces/notification-provider.interface";

/**
 * SMTP email transport backed by nodemailer.
 *
 * Configuration mirrors {@link src/auth/email.service.ts}:
 * `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`.
 *
 * When `SMTP_USER`/`SMTP_PASSWORD` are not configured the provider runs in
 * "test mode": it logs the message and reports success without opening a
 * connection, matching the behaviour of the other providers so the module is
 * fully exercisable in development and tests without credentials.
 */
@Injectable()
export class SmtpProvider implements NotificationProvider {
  readonly channel = NotificationChannel.SMTP;
  private readonly logger = new Logger(SmtpProvider.name);
  private transporter?: Transporter;

  constructor(private readonly configService: ConfigService) {}

  async send(notification: Notification): Promise<ProviderResponse> {
    try {
      if (!this.isConfigured()) {
        this.logger.warn(
          "SMTP credentials not configured, running in test mode",
        );
        this.logger.log(
          `[TEST MODE] Would send email to: ${notification.recipient}`,
        );
        this.logger.log(`[TEST MODE] Subject: ${notification.subject}`);
        return {
          success: true,
          messageId: `test_smtp_${notification.id}`,
          response: { test_mode: true },
        };
      }

      if (!notification.recipient) {
        return {
          success: false,
          error: "No recipient address",
          statusCode: 400,
        };
      }

      const info = await this.getTransporter().sendMail({
        from: this.configService.get<string>("EMAIL_FROM"),
        to: notification.recipient,
        subject: notification.subject,
        html: notification.content,
        text: this.resolveText(notification),
      });

      return {
        success: true,
        messageId: info.messageId,
        statusCode: 200,
        response: {
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to send email via SMTP: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
        statusCode: 500,
      };
    }
  }

  private isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>("SMTP_USER") &&
      this.configService.get<string>("SMTP_PASSWORD"),
    );
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const secure = this.configService.get("SMTP_SECURE");
      this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>(
          "SMTP_HOST",
          "smtp.ethereal.email",
        ),
        port: Number(this.configService.get("SMTP_PORT", 587)),
        secure: secure === true || secure === "true",
        auth: {
          user: this.configService.get<string>("SMTP_USER"),
          pass: this.configService.get<string>("SMTP_PASSWORD"),
        },
      });
    }
    return this.transporter;
  }

  /** Prefer the pre-rendered plain-text part; fall back to a stripped HTML body. */
  private resolveText(notification: Notification): string | undefined {
    const rendered = notification.metadata?.renderedText;
    if (typeof rendered === "string" && rendered.length > 0) {
      return rendered;
    }
    if (notification.content) {
      return notification.content
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return notification.subject;
  }
}
