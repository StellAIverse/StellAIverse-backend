import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { NotFoundException } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { StripeService } from "./stripe.service";
import { PaymentCustomer } from "./entities/payment-customer.entity";
import {
  Subscription,
  SubscriptionStatus,
} from "./entities/subscription.entity";
import { Transaction } from "./entities/transaction.entity";

const mockCustomerRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockSubscriptionRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockTransactionRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockStripeService = {
  createCustomer: jest.fn(),
  attachPaymentMethod: jest.fn(),
  createSubscription: jest.fn(),
  updateSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
  listInvoices: jest.fn(),
  instance: {
    subscriptions: {
      retrieve: jest.fn(),
    },
  },
};

function buildStripeSubscription(overrides: Record<string, any> = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    current_period_start: 1700000000,
    current_period_end: 1702600000,
    cancel_at_period_end: false,
    canceled_at: null,
    items: { data: [{ id: "si_1", price: { id: "price_basic" } }] },
    ...overrides,
  };
}

describe("PaymentsService", () => {
  let service: PaymentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(PaymentCustomer),
          useValue: mockCustomerRepo,
        },
        {
          provide: getRepositoryToken(Subscription),
          useValue: mockSubscriptionRepo,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepo,
        },
        { provide: StripeService, useValue: mockStripeService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);

    jest.clearAllMocks();
    mockCustomerRepo.create.mockImplementation((p) => ({ ...p }));
    mockCustomerRepo.save.mockImplementation((p) =>
      Promise.resolve({ id: "cust-1", ...p }),
    );
    mockSubscriptionRepo.create.mockImplementation((p) => ({ ...p }));
    mockSubscriptionRepo.save.mockImplementation((p) =>
      Promise.resolve({ id: "sub-record-1", ...p }),
    );
    mockTransactionRepo.create.mockImplementation((p) => ({ ...p }));
    mockTransactionRepo.save.mockImplementation((p) =>
      Promise.resolve({ id: "txn-1", ...p }),
    );
  });

  describe("getOrCreateCustomer", () => {
    it("creates a new Stripe customer when none exists", async () => {
      mockCustomerRepo.findOne.mockResolvedValue(null);
      mockStripeService.createCustomer.mockResolvedValue({ id: "cus_123" });

      const customer = await service.getOrCreateCustomer("user-1", {});

      expect(mockStripeService.createCustomer).toHaveBeenCalled();
      expect(customer.stripeCustomerId).toBe("cus_123");
      expect(customer.userId).toBe("user-1");
    });

    it("reuses an existing customer and attaches a new payment method", async () => {
      mockCustomerRepo.findOne.mockResolvedValue({
        userId: "user-1",
        stripeCustomerId: "cus_123",
      });

      const customer = await service.getOrCreateCustomer("user-1", {
        paymentMethodId: "pm_new",
      });

      expect(mockStripeService.attachPaymentMethod).toHaveBeenCalledWith(
        "pm_new",
        "cus_123",
      );
      expect(mockStripeService.createCustomer).not.toHaveBeenCalled();
      expect(customer.stripeCustomerId).toBe("cus_123");
    });
  });

  describe("createSubscription", () => {
    it("persists a subscription created via Stripe", async () => {
      mockCustomerRepo.findOne.mockResolvedValue({
        userId: "user-1",
        stripeCustomerId: "cus_123",
      });
      mockStripeService.createSubscription.mockResolvedValue(
        buildStripeSubscription(),
      );
      mockSubscriptionRepo.findOne.mockResolvedValue(null);

      const subscription = await service.createSubscription("user-1", {
        priceId: "price_basic",
      });

      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subscription.priceId).toBe("price_basic");
      expect(subscription.stripeSubscriptionId).toBe("sub_123");
    });
  });

  describe("cancelSubscription", () => {
    it("throws NotFoundException for a subscription the user does not own", async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.cancelSubscription("user-1", "unknown-id", {}),
      ).rejects.toThrow(NotFoundException);
    });

    it("marks the subscription canceled at period end by default", async () => {
      mockSubscriptionRepo.findOne.mockResolvedValue({
        id: "sub-record-1",
        userId: "user-1",
        stripeSubscriptionId: "sub_123",
      });
      mockStripeService.cancelSubscription.mockResolvedValue(
        buildStripeSubscription({ cancel_at_period_end: true }),
      );

      const subscription = await service.cancelSubscription(
        "user-1",
        "sub-record-1",
        {},
      );

      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith(
        "sub_123",
        true,
      );
      expect(subscription.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe("recordTransaction", () => {
    it("creates a new transaction record", async () => {
      mockTransactionRepo.findOne.mockResolvedValue(null);

      const transaction = await service.recordTransaction({
        userId: "user-1",
        stripeObjectId: "in_123",
        amount: 1999,
        currency: "usd",
      });

      expect(transaction.stripeObjectId).toBe("in_123");
      expect(mockTransactionRepo.save).toHaveBeenCalled();
    });

    it("updates an existing transaction instead of duplicating it", async () => {
      const existing = {
        id: "txn-existing",
        userId: "user-1",
        stripeObjectId: "in_123",
        amount: 1999,
        currency: "usd",
      };
      mockTransactionRepo.findOne.mockResolvedValue(existing);

      await service.recordTransaction({
        stripeObjectId: "in_123",
        amount: 1999,
        currency: "usd",
        failureReason: "card_declined",
      });

      expect(mockTransactionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ failureReason: "card_declined" }),
      );
    });
  });
});
