import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { UseGuards } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { WsJwtAuthGuard } from "./guards/ws-jwt-auth.guard";
import { MessagingService } from "./messaging.service";
import {
  MessageDeliveredEvent,
  MessageReadEvent,
  UserPresenceChangedEvent,
} from "./events/message.events";

@WebSocketGateway({
  cors: {
    origin: "*",
  },
  namespace: "/messaging",
})
@UseGuards(WsJwtAuthGuard)
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly messagingService: MessagingService,
    private eventEmitter: EventEmitter2,
  ) {}

  async handleConnection(client: Socket) {
    const userId = client.data.user?.id || client.data.user?.address;
    if (!userId) {
      client.disconnect();
      return;
    }

    // Join user to their personal room for direct messages
    client.join(`user:${userId}`);
    
    // Update user presence
    await this.messagingService.updateUserPresence(userId, true, client.id);
    
    // Notify relevant users that this user is online
    this.eventEmitter.emit(
      "user.presence.changed",
      new UserPresenceChangedEvent(userId, true),
    );
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.user?.id || client.data.user?.address;
    if (!userId) return;

    // Update user presence
    await this.messagingService.updateUserPresence(userId, false, null);
    
    // Notify relevant users that this user is offline
    this.eventEmitter.emit(
      "user.presence.changed",
      new UserPresenceChangedEvent(userId, false, new Date()),
    );
  }

  @SubscribeMessage("message:delivered")
  async handleMessageDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; conversationId: string },
  ) {
    const userId = client.data.user?.id || client.data.user?.address;
    const { messageId, conversationId } = data;

    await this.messagingService.markMessageAsDelivered(messageId, userId);
    
    this.eventEmitter.emit(
      "message.delivered",
      new MessageDeliveredEvent(messageId, conversationId, userId),
    );
    
    // Broadcast delivery status to conversation participants
    this.server.to(`conversation:${conversationId}`).emit("message:delivered", {
      messageId,
      userId,
      deliveredAt: new Date(),
    });
  }

  @SubscribeMessage("message:read")
  async handleMessageRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string; conversationId: string },
  ) {
    const userId = client.data.user?.id || client.data.user?.address;
    const { messageId, conversationId } = data;

    await this.messagingService.markMessageAsRead(messageId, userId);
    
    this.eventEmitter.emit(
      "message.read",
      new MessageReadEvent(messageId, conversationId, userId),
    );
    
    // Broadcast read status to conversation participants
    this.server.to(`conversation:${conversationId}`).emit("message:read", {
      messageId,
      userId,
      readAt: new Date(),
    });
  }

  @SubscribeMessage("conversation:join")
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.user?.id || client.data.user?.address;
    const { conversationId } = data;

    // Verify user is part of the conversation
    const isParticipant = await this.messagingService.isUserInConversation(
      conversationId,
      userId,
    );

    if (isParticipant) {
      client.join(`conversation:${conversationId}`);
    }
  }

  @SubscribeMessage("conversation:leave")
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { conversationId } = data;
    client.leave(`conversation:${conversationId}`);
  }
}