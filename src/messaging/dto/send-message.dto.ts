import { IsString, IsUUID, IsOptional, IsObject } from "class-validator";

export class SendMessageDto {
  @IsUUID()
  conversationId: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}