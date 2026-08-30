import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "src/user/entities/user.entity";
import { ProfilesController } from "./profiles.controller";
import { ProfilesService } from "./profiles.service";
import { StorageService } from "./services/storage.service";
import { FileValidationService } from "./services/file-validation.service";
import { ConfigModule } from "@nestjs/config";

@Module({
  imports: [TypeOrmModule.forFeature([User]), ConfigModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, StorageService, FileValidationService],
  exports: [ProfilesService],
})
export class ProfilesModule {}