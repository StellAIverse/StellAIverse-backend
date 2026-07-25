import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { PaymentCustomer } from "./entities/payment-customer.entity";
import { Subscription } from "./entities/subscription.entity";
import { Transaction } from "./entities/transaction.entity";
import { WebhookEvent } from "./entities/webhook-event.entity";
import { StripeService } from "./stripe.service";
import { PaymentsService } from "./payments.service";
import { PaymentsWebhookService } from "./payments-webhook.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsWebhookController } from "./payments-webhook.controller";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      PaymentCustomer,
      Subscription,
      Transaction,
      WebhookEvent,
    ]),
  ],
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [StripeService, PaymentsService, PaymentsWebhookService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
