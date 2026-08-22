import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "src/user/entities/user.entity";
import { JobEntity } from "src/workers/entities/job.entity";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { FeatureFlag } from "./entities/feature-flag.entity";
import { FeatureFlagsService } from "./feature-flags.service";
import { JobControlService } from "./job-control.service";

@Module({
  imports: [TypeOrmModule.forFeature([User, FeatureFlag, JobEntity])],
  controllers: [AdminController],
  providers: [AdminService, FeatureFlagsService, JobControlService],
  exports: [AdminService, FeatureFlagsService, JobControlService],
})
export class AdminModule {}
