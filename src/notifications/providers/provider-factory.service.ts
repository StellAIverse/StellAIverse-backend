import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '../entities/notification.enums';
import { SendGridProvider } from './sendgrid.provider';
import { MailgunProvider } from './mailgun.provider';
import { FCMProvider } from './fcm.provider';
import { APNsProvider } from './apns.provider';
import { InAppProvider } from './in-app.provider';
import { NotificationProvider } from '../interfaces/notification-provider.interface';

@Injectable()
export class ProviderFactory {
  constructor(
    private sendGridProvider: SendGridProvider,
    private mailgunProvider: MailgunProvider,
    private fcmProvider: FCMProvider,
    private apnsProvider: APNsProvider,
    private inAppProvider: InAppProvider,
  ) {}

  getProvider(channel: NotificationChannel): NotificationProvider {
    switch (channel) {
      case NotificationChannel.SENDGRID:
        return this.sendGridProvider;
      case NotificationChannel.MAILGUN:
        return this.mailgunProvider;
      case NotificationChannel.FCM:
        return this.fcmProvider;
      case NotificationChannel.APNs:
        return this.apnsProvider;
      case NotificationChannel.INTERNAL:
        return this.inAppProvider;
      default:
        throw new Error(`Unsupported notification channel: ${channel}`);
    }
  }
}