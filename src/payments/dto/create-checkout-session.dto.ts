import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from "class-validator";

export class CreateCheckoutSessionDto {
  /** Stripe Price ID to sell in the checkout session. */
  @IsString()
  @IsNotEmpty()
  priceId: string;

  /**
   * Checkout mode: `subscription` (default) for recurring plans, or `payment`
   * for one-off charges.
   */
  @IsOptional()
  @IsIn(["payment", "subscription"])
  mode?: "payment" | "subscription";

  /** Quantity of the price to purchase. Defaults to 1. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  quantity?: number;

  /** URL Stripe redirects to after a successful checkout. */
  @IsString()
  @IsNotEmpty()
  successUrl: string;

  /** URL Stripe redirects to if the customer cancels checkout. */
  @IsString()
  @IsNotEmpty()
  cancelUrl: string;
}
