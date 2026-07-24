import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Repository } from "typeorm";
import { MessagingService } from "./messaging.service";
import { Conversation } from "./entities/conversation.entity";
import { Message } from "./entities/message.entity";
import { UserPresence } from "./entities/user-presence.entity";
import { User } from "../user/entities/user.entity";
import { ConversationType, MessageStatus } from "./entities/message.enum";
import { CreateConversationDto } from "./dto/create-conversation.dto";

const mockUser = {
  id: "user-123",
  username: "testuser",
  email: "test@example.com",
};

const mockUser2 = {
  id: "user-456",
  username: "testuser2",
  email: "test2@example.com",
};

describe("MessagingService", () => {
  let service: MessagingService;
  let conversationRepository: Repository<Conversation>;
  let messageRepository: Repository<Message>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        EventEmitter2,
        {
          provide: getRepositoryToken(Conversation),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              having: jest.fn().mockReturnThis(),
              getOne: jest.fn().mockResolvedValue(null),
            })),
          },
        },
        {
          provide: getRepositoryToken(Message),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserPresence),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findBy: jest.fn().mockResolvedValue([mockUser, mockUser2]),
            findOneBy: jest.fn().mockResolvedValue(mockUser),
          },
        },
      ],
    }).compile();

    service = module.get<MessagingService>(MessagingService);
    conversationRepository = module.get<Repository<Conversation>>(getRepositoryToken(Conversation));
    messageRepository = module.get<Repository<Message>>(getRepositoryToken(Message));
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should create a conversation", async () => {
    const createDto: CreateConversationDto = {
      participantIds: ["user-456"],
      type: ConversationType.PRIVATE,
    };

    const mockConversation = {
      id: "conv-123",
      participants: [mockUser, mockUser2],
      type: ConversationType.PRIVATE,
    };

    jest.spyOn(conversationRepository, "create").mockReturnValue(mockConversation as any);
    jest.spyOn(conversationRepository, "save").mockResolvedValue(mockConversation as any);

    const result = await service.createConversation(createDto, "user-123");
    expect(result).toEqual(mockConversation);
    expect(conversationRepository.create).toHaveBeenCalled();
  });

  it("should send a message with correct status", async () => {
    const mockConversation = {
      id: "conv-123",
      participants: [mockUser, mockUser2],
    };

    const mockMessage = {
      id: "msg-123",
      content: "Hello world",
      sender: mockUser,
      conversation: mockConversation,
      status: MessageStatus.SENT,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    jest.spyOn(conversationRepository, "findOne").mockResolvedValue(mockConversation as any);
    jest.spyOn(messageRepository, "create").mockReturnValue(mockMessage as any);
    jest.spyOn(messageRepository, "save").mockResolvedValue(mockMessage as any);

    const result = await service.sendMessage(
      { conversationId: "conv-123", content: "Hello world" },
      "user-123"
    );

    expect(result.status).toBe(MessageStatus.SENT);
    expect(result.content).toBe("Hello world");
  });

  it("should mark message as delivered", async () => {
    const mockConversation = {
      id: "conv-123",
      participants: [mockUser, mockUser2],
    };

    const mockMessage = {
      id: "msg-123",
      content: "Hello world",
      sender: mockUser,
      conversation: mockConversation,
      status: MessageStatus.SENT,
      save: jest.fn(),
    };

    jest.spyOn(messageRepository, "findOne").mockResolvedValue(mockMessage as any);
    jest.spyOn(messageRepository, "save").mockImplementation((msg) => Promise.resolve(msg as any));

    const result = await service.markMessageAsDelivered("msg-123", "user-456");
    expect(result.status).toBe(MessageStatus.DELIVERED);
    expect(result.deliveredAt).toBeDefined();
  });

  it("should mark message as read", async () => {
    const mockConversation = {
      id: "conv-123",
      participants: [mockUser, mockUser2],
    };

    const mockMessage = {
      id: "msg-123",
      content: "Hello world",
      sender: mockUser,
      conversation: mockConversation,
      status: MessageStatus.DELIVERED,
      deliveredAt: new Date(),
      save: jest.fn(),
    };

    jest.spyOn(messageRepository, "findOne").mockResolvedValue(mockMessage as any);
    jest.spyOn(messageRepository, "save").mockImplementation((msg) => Promise.resolve(msg as any));

    const result = await service.markMessageAsRead("msg-123", "user-456");
    expect(result.status).toBe(MessageStatus.READ);
    expect(result.readAt).toBeDefined();
  });
});