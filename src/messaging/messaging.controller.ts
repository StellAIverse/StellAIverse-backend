import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { StrategyAuthGuard } from "../auth/guards/strategy-auth.guard";
import { MessagingService } from "./messaging.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { GetMessagesDto } from "./dto/get-messages.dto";
import { Conversation } from "./entities/conversation.entity";
import { Message } from "./entities/message.entity";
import { UserPresence } from "./entities/user-presence.entity";

@Controller("messaging")
@UseGuards(StrategyAuthGuard)
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post("conversations")
  async createConversation(
    @Body() createConversationDto: CreateConversationDto,
    @CurrentUser() user: any,
  ): Promise<Conversation> {
    const userId = user.id || user.address;
    return this.messagingService.createConversation(createConversationDto, userId);
  }

  @Post("messages")
  async sendMessage(
    @Body() sendMessageDto: SendMessageDto,
    @CurrentUser() user: any,
  ): Promise<Message> {
    const userId = user.id || user.address;
    return this.messagingService.sendMessage(sendMessageDto, userId);
  }

  @Get("conversations/:conversationId/messages")
  async getConversationMessages(
    @Param("conversationId") conversationId: string,
    @Query() getMessagesDto: GetMessagesDto,
    @CurrentUser() user: any,
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const userId = user.id || user.address;
    return this.messagingService.getConversationMessages(
      conversationId,
      userId,
      getMessagesDto,
    );
  }

  @Get("conversations")
  async getUserConversations(@CurrentUser() user: any): Promise<Conversation[]> {
    const userId = user.id || user.address;
    return this.messagingService.getUserConversations(userId);
  }

  @Get("users/:userId/presence")
  async getUserPresence(
    @Param("userId") userId: string,
  ): Promise<UserPresence> {
    return this.messagingService.getUserPresence(userId);
  }
}