import { IsArray, IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { ConversationType } from "../entities/message.enum";

export class CreateConversationDto {
  @IsArray()
  @IsUUID("4", { each: true })
  participantIds: string[];

  @IsEnum(ConversationType)
  type: ConversationType;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}