import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  priceId: string;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;
}
