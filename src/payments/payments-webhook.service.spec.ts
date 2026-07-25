import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { PaymentsWebhookService } from "./payments-webhook.service";
import { PaymentsService } from "./payments.service";
import { WebhookEvent } from "./entities/webhook-event.entity";
import {
  TransactionStatus,
  TransactionType,
} from "./entities/transaction.entity";

const mockWebhookEventRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockPaymentsService = {
  upsertSubscriptionFromStripe: jest.fn(),
  recordTransaction: jest.fn(),
  findUserIdByStripeCustomerId: jest.fn(),
};

const mockEmitter = {
  emit: jest.fn(),
};

describe("PaymentsWebhookService", () => {
  let service: PaymentsWebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsWebhookService,
        {
          provide: getRepositoryToken(WebhookEvent),
          useValue: mockWebhookEventRepo,
        },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: EventEmitter2, useValue: mockEmitter },
      ],
    }).compile();

    service = module.get<PaymentsWebhookService>(PaymentsWebhookService);

    jest.clearAllMocks();
    mockWebhookEventRepo.create.mockImplementation((p) => ({ ...p }));
    mockWebhookEventRepo.save.mockImplementation((p) => Promise.resolve(p));
  });

  it("skips events that were already processed", async () => {
    mockWebhookEventRepo.findOne.mockResolvedValue({ stripeEventId: "evt_1" });

    const result = await service.processEvent({
      id: "evt_1",
      type: "invoice.payment_succeeded",
      data: { object: {} },
    } as any);

    expect(result.handled).toBe(false);
    expect(mockPaymentsService.recordTransaction).not.toHaveBeenCalled();
  });

  it("records a successful invoice payment and emits an event", async () => {
    mockWebhookEventRepo.findOne.mockResolvedValue(null);
    mockPaymentsService.findUserIdByStripeCustomerId.mockResolvedValue(
      "user-1",
    );
    mockPaymentsService.recordTransaction.mockResolvedValue({
      id: "txn-1",
      amount: 1999,
      currency: "usd",
    });

    const result = await service.processEvent({
      id: "evt_2",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_123",
          customer: "cus_123",
          subscription: "sub_123",
          amount_paid: 1999,
          currency: "usd",
          hosted_invoice_url: "https://stripe.test/invoice",
        },
      },
    } as any);

    expect(result.handled).toBe(true);
    expect(mockPaymentsService.recordTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        status: TransactionStatus.SUCCEEDED,
        type: TransactionType.INVOICE,
      }),
    );
    expect(mockEmitter.emit).toHaveBeenCalled();
    expect(mockWebhookEventRepo.save).toHaveBeenCalled();
  });

  it("records a failed invoice payment without throwing", async () => {
    mockWebhookEventRepo.findOne.mockResolvedValue(null);
    mockPaymentsService.findUserIdByStripeCustomerId.mockResolvedValue(
      "user-1",
    );
    mockPaymentsService.recordTransaction.mockResolvedValue({
      id: "txn-2",
      amount: 1999,
      currency: "usd",
    });

    const result = await service.processEvent({
      id: "evt_3",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_456",
          customer: "cus_123",
          subscription: "sub_123",
          amount_due: 1999,
          currency: "usd",
        },
      },
    } as any);

    expect(result.handled).toBe(true);
    expect(mockPaymentsService.recordTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ status: TransactionStatus.FAILED }),
    );
  });

  it("updates subscription state on customer.subscription.updated", async () => {
    mockWebhookEventRepo.findOne.mockResolvedValue(null);
    mockPaymentsService.findUserIdByStripeCustomerId.mockResolvedValue(
      "user-1",
    );
    mockPaymentsService.upsertSubscriptionFromStripe.mockResolvedValue({
      id: "sub-record-1",
      status: "active",
    });

    const result = await service.processEvent({
      id: "evt_4",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          metadata: {},
        },
      },
    } as any);

    expect(result.handled).toBe(true);
    expect(
      mockPaymentsService.upsertSubscriptionFromStripe,
    ).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ id: "sub_123" }),
    );
    expect(mockEmitter.emit).toHaveBeenCalled();
  });

  it("does nothing for an unknown customer", async () => {
    mockWebhookEventRepo.findOne.mockResolvedValue(null);
    mockPaymentsService.findUserIdByStripeCustomerId.mockResolvedValue(null);

    const result = await service.processEvent({
      id: "evt_5",
      type: "charge.succeeded",
      data: {
        object: {
          id: "ch_123",
          customer: "cus_unknown",
          amount: 500,
          currency: "usd",
        },
      },
    } as any);

    expect(result.handled).toBe(true);
    expect(mockPaymentsService.recordTransaction).not.toHaveBeenCalled();
  });
});
