import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './services/notifications.service';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { Notification } from './entities/notification.entity';
import { NotificationDeliveryLog } from './entities/notification-delivery-log.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { SendGridProvider } from './providers/sendgrid.provider';
import { MailgunProvider } from './providers/mailgun.provider';
import { FCMProvider } from './providers/fcm.provider';
import { APNsProvider } from './providers/apns.provider';
import { InAppProvider } from './providers/in-app.provider';
import { ProviderFactory } from './providers/provider-factory.service';
import { NotificationProcessor } from './processors/notification.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationDeliveryLog,
      NotificationPreference,
    ]),
    BullModule.registerQueue({
      name: 'notifications',
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    }),
    ConfigModule,
  ],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [
    NotificationsService,
    SendGridProvider,
    MailgunProvider,
    FCMProvider,
    APNsProvider,
    InAppProvider,
    ProviderFactory,
    NotificationProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}