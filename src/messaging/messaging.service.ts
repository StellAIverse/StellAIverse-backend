import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan, In } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Conversation } from "./entities/conversation.entity";
import { Message } from "./entities/message.entity";
import { UserPresence } from "./entities/user-presence.entity";
import { User } from "../user/entities/user.entity";
import { MessageStatus, ConversationType } from "./entities/message.enum";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { GetMessagesDto } from "./dto/get-messages.dto";
import { MessageSentEvent } from "./events/message.events";
import { Server } from "socket.io";

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(UserPresence)
    private readonly userPresenceRepository: Repository<UserPresence>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private eventEmitter: EventEmitter2,
  ) {}

  setSocketServer(server: Server) {
    this.server = server;
  }
  private server: Server;

  async createConversation(
    createConversationDto: CreateConversationDto,
    creatorId: string,
  ): Promise<Conversation> {
    // Add creator to participants if not already included
    const participantIds = [...new Set([...createConversationDto.participantIds, creatorId])];
    
    // Validate all participants exist
    const participants = await this.userRepository.findBy({
      id: In(participantIds),
    });

    if (participants.length !== participantIds.length) {
      throw new BadRequestException("One or more participants do not exist");
    }

    // For private conversations, check if one already exists between these users
    if (createConversationDto.type === ConversationType.PRIVATE && participants.length === 2) {
      const existingConversation = await this.conversationRepository
        .createQueryBuilder("conversation")
        .leftJoinAndSelect("conversation.participants", "participant")
        .where("conversation.type = :type", { type: ConversationType.PRIVATE })
        .andWhere("participant.id IN (:...ids)", { ids: participantIds })
        .groupBy("conversation.id")
        .having("COUNT(DISTINCT participant.id) = :count", { count: 2 })
        .getOne();

      if (existingConversation) {
        return existingConversation;
      }
    }

    const conversation = this.conversationRepository.create({
      ...createConversationDto,
      participants,
    });

    return this.conversationRepository.save(conversation);
  }

  async sendMessage(
    sendMessageDto: SendMessageDto,
    senderId: string,
  ): Promise<Message> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: sendMessageDto.conversationId },
      relations: ["participants"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    // Verify sender is in conversation
    const isSenderParticipant = conversation.participants.some(
      (p) => p.id === senderId,
    );
    if (!isSenderParticipant) {
      throw new ForbiddenException("You are not a participant in this conversation");
    }

    const sender = await this.userRepository.findOneBy({ id: senderId });
    if (!sender) {
      throw new NotFoundException("Sender not found");
    }

    const message = this.messageRepository.create({
      content: sendMessageDto.content,
      metadata: sendMessageDto.metadata,
      sender,
      conversation,
      status: MessageStatus.SENT,
    });

    const savedMessage = await this.messageRepository.save(message);
    
    // Update conversation's lastMessageAt
    conversation.lastMessageAt = new Date();
    await this.conversationRepository.save(conversation);

    // Get recipient IDs (all participants except sender)
    const recipientIds = conversation.participants
      .filter((p) => p.id !== senderId)
      .map((p) => p.id);

    // Emit event
    this.eventEmitter.emit(
      "message.sent",
      new MessageSentEvent(savedMessage, conversation.id, recipientIds),
    );

    // Send to all users in the conversation room
    if (this.server) {
      this.server.to(`conversation:${conversation.id}`).emit("message:new", {
        ...savedMessage,
        sender: { id: sender.id, username: sender.username },
      });

      // Also send to each recipient's personal room if they're not in the conversation room
      for (const recipientId of recipientIds) {
        this.server.to(`user:${recipientId}`).emit("message:notification", {
          message: savedMessage,
          conversationId: conversation.id,
        });
      }
    }

    return savedMessage;
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
    getMessagesDto: GetMessagesDto,
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ["participants"],
    });

    if (!conversation) {
      throw new NotFoundException("Conversation not found");
    }

    // Verify user is in conversation
    const isParticipant = conversation.participants.some((p) => p.id === userId);
    if (!isParticipant) {
      throw new ForbiddenException("You are not a participant in this conversation");
    }

    const query = this.messageRepository
      .createQueryBuilder("message")
      .leftJoinAndSelect("message.sender", "sender")
      .where("message.conversation.id = :conversationId", { conversationId })
      .orderBy("message.createdAt", "DESC")
      .limit(getMessagesDto.limit + 1);

    if (getMessagesDto.before) {
      const beforeMessage = await this.messageRepository.findOneBy({
        id: getMessagesDto.before,
      });
      if (beforeMessage) {
        query.andWhere("message.createdAt < :beforeDate", {
          beforeDate: beforeMessage.createdAt,
        });
      }
    }

    const messages = await query.getMany();
    const hasMore = messages.length > getMessagesDto.limit;
    const limitedMessages = messages.slice(0, getMessagesDto.limit);

    return { messages: limitedMessages, hasMore };
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    return this.conversationRepository
      .createQueryBuilder("conversation")
      .leftJoinAndSelect("conversation.participants", "participant")
      .leftJoinAndSelect("conversation.messages", "messages", "messages.createdAt = (SELECT MAX(m.createdAt) FROM message m WHERE m.conversation.id = conversation.id)")
      .leftJoinAndSelect("messages.sender", "lastMessageSender")
      .where("participant.id = :userId", { userId })
      .orderBy("conversation.lastMessageAt", "DESC")
      .getMany();
  }

  async markMessageAsDelivered(messageId: string, userId: string): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ["conversation", "conversation.participants"],
    });

    if (!message) {
      throw new NotFoundException("Message not found");
    }

    // Verify user is in conversation
    const isParticipant = message.conversation.participants.some(
      (p) => p.id === userId,
    );
    if (!isParticipant) {
      throw new ForbiddenException("You are not a participant in this conversation");
    }

    if (message.status === MessageStatus.SENT) {
      message.status = MessageStatus.DELIVERED;
      message.deliveredAt = new Date();
      return this.messageRepository.save(message);
    }

    return message;
  }

  async markMessageAsRead(messageId: string, userId: string): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ["conversation", "conversation.participants"],
    });

    if (!message) {
      throw new NotFoundException("Message not found");
    }

    // Verify user is in conversation
    const isParticipant = message.conversation.participants.some(
      (p) => p.id === userId,
    );
    if (!isParticipant) {
      throw new ForbiddenException("You are not a participant in this conversation");
    }

    if (message.status !== MessageStatus.READ) {
      message.status = MessageStatus.READ;
      message.readAt = new Date();
      return this.messageRepository.save(message);
    }

    return message;
  }

  async updateUserPresence(
    userId: string,
    isOnline: boolean,
    socketId: string | null,
  ): Promise<UserPresence> {
    let userPresence = await this.userPresenceRepository.findOne({
      where: { user: { id: userId } },
    });

    if (!userPresence) {
      const user = await this.userRepository.findOneBy({ id: userId });
      if (!user) {
        throw new NotFoundException("User not found");
      }
      userPresence = this.userPresenceRepository.create({ user });
    }

    userPresence.isOnline = isOnline;
    userPresence.currentSocketId = socketId;
    if (!isOnline) {
      userPresence.lastSeenAt = new Date();
    }

    return this.userPresenceRepository.save(userPresence);
  }

  async getUserPresence(userId: string): Promise<UserPresence> {
    const presence = await this.userPresenceRepository.findOne({
      where: { user: { id: userId } },
    });
    if (!presence) {
      return {
        id: "",
        user: null,
        isOnline: false,
        lastSeenAt: null,
        currentSocketId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    return presence;
  }

  async isUserInConversation(conversationId: string, userId: string): Promise<boolean> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ["participants"],
    });
    if (!conversation) return false;
    return conversation.participants.some((p) => p.id === userId);
  }

  // Archive messages older than 1 year (cleanup strategy)
  async archiveOldMessages(): Promise<number> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const oldMessages = await this.messageRepository.find({
      where: {
        createdAt: LessThan(oneYearAgo),
      },
    });

    // In a real implementation, you would move these to an archive table or storage
    // For now, we'll just count them - you could implement soft delete or move to cold storage
    return oldMessages.length;
  }
}