import { NotificationProcessor } from "./notification.processor";
import { NotificationStatus } from "../entities/notification.enums";

const mockNotificationRepo = {
  findOne: jest.fn(),
  update: jest.fn(),
};

const mockDeliveryLogRepo = {
  save: jest.fn(),
};

const mockProvider = { send: jest.fn(), channel: "smtp" };
const mockProviderFactory = {
  getProvider: jest.fn().mockReturnValue(mockProvider),
};

const makeJob = (data: { notificationId: string; retryCount: number }) =>
  ({ data }) as any;

describe("NotificationProcessor", () => {
  let processor: NotificationProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationRepo.update.mockResolvedValue(undefined);
    mockDeliveryLogRepo.save.mockResolvedValue(undefined);
    mockProviderFactory.getProvider.mockReturnValue(mockProvider);

    processor = new NotificationProcessor(
      mockNotificationRepo as any,
      mockDeliveryLogRepo as any,
      mockProviderFactory as any,
    );
  });

  it("marks a notification DELIVERED on provider success and logs it", async () => {
    mockNotificationRepo.findOne.mockResolvedValue({
      id: "n1",
      channel: "smtp",
      status: NotificationStatus.PENDING,
      retryCount: 0,
    });
    mockProvider.send.mockResolvedValue({
      success: true,
      messageId: "ok-1",
      response: { ok: true },
    });

    await processor.processNotification(
      makeJob({ notificationId: "n1", retryCount: 0 }),
    );

    expect(mockNotificationRepo.update).toHaveBeenCalledWith(
      "n1",
      expect.objectContaining({
        status: NotificationStatus.DELIVERED,
        retryCount: 1,
      }),
    );
    expect(mockDeliveryLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "n1",
        success: true,
        attemptNumber: 1,
      }),
    );
  });

  it("marks FAILED, sets nextRetryAt, and rethrows when attempts remain", async () => {
    mockNotificationRepo.findOne.mockResolvedValue({
      id: "n1",
      channel: "smtp",
      status: NotificationStatus.PENDING,
      retryCount: 0,
    });
    mockProvider.send.mockResolvedValue({
      success: false,
      error: "boom",
      statusCode: 500,
    });

    await expect(
      processor.processNotification(
        makeJob({ notificationId: "n1", retryCount: 0 }),
      ),
    ).rejects.toThrow("boom");

    expect(mockNotificationRepo.update).toHaveBeenCalledWith(
      "n1",
      expect.objectContaining({
        status: NotificationStatus.FAILED,
        retryCount: 1,
        failureReason: "boom",
        providerResponseCode: 500,
        nextRetryAt: expect.any(Date),
      }),
    );
    expect(mockDeliveryLogRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        attemptNumber: 1,
        errorMessage: "boom",
      }),
    );
  });

  it("moves to DEAD_LETTER on the final attempt (no nextRetryAt)", async () => {
    mockNotificationRepo.findOne.mockResolvedValue({
      id: "n1",
      channel: "smtp",
      status: NotificationStatus.PENDING,
      retryCount: 4, // newRetryCount = 5 === maxRetries -> dead-letter
    });
    mockProvider.send.mockResolvedValue({
      success: false,
      error: "still failing",
      statusCode: 500,
    });

    await expect(
      processor.processNotification(
        makeJob({ notificationId: "n1", retryCount: 4 }),
      ),
    ).rejects.toThrow();

    const deadLetterCall = mockNotificationRepo.update.mock.calls.find(
      ([, patch]) => patch.status === NotificationStatus.DEAD_LETTER,
    );
    expect(deadLetterCall).toBeDefined();
    expect(deadLetterCall[1]).toEqual(
      expect.objectContaining({
        status: NotificationStatus.DEAD_LETTER,
        retryCount: 5,
      }),
    );
    // dead-letter must not schedule another retry
    expect(deadLetterCall[1].nextRetryAt).toBeUndefined();
  });

  it("skips notifications already in the dead-letter queue", async () => {
    mockNotificationRepo.findOne.mockResolvedValue({
      id: "n1",
      channel: "smtp",
      status: NotificationStatus.DEAD_LETTER,
      retryCount: 5,
    });

    await processor.processNotification(
      makeJob({ notificationId: "n1", retryCount: 5 }),
    );

    expect(mockProvider.send).not.toHaveBeenCalled();
    expect(mockNotificationRepo.update).not.toHaveBeenCalled();
  });

  it("returns quietly when the notification no longer exists", async () => {
    mockNotificationRepo.findOne.mockResolvedValue(null);

    await expect(
      processor.processNotification(
        makeJob({ notificationId: "gone", retryCount: 0 }),
      ),
    ).resolves.toBeUndefined();
    expect(mockProvider.send).not.toHaveBeenCalled();
  });

  it("uses capped exponential backoff", () => {
    const backoff = (n: number): number =>
      (processor as any).calculateBackoff(n);

    expect(backoff(0)).toBe(1000); // 1s
    expect(backoff(1)).toBe(2000); // 2s
    expect(backoff(2)).toBe(4000); // 4s
    expect(backoff(4)).toBe(16000); // 16s
    expect(backoff(20)).toBe(300000); // capped at 5 min
  });
});
