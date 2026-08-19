import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from "class-validator";

export class CreatePaymentIntentDto {
  /** Amount to charge, in the smallest currency unit (e.g. cents). */
  @IsInt()
  @IsPositive()
  amount: number;

  /** ISO currency code. Defaults to `usd` when omitted. */
  @IsOptional()
  @IsString()
  currency?: string;

  /** Existing Stripe payment method to charge. */
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  /** Human-readable description attached to the payment intent. */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * Client-supplied idempotency key so a retried payment submission reuses the
   * same Stripe payment intent instead of creating (and charging) a duplicate.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  idempotencyKey?: string;
}
