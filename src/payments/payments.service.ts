import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import Stripe from "stripe";
import { StripeService } from "./stripe.service";
import { PaymentCustomer } from "./entities/payment-customer.entity";
import {
  Subscription,
  SubscriptionStatus,
} from "./entities/subscription.entity";
import { Transaction } from "./entities/transaction.entity";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { UpdateSubscriptionDto } from "./dto/update-subscription.dto";
import { CancelSubscriptionDto } from "./dto/cancel-subscription.dto";

const STRIPE_TO_INTERNAL_STATUS: Record<string, SubscriptionStatus> = {
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.INCOMPLETE,
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELED,
  unpaid: SubscriptionStatus.UNPAID,
  paused: SubscriptionStatus.UNPAID,
};

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(PaymentCustomer)
    private readonly customerRepo: Repository<PaymentCustomer>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly stripeService: StripeService,
  ) {}

  async getOrCreateCustomer(
    userId: string,
    dto: CreateCustomerDto = {},
  ): Promise<PaymentCustomer> {
    const existing = await this.customerRepo.findOne({ where: { userId } });
    if (existing) {
      if (dto.paymentMethodId) {
        await this.stripeService.attachPaymentMethod(
          dto.paymentMethodId,
          existing.stripeCustomerId,
        );
        existing.defaultPaymentMethodId = dto.paymentMethodId;
        await this.customerRepo.save(existing);
      }
      return existing;
    }

    const stripeCustomer = await this.stripeService.createCustomer({
      metadata: { userId },
      payment_method: dto.paymentMethodId,
      invoice_settings: dto.paymentMethodId
        ? { default_payment_method: dto.paymentMethodId }
        : undefined,
    });

    const customer = this.customerRepo.create({
      userId,
      stripeCustomerId: stripeCustomer.id,
      defaultPaymentMethodId: dto.paymentMethodId,
    });

    return this.customerRepo.save(customer);
  }

  async createSubscription(
    userId: string,
    dto: CreateSubscriptionDto,
  ): Promise<Subscription> {
    const customer = await this.getOrCreateCustomer(userId, {
      paymentMethodId: dto.paymentMethodId,
    });

    const stripeSubscription = await this.stripeService.createSubscription({
      customer: customer.stripeCustomerId,
      items: [{ price: dto.priceId }],
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
      metadata: { userId },
    });

    return this.upsertSubscriptionFromStripe(userId, stripeSubscription);
  }

  async updateSubscription(
    userId: string,
    subscriptionId: string,
    dto: UpdateSubscriptionDto,
  ): Promise<Subscription> {
    const subscription = await this.getUserSubscriptionOrThrow(
      userId,
      subscriptionId,
    );

    const current = await this.stripeService.instance.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    );
    const itemId = current.items.data[0]?.id;
    if (!itemId) {
      throw new BadRequestException("Subscription has no billing item");
    }

    const stripeSubscription = await this.stripeService.updateSubscription(
      subscription.stripeSubscriptionId,
      {
        items: [{ id: itemId, price: dto.priceId }],
        proration_behavior: "create_prorations",
      },
    );

    return this.upsertSubscriptionFromStripe(userId, stripeSubscription);
  }

  async cancelSubscription(
    userId: string,
    subscriptionId: string,
    dto: CancelSubscriptionDto,
  ): Promise<Subscription> {
    const subscription = await this.getUserSubscriptionOrThrow(
      userId,
      subscriptionId,
    );

    const stripeSubscription = await this.stripeService.cancelSubscription(
      subscription.stripeSubscriptionId,
      dto.atPeriodEnd ?? true,
    );

    return this.upsertSubscriptionFromStripe(userId, stripeSubscription);
  }

  async getUserSubscriptions(userId: string): Promise<Subscription[]> {
    return this.subscriptionRepo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  async getBillingHistory(userId: string): Promise<Transaction[]> {
    return this.transactionRepo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  async getInvoices(userId: string): Promise<Stripe.Invoice[]> {
    const customer = await this.customerRepo.findOne({ where: { userId } });
    if (!customer) {
      return [];
    }
    const invoices = await this.stripeService.listInvoices(
      customer.stripeCustomerId,
    );
    return invoices.data;
  }

  private async getUserSubscriptionOrThrow(
    userId: string,
    subscriptionId: string,
  ): Promise<Subscription> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId, userId },
    });
    if (!subscription) {
      throw new NotFoundException("Subscription not found");
    }
    return subscription;
  }

  async upsertSubscriptionFromStripe(
    userId: string,
    stripeSubscription: Stripe.Subscription,
  ): Promise<Subscription> {
    let subscription = await this.subscriptionRepo.findOne({
      where: { stripeSubscriptionId: stripeSubscription.id },
    });

    const status =
      STRIPE_TO_INTERNAL_STATUS[stripeSubscription.status] ??
      SubscriptionStatus.INCOMPLETE;
    const item = stripeSubscription.items.data[0];

    const fields = {
      userId,
      stripeSubscriptionId: stripeSubscription.id,
      stripeCustomerId: stripeSubscription.customer as string,
      priceId: item?.price?.id ?? subscription?.priceId ?? "",
      status,
      currentPeriodStart: new Date(
        stripeSubscription.current_period_start * 1000,
      ),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      canceledAt: stripeSubscription.canceled_at
        ? new Date(stripeSubscription.canceled_at * 1000)
        : undefined,
    };

    if (subscription) {
      Object.assign(subscription, fields);
    } else {
      subscription = this.subscriptionRepo.create(fields);
    }

    return this.subscriptionRepo.save(subscription);
  }

  async recordTransaction(
    transaction: Partial<Transaction>,
  ): Promise<Transaction> {
    const existing = await this.transactionRepo.findOne({
      where: { stripeObjectId: transaction.stripeObjectId },
    });
    if (existing) {
      Object.assign(existing, transaction);
      return this.transactionRepo.save(existing);
    }
    return this.transactionRepo.save(this.transactionRepo.create(transaction));
  }

  async findUserIdByStripeCustomerId(
    stripeCustomerId: string,
  ): Promise<string | null> {
    const customer = await this.customerRepo.findOne({
      where: { stripeCustomerId },
    });
    return customer?.userId ?? null;
  }
}
