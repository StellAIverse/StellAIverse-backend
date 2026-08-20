import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ProfilesService } from "./profiles.service";
import { CreateProfileDto } from "./dto/create-profile.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { CurrentUser } from "src/auth/decorators/current-user.decorator";
import { User, UserRole } from "src/user/entities/user.entity";
import { Express } from "express";
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from "@nestjs/swagger";

@ApiTags("profiles")
@Controller("profiles")
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  @ApiOperation({ summary: "Create a new user profile" })
  @ApiResponse({ status: 201, description: "Profile created successfully" })
  @ApiResponse({ status: 400, description: "Invalid input or profile already exists" })
  create(@Body() createProfileDto: CreateProfileDto) {
    return this.profilesService.create(createProfileDto);
  }

  @Get(":id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Get a user profile by ID" })
  @ApiResponse({ status: 200, description: "Profile retrieved successfully" })
  @ApiResponse({ status: 404, description: "Profile not found" })
  findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: User,
  ) {
    return this.profilesService.findOne(id, currentUser.id, currentUser.role);
  }

  @Put(":id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Update a user profile" })
  @ApiResponse({ status: 200, description: "Profile updated successfully" })
  @ApiResponse({ status: 403, description: "Forbidden - insufficient permissions" })
  @ApiResponse({ status: 404, description: "Profile not found" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateProfileDto: UpdateProfileDto,
    @CurrentUser() currentUser: User,
  ) {
    return this.profilesService.update(id, updateProfileDto, currentUser.id, currentUser.role);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Delete a user profile" })
  @ApiResponse({ status: 200, description: "Profile deleted successfully" })
  @ApiResponse({ status: 403, description: "Forbidden - insufficient permissions" })
  @ApiResponse({ status: 404, description: "Profile not found" })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: User,
  ) {
    return this.profilesService.remove(id, currentUser.id, currentUser.role);
  }

  @Post(":id/avatar")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload a profile avatar" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
          description: "Avatar image file (JPEG, PNG, WebP, GIF) - max 5MB",
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Avatar uploaded successfully" })
  @ApiResponse({ status: 400, description: "Invalid file type or size" })
  @ApiResponse({ status: 403, description: "Forbidden - insufficient permissions" })
  @ApiResponse({ status: 404, description: "Profile not found" })
  uploadAvatar(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: User,
  ) {
    return this.profilesService.uploadAvatar(id, file, currentUser.id, currentUser.role);
  }

  @Delete(":id/avatar")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Delete a profile avatar" })
  @ApiResponse({ status: 200, description: "Avatar deleted successfully" })
  @ApiResponse({ status: 403, description: "Forbidden - insufficient permissions" })
  @ApiResponse({ status: 404, description: "Profile not found" })
  deleteAvatar(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: User,
  ) {
    return this.profilesService.deleteAvatar(id, currentUser.id, currentUser.role);
  }
}