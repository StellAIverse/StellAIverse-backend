import { BadRequestException } from "@nestjs/common";
import { PaymentsWebhookController } from "./payments-webhook.controller";
import { StripeService } from "./stripe.service";
import { PaymentsWebhookService } from "./payments-webhook.service";

describe("PaymentsWebhookController", () => {
  let controller: PaymentsWebhookController;
  const mockStripeService = {
    constructEvent: jest.fn(),
  };
  const mockWebhookService = {
    processEvent: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PaymentsWebhookController(
      mockStripeService as unknown as StripeService,
      mockWebhookService as unknown as PaymentsWebhookService,
    );
  });

  it("rejects requests missing the Stripe signature header", async () => {
    const req = { rawBody: Buffer.from("{}") } as any;

    await expect(
      controller.handleWebhook(req, undefined as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects requests with no raw body", async () => {
    const req = { rawBody: undefined } as any;

    await expect(controller.handleWebhook(req, "sig_123")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects a request with an invalid signature", async () => {
    const req = { rawBody: Buffer.from("{}") } as any;
    mockStripeService.constructEvent.mockImplementation(() => {
      throw new Error("invalid signature");
    });

    await expect(controller.handleWebhook(req, "bad_sig")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("delegates a verified event to the webhook service", async () => {
    const req = { rawBody: Buffer.from("{}") } as any;
    const event = { id: "evt_1", type: "invoice.payment_succeeded" };
    mockStripeService.constructEvent.mockReturnValue(event);
    mockWebhookService.processEvent.mockResolvedValue({ handled: true });

    const result = await controller.handleWebhook(req, "sig_123");

    expect(mockWebhookService.processEvent).toHaveBeenCalledWith(event);
    expect(result).toEqual({ handled: true });
  });
});
