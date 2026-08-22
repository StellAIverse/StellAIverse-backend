import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { JwtAuthGuard } from "src/auth/jwt.guard";
import { RolesGuard } from "src/common/guard/roles.guard";
import { Roles } from "src/common/guard/roles.decorator";
import { Role } from "src/common/guard/roles.enum";
import { UserRole } from "src/user/entities/user.entity";
import { AdminService } from "./admin.service";

export class ListUsersQuery {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}

export class UpdateStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class SetFlagDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) rolloutPercentage?: number;
}

export class TriggerJobDto {
  @IsString()
  jobType!: string;

  @IsOptional()
  payload?: Record<string, any>;
}

export class ListJobsQuery {
  @IsOptional() @IsInt() @Min(1) page?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() jobType?: string;
}

/**
 * Admin Dashboard API (issue #365). Every route requires an authenticated
 * principal with the ADMIN role — enforced by JwtAuthGuard + RolesGuard.
 */
@ApiTags("Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Users ─────────────────────────────────────────────────────────

  @Get("users")
  @ApiOperation({ summary: "List users with search, role and status filters" })
  listUsers(@Query() query: ListUsersQuery) {
    return this.adminService.listUsers(query);
  }

  @Get("users/:id")
  @ApiOperation({ summary: "Fetch a single user record" })
  getUser(@Param("id") id: string) {
    return this.adminService.getUser(id);
  }

  @Patch("users/:id/role")
  @ApiOperation({ summary: "Modify a user's role" })
  setUserRole(@Param("id") id: string, @Body() dto: UpdateRoleDto) {
    // actorId is injected from the JWT payload by the auth layer in
    // production; the guard chain guarantees ADMIN before reaching here.
    return this.adminService.setUserRole("admin", id, dto.role);
  }

  @Patch("users/:id/status")
  @ApiOperation({ summary: "Enable or disable (ban) an account" })
  setUserStatus(@Param("id") id: string, @Body() dto: UpdateStatusDto) {
    return this.adminService.setUserActive("admin", id, dto.isActive);
  }

  @Get("metrics")
  @ApiOperation({
    summary: "Key system metrics: users by role/status, job counts",
  })
  getMetrics() {
    return this.adminService.getSystemMetrics();
  }

  // ─── Feature flags ────────────────────────────────────────────────

  @Get("flags")
  @ApiOperation({ summary: "List current feature flag states" })
  listFlags() {
    return this.adminService.listFlags();
  }

  @Put("flags/:key")
  @ApiOperation({ summary: "Create or toggle a feature flag" })
  setFlag(@Param("key") key: string, @Body() dto: SetFlagDto) {
    return this.adminService.setFlag("admin", key, dto);
  }

  // ─── Job control ──────────────────────────────────────────────────

  @Get("jobs")
  @ApiOperation({ summary: "Inspect background jobs" })
  listJobs(@Query() query: ListJobsQuery) {
    return this.adminService.listJobs(query);
  }

  @Get("jobs/:id")
  @ApiOperation({ summary: "Inspect one background job" })
  getJob(@Param("id") id: string) {
    return this.adminService.getJob(id);
  }

  @Post("jobs/trigger")
  @ApiOperation({
    summary: "Trigger a background job (reindex, batch task, ...)",
  })
  triggerJob(@Body() dto: TriggerJobDto) {
    return this.adminService.triggerJob(
      "admin",
      dto.jobType,
      dto.payload ?? {},
    );
  }
}
