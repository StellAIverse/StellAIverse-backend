import { IsIn, IsInt, IsOptional, Min } from "class-validator";

export class UpdateRateLimitPolicyDto {
  @IsInt()
  @Min(1)
  limit: number;

  @IsInt()
  @Min(1)
  windowMs: number;

  @IsInt()
  @Min(0)
  burst = 0;

  @IsOptional()
  @IsIn(["token-bucket", "leaky-bucket"])
  algorithm?: "token-bucket" | "leaky-bucket";
}
