import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LoginAttemptService } from "./login-attempt.service";
import { LoginAttempt } from "./entities/auth.entity";
import { User, UserRole, KycStatus } from "src/user/entities/user.entity";

describe("LoginAttemptService", () => {
  let service: LoginAttemptService;
  let loginAttemptRepository: Repository<LoginAttempt>;

  const mockLoginAttemptRepository = {
    create: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockUser: User = {
    id: "user-id-1",
    email: "test@example.com",
    username: "testuser",
    password: "hashedpassword",
    isActive: true,
    failedLoginAttempts: 0,
    walletAddress: "0x123",
    role: UserRole.USER,
    kycStatus: KycStatus.UNVERIFIED,
    emailVerified: false,
    displayName: null,
    bio: null,
    avatar: null,
    preferences: {},
    referralCode: null,
    referredById: null,
    referredBy: null,
    referrals: [],
    provenanceRecords: [],
    wallets: [],
    lastLoginAt: null,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginAttemptService,
        {
          provide: getRepositoryToken(LoginAttempt),
          useValue: mockLoginAttemptRepository,
        },
      ],
    }).compile();

    service = module.get<LoginAttemptService>(LoginAttemptService);
    loginAttemptRepository = module.get<Repository<LoginAttempt>>(
      getRepositoryToken(LoginAttempt),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("recordLoginAttempt", () => {
    it("should record a successful login attempt", async () => {
      const mockAttempt = {
        userId: mockUser.id,
        email: mockUser.email,
        success: true,
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
      };
      mockLoginAttemptRepository.create.mockReturnValue(mockAttempt);
      mockLoginAttemptRepository.save.mockResolvedValue(mockAttempt);

      await service.recordLoginAttempt(
        mockUser,
        mockUser.email,
        true,
        "127.0.0.1",
        "Mozilla/5.0",
      );

      expect(loginAttemptRepository.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        email: mockUser.email,
        success: true,
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
      });
      expect(loginAttemptRepository.save).toHaveBeenCalledWith(mockAttempt);
    });

    it("should record a failed login attempt with failure reason", async () => {
      const mockAttempt = {
        userId: mockUser.id,
        email: mockUser.email,
        success: false,
        failureReason: "Invalid password",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
      };
      mockLoginAttemptRepository.create.mockReturnValue(mockAttempt);
      mockLoginAttemptRepository.save.mockResolvedValue(mockAttempt);

      await service.recordLoginAttempt(
        mockUser,
        mockUser.email,
        false,
        "127.0.0.1",
        "Mozilla/5.0",
        "Invalid password",
      );

      expect(loginAttemptRepository.create).toHaveBeenCalledWith({
        userId: mockUser.id,
        email: mockUser.email,
        success: false,
        failureReason: "Invalid password",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
      });
      expect(loginAttemptRepository.save).toHaveBeenCalledWith(mockAttempt);
    });

    it("should record a failed login attempt for non-existent user", async () => {
      const mockAttempt = {
        userId: null,
        email: "nonexistent@example.com",
        success: false,
        failureReason: "User not found",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
      };
      mockLoginAttemptRepository.create.mockReturnValue(mockAttempt);
      mockLoginAttemptRepository.save.mockResolvedValue(mockAttempt);

      await service.recordLoginAttempt(
        null,
        "nonexistent@example.com",
        false,
        "127.0.0.1",
        "Mozilla/5.0",
        "User not found",
      );

      expect(loginAttemptRepository.create).toHaveBeenCalledWith({
        userId: null,
        email: "nonexistent@example.com",
        success: false,
        failureReason: "User not found",
        ipAddress: "127.0.0.1",
        userAgent: "Mozilla/5.0",
      });
      expect(loginAttemptRepository.save).toHaveBeenCalledWith(mockAttempt);
    });
  });

  describe("getFailedAttemptsCount", () => {
    it("should return count of failed attempts for email", async () => {
      mockLoginAttemptRepository.count.mockResolvedValue(3);

      const count = await service.getFailedAttemptsCount(
        "test@example.com",
        15,
      );

      expect(count).toBe(3);
      expect(loginAttemptRepository.count).toHaveBeenCalledWith({
        where: {
          email: "test@example.com",
          success: false,
          createdAt: { $gte: expect.any(Date) } as any,
        },
      });
    });

    it("should use default time window if not specified", async () => {
      mockLoginAttemptRepository.count.mockResolvedValue(5);

      const count = await service.getFailedAttemptsCount("test@example.com");

      expect(count).toBe(5);
    });
  });

  describe("getFailedAttemptsForUser", () => {
    it("should return count of failed attempts for user", async () => {
      mockLoginAttemptRepository.count.mockResolvedValue(2);

      const count = await service.getFailedAttemptsForUser(
        "user-id-1",
        15,
      );

      expect(count).toBe(2);
      expect(loginAttemptRepository.count).toHaveBeenCalledWith({
        where: {
          userId: "user-id-1",
          success: false,
          createdAt: { $gte: expect.any(Date) } as any,
        },
      });
    });
  });

  describe("cleanupOldAttempts", () => {
    it("should delete old login attempts", async () => {
      const mockQueryBuilder = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 10 }),
      };
      mockLoginAttemptRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      await service.cleanupOldAttempts(30);

      expect(mockLoginAttemptRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        "createdAt < :cutoffDate",
        expect.objectContaining({
          cutoffDate: expect.any(Date),
        }),
      );
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });
  });
});
