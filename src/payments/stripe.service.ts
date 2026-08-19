import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";

@Injectable()
export class StripeService implements OnModuleInit {
  private client: Stripe;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const secretKey = this.configService.get<string>("STRIPE_SECRET_KEY");
    this.client = new Stripe(secretKey || "sk_test_placeholder", {
      apiVersion: "2025-02-24.acacia",
    });
  }

  get instance(): Stripe {
    return this.client;
  }

  createCustomer(
    params: Stripe.CustomerCreateParams,
  ): Promise<Stripe.Customer> {
    return this.client.customers.create(params);
  }

  attachPaymentMethod(
    paymentMethodId: string,
    customerId: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.client.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  }

  createPaymentIntent(
    params: Stripe.PaymentIntentCreateParams,
    options?: Stripe.RequestOptions,
  ): Promise<Stripe.PaymentIntent> {
    return this.client.paymentIntents.create(params, options);
  }

  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
  ): Promise<Stripe.Checkout.Session> {
    return this.client.checkout.sessions.create(params);
  }

  createSubscription(
    params: Stripe.SubscriptionCreateParams,
  ): Promise<Stripe.Subscription> {
    return this.client.subscriptions.create(params);
  }

  updateSubscription(
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription> {
    return this.client.subscriptions.update(subscriptionId, params);
  }

  cancelSubscription(
    subscriptionId: string,
    atPeriodEnd: boolean,
  ): Promise<Stripe.Subscription> {
    if (atPeriodEnd) {
      return this.client.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
    return this.client.subscriptions.cancel(subscriptionId);
  }

  listInvoices(
    customerId: string,
    limit = 20,
  ): Promise<Stripe.ApiList<Stripe.Invoice>> {
    return this.client.invoices.list({ customer: customerId, limit });
  }

  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get<string>(
      "STRIPE_WEBHOOK_SECRET",
    );
    return this.client.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }
}
