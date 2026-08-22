import { Notification } from "../entities/notification.entity";
import { NotificationChannel } from "../entities/notification.enums";

/**
 * DI token that resolves to every registered {@link NotificationProvider}.
 * The {@link ProviderFactory} injects this array and indexes it by `channel`,
 * so adding a new transport only requires implementing the interface and
 * registering the provider in the token's factory (see notifications.module.ts).
 */
export const NOTIFICATION_PROVIDERS = "NOTIFICATION_PROVIDERS";

export interface EmailProviderConfig {
  apiKey: string;
  domain?: string;
  fromEmail: string;
  fromName: string;
  rateLimitPerMinute: number;
}

export interface PushProviderConfig {
  apiKey: string;
  projectId?: string;
  bundleId?: string;
  rateLimitPerMinute: number;
}

export interface NotificationProvider {
  /** The channel this provider delivers on. Used by ProviderFactory to route. */
  readonly channel: NotificationChannel;

  send(notification: Notification): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
    statusCode?: number;
    response?: any;
  }>;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{ filename: string; path: string }>;
}

export interface SendPushOptions {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
}

export interface ProviderResponse {
  success: boolean;
  messageId?: string;
  error?: string;
  statusCode?: number;
  response?: any;
}
