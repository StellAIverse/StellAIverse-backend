import { Module, OnModuleInit } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MessagingGateway } from "./messaging.gateway";
import { MessagingService } from "./messaging.service";
import { MessagingController } from "./messaging.controller";
import { Conversation } from "./entities/conversation.entity";
import { Message } from "./entities/message.entity";
import { UserPresence } from "./entities/user-presence.entity";
import { User } from "../user/entities/user.entity";
import { WsJwtAuthGuard } from "./guards/ws-jwt-auth.guard";
import { TokenBlacklistService } from "../auth/token-blacklist.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, UserPresence, User]),
  ],
  providers: [MessagingGateway, MessagingService, WsJwtAuthGuard, TokenBlacklistService],
  controllers: [MessagingController],
  exports: [MessagingService],
})
export class MessagingModule implements OnModuleInit {
  constructor(private readonly messagingService: MessagingService, private readonly gateway: MessagingGateway) {}

  onModuleInit() {
    // Pass the socket.io server instance to the messaging service
    this.messagingService.setSocketServer(this.gateway.server);
  }
}