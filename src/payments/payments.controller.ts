import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthUser } from "../auth/strategies/interfaces/auth-strategy.interface";
import { PaymentsService } from "./payments.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import { UpdateSubscriptionDto } from "./dto/update-subscription.dto";
import { CancelSubscriptionDto } from "./dto/cancel-subscription.dto";
import { CreatePaymentIntentDto } from "./dto/create-payment-intent.dto";
import { CreateCheckoutSessionDto } from "./dto/create-checkout-session.dto";

@ApiTags("payments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post("customer")
  @ApiOperation({
    summary: "Create or update the billing customer for the current user",
  })
  createCustomer(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.paymentsService.getOrCreateCustomer(user.id, dto);
  }

  @Post("payment-intents")
  @ApiOperation({
    summary: "Create a Stripe payment intent for a one-off charge",
  })
  createPaymentIntent(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePaymentIntentDto,
  ) {
    return this.paymentsService.createPaymentIntent(user.id, dto);
  }

  @Post("checkout")
  @ApiOperation({
    summary: "Create a Stripe Checkout session and return its redirect URL",
  })
  createCheckoutSession(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.paymentsService.createCheckoutSession(user.id, dto);
  }

  @Post("subscriptions")
  @ApiOperation({ summary: "Create a subscription for the current user" })
  createSubscription(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.paymentsService.createSubscription(user.id, dto);
  }

  @Get("subscriptions")
  @ApiOperation({ summary: "List subscriptions for the current user" })
  getSubscriptions(@CurrentUser() user: AuthUser) {
    return this.paymentsService.getUserSubscriptions(user.id);
  }

  @Patch("subscriptions/:id")
  @ApiOperation({ summary: "Change the plan of an existing subscription" })
  updateSubscription(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.paymentsService.updateSubscription(user.id, id, dto);
  }

  @Delete("subscriptions/:id")
  @ApiOperation({ summary: "Cancel a subscription" })
  cancelSubscription(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: CancelSubscriptionDto,
  ) {
    return this.paymentsService.cancelSubscription(user.id, id, dto);
  }

  @Get("invoices")
  @ApiOperation({ summary: "List invoices for the current user" })
  getInvoices(@CurrentUser() user: AuthUser) {
    return this.paymentsService.getInvoices(user.id);
  }

  @Get("transactions")
  @ApiOperation({ summary: "Get billing history for the current user" })
  getBillingHistory(@CurrentUser() user: AuthUser) {
    return this.paymentsService.getBillingHistory(user.id);
  }
}
