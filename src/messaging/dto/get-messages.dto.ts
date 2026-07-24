import { IsOptional, IsUUID, IsInt, Min } from "class-validator";
import { Type } from "class-transformer";

export class GetMessagesDto {
  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 50;
}