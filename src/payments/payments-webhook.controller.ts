import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Request } from "express";
import { StripeService } from "./stripe.service";
import { PaymentsWebhookService } from "./payments-webhook.service";

@ApiExcludeController()
@Controller("payments/webhook")
export class PaymentsWebhookController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly webhookService: PaymentsWebhookService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string,
  ) {
    if (!signature || !req.rawBody) {
      throw new BadRequestException("Missing Stripe signature or payload");
    }

    let event;
    try {
      event = this.stripeService.constructEvent(req.rawBody, signature);
    } catch (error) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${error.message}`,
      );
    }

    return this.webhookService.processEvent(event);
  }
}
