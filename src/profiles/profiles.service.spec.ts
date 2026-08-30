import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, UserRole } from "src/user/entities/user.entity";
import { ProfilesService } from "./profiles.service";
import { StorageService } from "./services/storage.service";
import { FileValidationService } from "./services/file-validation.service";
import { BadRequestException, NotFoundException, ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const mockUserRepository = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

const mockStorageService = () => ({
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
});

const mockFileValidationService = () => ({
  validateFile: jest.fn(),
});

const mockConfigService = () => ({
  get: jest.fn((key: string) => {
    const defaults = {
      MAX_AVATAR_SIZE: 5 * 1024 * 1024,
      STORAGE_TYPE: "local",
    };
    return defaults[key];
  }),
});

describe("ProfilesService", () => {
  let service: ProfilesService;
  let userRepository: Repository<User>;
  let storageService: StorageService;
  let fileValidationService: FileValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: getRepositoryToken(User), useFactory: mockUserRepository },
        { provide: StorageService, useFactory: mockStorageService },
        { provide: FileValidationService, useFactory: mockFileValidationService },
        { provide: ConfigService, useFactory: mockConfigService },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    storageService = module.get<StorageService>(StorageService);
    fileValidationService = module.get<FileValidationService>(FileValidationService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    it("should create a new profile", async () => {
      const createProfileDto = {
        displayName: "Test User",
        email: "test@example.com",
      };
      
      (userRepository.findOne as jest.Mock).mockResolvedValue(null);
      (userRepository.create as jest.Mock).mockReturnValue(createProfileDto);
      (userRepository.save as jest.Mock).mockResolvedValue({ id: "test-id", ...createProfileDto });

      const result = await service.create(createProfileDto);
      expect(result).toHaveProperty("id", "test-id");
      expect(userRepository.save).toHaveBeenCalled();
    });

    it("should throw if user with email already exists", async () => {
      const createProfileDto = {
        displayName: "Test User",
        email: "test@example.com",
      };
      
      (userRepository.findOne as jest.Mock).mockResolvedValue({ id: "existing-id", email: "test@example.com" });

      await expect(service.create(createProfileDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe("findOne", () => {
    it("should return a profile with filtered fields", async () => {
      const mockUser = {
        id: "user-id",
        displayName: "Test User",
        email: "test@example.com",
        bio: "Test bio",
        avatar: "test.jpg",
        preferences: { visibility: "public", showEmail: false, showBio: true },
        createdAt: new Date(),
      };
      
      (userRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findOne("user-id", "another-user-id", UserRole.USER);
      expect(result).not.toHaveProperty("email"); // Email should be hidden since showEmail is false
      expect(result).toHaveProperty("displayName", "Test User");
      expect(result).toHaveProperty("bio", "Test bio");
    });

    it("should include email for owner", async () => {
      const mockUser = {
        id: "user-id",
        displayName: "Test User",
        email: "test@example.com",
        preferences: { showEmail: false },
      };
      
      (userRepository.findOne as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findOne("user-id", "user-id", UserRole.USER);
      expect(result).toHaveProperty("email", "test@example.com");
    });

    it("should throw if profile not found", async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne("invalid-id", "user-id", UserRole.USER)).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    it("should allow owner to update their profile", async () => {
      const mockUser = {
        id: "user-id",
        displayName: "Old Name",
        preferences: { visibility: "public" },
      };
      
      (userRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (userRepository.update as jest.Mock).mockResolvedValue({ affected: 1 });

      const updateDto = { displayName: "New Name" };
      const result = await service.update("user-id", updateDto, "user-id", UserRole.USER);
      
      expect(userRepository.update).toHaveBeenCalledWith("user-id", updateDto);
    });

    it("should prevent non-owners from updating", async () => {
      const updateDto = { displayName: "Hacked Name" };
      
      await expect(service.update("user-id", updateDto, "another-id", UserRole.USER)).rejects.toThrow(ForbiddenException);
    });

    it("should allow admins to update any profile", async () => {
      const mockUser = { id: "user-id", displayName: "Old Name" };
      (userRepository.findOne as jest.Mock).mockResolvedValue(mockUser);
      (userRepository.update as jest.Mock).mockResolvedValue({ affected: 1 });

      const updateDto = { displayName: "Admin Updated" };
      await service.update("user-id", updateDto, "admin-id", UserRole.ADMIN);
      
      expect(userRepository.update).toHaveBeenCalled();
    });
  });

  describe("file validation", () => {
    it("should validate uploaded files", () => {
      const mockFile = {
        mimetype: "image/jpeg",
        size: 1024 * 1024,
        buffer: Buffer.from([0xFF, 0xD8]), // JPEG magic numbers
        originalname: "test.jpg",
      } as any;

      (fileValidationService.validateFile as jest.Mock).mockImplementation(() => {});
      
      expect(() => fileValidationService.validateFile(mockFile)).not.toThrow();
    });

    it("should reject invalid file types", () => {
      const mockFile = {
        mimetype: "application/pdf",
        size: 1024 * 1024,
        buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF magic numbers
        originalname: "test.pdf",
      } as any;

      (fileValidationService.validateFile as jest.Mock).mockImplementation(() => {
        throw new BadRequestException("Invalid file type");
      });

      expect(() => fileValidationService.validateFile(mockFile)).toThrow(BadRequestException);
    });
  });
});