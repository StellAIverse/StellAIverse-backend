import { Notification } from '../entities/notification.entity';

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