import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";
import { ConfigModule } from "@nestjs/config";
import { NotificationsService } from "./services/notifications.service";
import { TemplateService } from "./services/template.service";
import { NotificationsController } from "./controllers/notifications.controller";
import { NotificationPreferencesController } from "./controllers/notification-preferences.controller";
import { NotificationAdminController } from "./controllers/notification-admin.controller";
import { Notification } from "./entities/notification.entity";
import { NotificationDeliveryLog } from "./entities/notification-delivery-log.entity";
import { NotificationPreference } from "./entities/notification-preference.entity";
import { SmtpProvider } from "./providers/smtp.provider";
import { SendGridProvider } from "./providers/sendgrid.provider";
import { MailgunProvider } from "./providers/mailgun.provider";
import { FCMProvider } from "./providers/fcm.provider";
import { APNsProvider } from "./providers/apns.provider";
import { InAppProvider } from "./providers/in-app.provider";
import { ProviderFactory } from "./providers/provider-factory.service";
import { NotificationProcessor } from "./processors/notification.processor";
import { NOTIFICATION_PROVIDERS } from "./interfaces/notification-provider.interface";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationDeliveryLog,
      NotificationPreference,
    ]),
    BullModule.registerQueue({
      name: "notifications",
      defaultJobOptions: {
        removeOnComplete: true,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      },
    }),
    ConfigModule,
  ],
  controllers: [
    NotificationsController,
    NotificationPreferencesController,
    NotificationAdminController,
  ],
  providers: [
    NotificationsService,
    TemplateService,
    // Transports — implement NotificationProvider and register them in the
    // NOTIFICATION_PROVIDERS array below to make them resolvable by channel.
    SmtpProvider,
    SendGridProvider,
    MailgunProvider,
    FCMProvider,
    APNsProvider,
    InAppProvider,
    {
      // The pluggable transport registry. ProviderFactory injects this array and
      // indexes it by each provider's `channel`. Adding a transport = add its
      // class here (and to `providers` above) — no change to ProviderFactory.
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (
        smtp: SmtpProvider,
        sendgrid: SendGridProvider,
        mailgun: MailgunProvider,
        fcm: FCMProvider,
        apns: APNsProvider,
        inApp: InAppProvider,
      ) => [smtp, sendgrid, mailgun, fcm, apns, inApp],
      inject: [
        SmtpProvider,
        SendGridProvider,
        MailgunProvider,
        FCMProvider,
        APNsProvider,
        InAppProvider,
      ],
    },
    ProviderFactory,
    NotificationProcessor,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
