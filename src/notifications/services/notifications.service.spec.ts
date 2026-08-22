import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { getQueueToken } from "@nestjs/bull";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { TemplateService } from "./template.service";
import { Notification } from "../entities/notification.entity";
import { NotificationPreference } from "../entities/notification-preference.entity";
import { NotificationDeliveryLog } from "../entities/notification-delivery-log.entity";
import {
  NotificationType,
  NotificationChannel,
  NotificationStatus,
  NotificationTemplate,
} from "../entities/notification.enums";

const mockNotificationRepo = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockPreferenceRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockLogRepo = {
  save: jest.fn(),
};

const mockQueue = {
  add: jest.fn(),
};

describe("NotificationsService", () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        TemplateService, // real renderer — create() genuinely renders templates
        {
          provide: getRepositoryToken(Notification),
          useValue: mockNotificationRepo,
        },
        {
          provide: getRepositoryToken(NotificationPreference),
          useValue: mockPreferenceRepo,
        },
        {
          provide: getRepositoryToken(NotificationDeliveryLog),
          useValue: mockLogRepo,
        },
        { provide: getQueueToken("notifications"), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);

    jest.clearAllMocks();
    mockNotificationRepo.create.mockImplementation((p) => ({ ...p }));
    mockNotificationRepo.save.mockImplementation((p) =>
      Promise.resolve({ id: "n1", ...p }),
    );
    mockQueue.add.mockResolvedValue(undefined);
  });

  describe("create", () => {
    it("renders the template into subject/content/metadata and enqueues the job", async () => {
      mockPreferenceRepo.findOne.mockResolvedValue({
        emailEnabled: true,
        channelPreferences: {
          [NotificationType.EMAIL]: { email: "to@example.com" },
        },
      });

      const result = await service.create({
        userId: "123e4567-e89b-12d3-a456-426614174000",
        type: NotificationType.EMAIL,
        channel: NotificationChannel.SMTP,
        template: NotificationTemplate.WELCOME,
        templateData: { name: "Ada", actionUrl: "https://app/x" },
      });

      expect(result.subject).toBe("Welcome to StellAIverse, Ada!");
      expect(result.content).toContain("Hi Ada,");
      expect(result.recipient).toBe("to@example.com");
      expect(result.metadata.renderedText).toContain("welcome to StellAIverse");
      expect(result.status).toBe(NotificationStatus.PENDING);
      expect(mockQueue.add).toHaveBeenCalledWith(
        "process-notification",
        expect.objectContaining({ notificationId: "n1", retryCount: 0 }),
        expect.objectContaining({ attempts: 5 }),
      );
    });

    it("honours explicit subject/content overrides (does not overwrite with template)", async () => {
      mockPreferenceRepo.findOne.mockResolvedValue({
        emailEnabled: true,
        channelPreferences: {
          [NotificationType.EMAIL]: { email: "to@example.com" },
        },
      });

      const result = await service.create({
        userId: "123e4567-e89b-12d3-a456-426614174000",
        type: NotificationType.EMAIL,
        channel: NotificationChannel.SMTP,
        template: NotificationTemplate.WELCOME,
        subject: "Custom subject",
        content: "<p>Custom body</p>",
        templateData: { name: "Ada" },
      });

      expect(result.subject).toBe("Custom subject");
      expect(result.content).toBe("<p>Custom body</p>");
      // renderedText is only stored when the HTML body itself came from the template
      expect(result.metadata?.renderedText).toBeUndefined();
    });

    it("resolves push tokens from preferences into metadata for push notifications", async () => {
      mockPreferenceRepo.findOne.mockResolvedValue({
        pushEnabled: true,
        channelPreferences: {
          [NotificationType.PUSH]: { pushTokens: ["tok-1", "tok-2"] },
        },
      });

      const result = await service.create({
        userId: "123e4567-e89b-12d3-a456-426614174000",
        type: NotificationType.PUSH,
        channel: NotificationChannel.FCM,
        template: NotificationTemplate.SECURITY_ALERT,
        templateData: {
          name: "Ada",
          event: "login",
          ipAddress: "1.1.1.1",
          timestamp: "now",
        },
      });

      expect(result.metadata.pushTokens).toEqual(["tok-1", "tok-2"]);
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it("throws when the channel is disabled for the user", async () => {
      mockPreferenceRepo.findOne.mockResolvedValue({
        emailEnabled: false,
        channelPreferences: {},
      });

      await expect(
        service.create({
          userId: "123e4567-e89b-12d3-a456-426614174000",
          type: NotificationType.EMAIL,
          channel: NotificationChannel.SMTP,
          template: NotificationTemplate.WELCOME,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("requeueOne", () => {
    it("resets retry state and re-enqueues a failed notification", async () => {
      mockNotificationRepo.findOne.mockResolvedValue({
        id: "n1",
        status: NotificationStatus.FAILED,
        retryCount: 3,
        nextRetryAt: new Date(),
        failureReason: "previous error",
        providerResponseCode: 500,
      });

      await service.requeueOne("n1");

      expect(mockNotificationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.PENDING,
          retryCount: 0,
          nextRetryAt: null,
          failureReason: null,
          providerResponseCode: null,
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        "process-notification",
        expect.objectContaining({ notificationId: "n1", retryCount: 0 }),
        expect.objectContaining({ attempts: 5 }),
      );
    });

    it("recovers a dead-letter notification", async () => {
      mockNotificationRepo.findOne.mockResolvedValue({
        id: "n1",
        status: NotificationStatus.DEAD_LETTER,
        retryCount: 5,
      });

      await service.requeueOne("n1");

      expect(mockNotificationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: NotificationStatus.PENDING,
          retryCount: 0,
        }),
      );
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it("rejects requeueing a notification that is not failed/dead-letter", async () => {
      mockNotificationRepo.findOne.mockResolvedValue({
        id: "n1",
        status: NotificationStatus.DELIVERED,
        retryCount: 1,
      });

      await expect(service.requeueOne("n1")).rejects.toThrow(
        BadRequestException,
      );
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it("throws NotFoundException for an unknown id", async () => {
      mockNotificationRepo.findOne.mockResolvedValue(null);
      await expect(service.requeueOne("missing")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("findFailed", () => {
    it("queries FAILED and DEAD_LETTER by default and returns a page", async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: "f1" }], 1]),
      };
      mockNotificationRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findFailed();

      expect(result).toEqual({ notifications: [{ id: "f1" }], total: 1 });
      expect(qb.where).toHaveBeenCalledWith(
        "notification.status IN (:...statuses)",
        {
          statuses: [NotificationStatus.FAILED, NotificationStatus.DEAD_LETTER],
        },
      );
    });
  });

  describe("requeueFailed", () => {
    it("resets and re-enqueues every failed/dead-letter notification", async () => {
      mockNotificationRepo.find.mockResolvedValue([
        { id: "a", status: NotificationStatus.FAILED, retryCount: 2 },
        { id: "b", status: NotificationStatus.DEAD_LETTER, retryCount: 5 },
      ]);

      const count = await service.requeueFailed({ includeDeadLetter: true });

      expect(count).toBe(2);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });
  });
});
