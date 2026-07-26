import { IsOptional, IsString } from "class-validator";

export class CreateCustomerDto {
  @IsOptional()
  @IsString()
  paymentMethodId?: string;
}
