import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import Stripe from "stripe";
import { WebhookEvent } from "./entities/webhook-event.entity";
import {
  TransactionStatus,
  TransactionType,
} from "./entities/transaction.entity";
import { PaymentsService } from "./payments.service";
import {
  PAYMENT_CHARGE_FAILED,
  PAYMENT_CHARGE_SUCCEEDED,
  PAYMENT_SUBSCRIPTION_UPDATED,
} from "./events/payment-events";

@Injectable()
export class PaymentsWebhookService {
  private readonly logger = new Logger(PaymentsWebhookService.name);

  constructor(
    @InjectRepository(WebhookEvent)
    private readonly webhookEventRepo: Repository<WebhookEvent>,
    private readonly paymentsService: PaymentsService,
    private readonly emitter: EventEmitter2,
  ) {}

  async processEvent(event: Stripe.Event): Promise<{ handled: boolean }> {
    const alreadyProcessed = await this.webhookEventRepo.findOne({
      where: { stripeEventId: event.id },
    });
    if (alreadyProcessed) {
      this.logger.log(`Skipping already processed webhook event ${event.id}`);
      return { handled: false };
    }

    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await this.handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        );
        break;
      case "invoice.payment_succeeded":
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await this.handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      case "charge.succeeded":
        await this.handleChargeSucceeded(event.data.object as Stripe.Charge);
        break;
      case "charge.failed":
        await this.handleChargeFailed(event.data.object as Stripe.Charge);
        break;
      default:
        this.logger.log(`Unhandled webhook event type ${event.type}`);
    }

    await this.webhookEventRepo.save(
      this.webhookEventRepo.create({
        stripeEventId: event.id,
        type: event.type,
      }),
    );

    return { handled: true };
  }

  private async handleSubscriptionUpdated(
    stripeSubscription: Stripe.Subscription,
  ): Promise<void> {
    const userId =
      (stripeSubscription.metadata?.userId as string | undefined) ??
      (await this.paymentsService.findUserIdByStripeCustomerId(
        stripeSubscription.customer as string,
      ));

    if (!userId) {
      this.logger.warn(
        `Received subscription event for unknown customer ${stripeSubscription.customer}`,
      );
      return;
    }

    const subscription =
      await this.paymentsService.upsertSubscriptionFromStripe(
        userId,
        stripeSubscription,
      );

    this.emitter.emit(PAYMENT_SUBSCRIPTION_UPDATED, {
      userId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const userId = await this.resolveUserIdForCustomer(
      invoice.customer as string,
    );
    if (!userId) {
      return;
    }

    const transaction = await this.paymentsService.recordTransaction({
      userId,
      subscriptionId:
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : undefined,
      stripeObjectId: invoice.id,
      type: TransactionType.INVOICE,
      status: TransactionStatus.SUCCEEDED,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      invoiceUrl: invoice.hosted_invoice_url ?? undefined,
    });

    this.emitter.emit(PAYMENT_CHARGE_SUCCEEDED, {
      userId,
      transactionId: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency,
    });
  }

  private async handleInvoiceFailed(invoice: Stripe.Invoice): Promise<void> {
    const userId = await this.resolveUserIdForCustomer(
      invoice.customer as string,
    );
    if (!userId) {
      return;
    }

    const transaction = await this.paymentsService.recordTransaction({
      userId,
      subscriptionId:
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : undefined,
      stripeObjectId: invoice.id,
      type: TransactionType.INVOICE,
      status: TransactionStatus.FAILED,
      amount: invoice.amount_due,
      currency: invoice.currency,
      failureReason:
        invoice.last_finalization_error?.message ?? "Payment failed",
    });

    this.emitter.emit(PAYMENT_CHARGE_FAILED, {
      userId,
      transactionId: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency,
    });
  }

  private async handleChargeSucceeded(charge: Stripe.Charge): Promise<void> {
    const userId = await this.resolveUserIdForCustomer(
      charge.customer as string,
    );
    if (!userId) {
      return;
    }

    await this.paymentsService.recordTransaction({
      userId,
      stripeObjectId: charge.id,
      type: TransactionType.CHARGE,
      status: TransactionStatus.SUCCEEDED,
      amount: charge.amount,
      currency: charge.currency,
      invoiceUrl: charge.receipt_url ?? undefined,
    });
  }

  private async handleChargeFailed(charge: Stripe.Charge): Promise<void> {
    const userId = await this.resolveUserIdForCustomer(
      charge.customer as string,
    );
    if (!userId) {
      return;
    }

    await this.paymentsService.recordTransaction({
      userId,
      stripeObjectId: charge.id,
      type: TransactionType.CHARGE,
      status: TransactionStatus.FAILED,
      amount: charge.amount,
      currency: charge.currency,
      failureReason: charge.failure_message ?? "Charge failed",
    });
  }

  private async resolveUserIdForCustomer(
    stripeCustomerId: string | null,
  ): Promise<string | null> {
    if (!stripeCustomerId) {
      return null;
    }
    const userId =
      await this.paymentsService.findUserIdByStripeCustomerId(stripeCustomerId);
    if (!userId) {
      this.logger.warn(
        `Received webhook for unknown customer ${stripeCustomerId}`,
      );
    }
    return userId;
  }
}
