import { Test, TestingModule } from "@nestjs/testing";
import { WalletAuthService } from "./wallet-auth.service";
import { ChallengeService } from "./challenge.service";
import { JwtService } from "@nestjs/jwt";
import { getRepositoryToken } from "@nestjs/typeorm";
import { User, UserRole } from "src/user/entities/user.entity";
import { Wallet } from "./entities/wallet.entity";
import { Repository } from "typeorm";
import {
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";

// Mock ethers
jest.mock("ethers", () => ({
  verifyMessage: jest.fn(),
}));

describe("WalletAuthService", () => {
  let service: WalletAuthService;
  let challengeService: ChallengeService;
  let jwtService: JwtService;
  let userRepository: Repository<User>;
  let walletRepository: Repository<Wallet>;
  let verifyMessage: jest.Mock;

  const mockUser = {
    id: "123",
    username: null,
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    email: "test@example.com",
    password: null,
    emailVerified: true,
    role: UserRole.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as User;

  const mockChallengeService = {
    issueChallengeForAddress: jest.fn(),
    extractChallengeId: jest.fn(),
    consumeChallenge: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockWalletRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    // Get the mocked verifyMessage
    verifyMessage = require("ethers").verifyMessage;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletAuthService,
        {
          provide: ChallengeService,
          useValue: mockChallengeService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: mockWalletRepository,
        },
      ],
    }).compile();

    service = module.get<WalletAuthService>(WalletAuthService);
    challengeService = module.get<ChallengeService>(ChallengeService);
    jwtService = module.get<JwtService>(JwtService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    walletRepository = module.get<Repository<Wallet>>(
      getRepositoryToken(Wallet),
    );

    Object.values(mockUserRepository).forEach((mock: any) => mock.mockReset());
    Object.values(mockWalletRepository).forEach((mock: any) =>
      mock.mockReset(),
    );
    Object.values(mockChallengeService).forEach((mock: any) =>
      mock.mockReset(),
    );
    Object.values(mockJwtService).forEach((mock: any) => mock.mockReset());

    mockWalletRepository.save.mockResolvedValue({
      id: "new-wallet-id",
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      type: "secondary",
      user: mockUser,
    });
    mockWalletRepository.create.mockReturnValue({
      id: "new-wallet-id",
      address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      type: "secondary",
      user: mockUser,
    });
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("linkWallet", () => {
    const currentAddress = "0x1234567890abcdef1234567890abcdef12345678";
    const newAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const message = "Sign this message to prove ownership";
    const signature = "0x" + "1".repeat(130);
    const challengeId = "challenge-123";

    it("should successfully link a new wallet", async () => {
      mockChallengeService.extractChallengeId.mockReturnValue(challengeId);
      mockChallengeService.consumeChallenge.mockReturnValue({
        address: newAddress.toLowerCase(),
        timestamp: Date.now(),
      });
      verifyMessage.mockReturnValue(newAddress); // Mock signature verification
      mockWalletRepository.findOne.mockResolvedValue(null);
      mockWalletRepository.find.mockResolvedValue([]);
      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockUserRepository.save.mockResolvedValue({
        ...mockUser,
        walletAddress: newAddress.toLowerCase(),
      });

      const result = await service.linkWallet(
        currentAddress,
        newAddress,
        message,
        signature,
      );

      expect(result.message).toBe("Wallet successfully linked");
      expect(result.walletAddress).toBe(newAddress.toLowerCase());
      expect(mockWalletRepository.save).toHaveBeenCalled();
      expect(mockUserRepository.update).toHaveBeenCalled();
    });

    it("should throw ConflictException if new wallet is already in use", async () => {
      mockChallengeService.extractChallengeId.mockReturnValue(challengeId);
      mockChallengeService.consumeChallenge.mockReturnValue({
        address: newAddress.toLowerCase(),
        timestamp: Date.now(),
      });
      verifyMessage.mockReturnValue(newAddress); // Mock signature verification
      mockWalletRepository.findOne.mockResolvedValue({
        id: "existing-wallet",
        address: newAddress.toLowerCase(),
      }); // Wallet already exists

      await expect(
        service.linkWallet(currentAddress, newAddress, message, signature),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw UnauthorizedException for invalid challenge", async () => {
      mockChallengeService.extractChallengeId.mockReturnValue(null);

      await expect(
        service.linkWallet(currentAddress, newAddress, message, signature),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("unlinkWallet", () => {
    const walletAddress = "0x1234567890abcdef1234567890abcdef12345678";

    it("should successfully unlink wallet with verified email", async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockWalletRepository.findOne.mockResolvedValue({
        id: "wallet1",
        address: walletAddress,
        user: mockUser,
      });
      mockWalletRepository.find.mockResolvedValue([
        { id: "wallet1", address: walletAddress },
      ]);
      mockWalletRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.unlinkWallet(mockUser.id, walletAddress);

      expect(result.message).toBeDefined();
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
    });

    it("should throw BadRequestException if email not verified", async () => {
      const unverifiedUser = { ...mockUser, emailVerified: false };
      mockUserRepository.findOne.mockResolvedValue(unverifiedUser);
      mockWalletRepository.findOne.mockResolvedValue({
        id: "wallet1",
        address: walletAddress,
        user: unverifiedUser,
      });
      mockWalletRepository.find.mockResolvedValue([
        { id: "wallet1", address: walletAddress },
      ]);

      await expect(
        service.unlinkWallet(mockUser.id, walletAddress),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if user not found", async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockWalletRepository.findOne.mockResolvedValue({
        id: "wallet1",
        address: walletAddress,
        user: null,
      });
      mockWalletRepository.find.mockResolvedValue([
        { id: "wallet1", address: walletAddress },
      ]);

      await expect(
        service.unlinkWallet(mockUser.id, walletAddress),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException if email is null", async () => {
      const noEmailUser = { ...mockUser, email: null, emailVerified: false };
      mockUserRepository.findOne.mockResolvedValue(noEmailUser);
      mockWalletRepository.findOne.mockResolvedValue({
        id: "wallet1",
        address: walletAddress,
        user: noEmailUser,
      });
      mockWalletRepository.find.mockResolvedValue([
        { id: "wallet1", address: walletAddress },
      ]);

      await expect(
        service.unlinkWallet(mockUser.id, walletAddress),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("recoverWallet", () => {
    const email = "test@example.com";
    const recoveryToken = "a".repeat(64);
    const challengeMessage = "Sign this challenge";

    it("should successfully initiate wallet recovery", async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockWalletRepository.findOne.mockResolvedValue({ user: mockUser });
      mockChallengeService.issueChallengeForAddress.mockReturnValue(
        challengeMessage,
      );

      const result = await service.recoverWallet(email, recoveryToken);

      expect(result.message).toContain("Recovery initiated");
      expect(result.walletAddress).toBe(mockUser.walletAddress);
      expect(result.challenge).toBe(challengeMessage);
      expect(
        mockChallengeService.issueChallengeForAddress,
      ).toHaveBeenCalledWith(mockUser.walletAddress);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: email.toLowerCase(), emailVerified: true },
      });
    });

    it("should throw BadRequestException if user not found", async () => {
      mockUserRepository.findOne.mockResolvedValue(null);
      mockWalletRepository.findOne.mockResolvedValue(null);

      await expect(service.recoverWallet(email, recoveryToken)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException if email not verified", async () => {
      const unverifiedUser = { ...mockUser, emailVerified: false };
      mockUserRepository.findOne.mockResolvedValue(null); // Query filters by emailVerified: true
      mockWalletRepository.findOne.mockResolvedValue({ user: unverifiedUser });

      await expect(service.recoverWallet(email, recoveryToken)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("validateToken", () => {
    it("should successfully validate a valid token", () => {
      const token = "valid.jwt.token";
      const payload = {
        address: mockUser.walletAddress,
        email: mockUser.email,
        role: mockUser.role,
        iat: Math.floor(Date.now() / 1000),
      };
      mockJwtService.verify.mockReturnValue(payload);

      const result = service.validateToken(token);

      expect(result).toEqual(payload);
      expect(mockJwtService.verify).toHaveBeenCalledWith(token);
    });

    it("should throw UnauthorizedException for invalid token", () => {
      const token = "invalid.token";
      mockJwtService.verify.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      expect(() => service.validateToken(token)).toThrow(UnauthorizedException);
    });
  });
});
