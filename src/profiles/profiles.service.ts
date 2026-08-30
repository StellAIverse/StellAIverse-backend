import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User, UserRole } from "src/user/entities/user.entity";
import { CreateProfileDto } from "./dto/create-profile.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { StorageService } from "./services/storage.service";
import { FileValidationService } from "./services/file-validation.service";
import { Express } from "express";

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly storageService: StorageService,
    private readonly fileValidationService: FileValidationService,
  ) {}

  async create(createProfileDto: CreateProfileDto): Promise<User> {
    // Check if user with this email already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: createProfileDto.email },
    });

    if (existingUser) {
      throw new BadRequestException("User with this email already exists");
    }

    const user = this.userRepository.create(createProfileDto);
    return this.userRepository.save(user);
  }

  async findOne(id: string, requestingUserId?: string, userRole?: UserRole): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({ where: { id } });
    
    if (!user) {
      throw new NotFoundException(`Profile with ID ${id} not found`);
    }

    // Apply visibility rules
    const isOwner = requestingUserId === id;
    const isAdmin = userRole === UserRole.ADMIN;
    
    return this.filterProfileFields(user, isOwner || isAdmin, user.preferences.showEmail);
  }

  async update(
    id: string,
    updateProfileDto: UpdateProfileDto,
    requestingUserId: string,
    userRole: UserRole,
  ): Promise<User> {
    // Check permissions
    if (requestingUserId !== id && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException("You do not have permission to update this profile");
    }

    // Prevent email updates through this endpoint
    if ('email' in updateProfileDto) {
      throw new BadRequestException("Email cannot be updated through this endpoint");
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Profile with ID ${id} not found`);
    }

    // Merge preferences if provided
    if (updateProfileDto.preferences) {
      updateProfileDto.preferences = {
        ...user.preferences,
        ...updateProfileDto.preferences,
      };
    }

    await this.userRepository.update(id, updateProfileDto);
    return this.userRepository.findOne({ where: { id } });
  }

  async remove(id: string, requestingUserId: string, userRole: UserRole): Promise<void> {
    if (requestingUserId !== id && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException("You do not have permission to delete this profile");
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Profile with ID ${id} not found`);
    }

    // Delete avatar if exists
    if (user.avatar) {
      const key = user.avatar.split('/').pop();
      if (key) {
        await this.storageService.deleteFile(key);
      }
    }

    await this.userRepository.delete(id);
  }

  async uploadAvatar(
    id: string,
    file: Express.Multer.File,
    requestingUserId: string,
    userRole: UserRole,
  ): Promise<User> {
    if (requestingUserId !== id && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException("You do not have permission to update this profile's avatar");
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Profile with ID ${id} not found`);
    }

    // Validate the uploaded file
    this.fileValidationService.validateFile(file);

    // Delete old avatar if exists
    if (user.avatar) {
      const oldKey = user.avatar.split('/').pop();
      if (oldKey) {
        await this.storageService.deleteFile(oldKey);
      }
    }

    // Upload new avatar
    const uploadResult = await this.storageService.uploadFile(file, id);
    
    // Update user's avatar URL
    await this.userRepository.update(id, { avatar: uploadResult.url });
    
    return this.userRepository.findOne({ where: { id } });
  }

  async deleteAvatar(id: string, requestingUserId: string, userRole: UserRole): Promise<User> {
    if (requestingUserId !== id && userRole !== UserRole.ADMIN) {
      throw new ForbiddenException("You do not have permission to delete this profile's avatar");
    }

    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Profile with ID ${id} not found`);
    }

    if (user.avatar) {
      const key = user.avatar.split('/').pop();
      if (key) {
        await this.storageService.deleteFile(key);
      }
      await this.userRepository.update(id, { avatar: null });
    }

    return this.userRepository.findOne({ where: { id } });
  }

  private filterProfileFields(user: User, isOwnerOrAdmin: boolean, showEmail: boolean): Partial<User> {
    const filtered: Partial<User> = {
      id: user.id,
      displayName: user.displayName,
      bio: user.preferences.showBio ? user.bio : null,
      avatar: user.avatar,
      preferences: {
        visibility: user.preferences.visibility,
      },
      createdAt: user.createdAt,
    };

    // Only include email if owner/admin or profile is set to show email
    if (isOwnerOrAdmin || showEmail) {
      filtered.email = user.email;
    }

    return filtered;
  }
}