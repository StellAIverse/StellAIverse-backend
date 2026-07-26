import { IsNotEmpty, IsString } from "class-validator";

export class UpdateSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  priceId: string;
}
