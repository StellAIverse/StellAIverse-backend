import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "src/auth/guards/jwt-auth.guard";
import { RolesGuard } from "src/common/guard/roles.guard";
import { Roles } from "src/common/guard/roles.decorator";
import { Role } from "src/common/guard/roles.enum";
import { NotificationsService } from "../services/notifications.service";
import {
  NotificationType,
  NotificationStatus,
  NotificationChannel,
} from "../entities/notification.enums";

/**
 * Admin-only surface for observing and recovering the delivery pipeline.
 *
 * Guarded by `JwtAuthGuard` (authenticates + populates `request.user`) followed by
 * `RolesGuard` (enforces `@Roles(Role.ADMIN)`). These endpoints previously lived on
 * the user-facing controller with no role check; they now require ADMIN.
 */
@ApiTags("admin-notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller("admin/notifications")
export class NotificationAdminController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("metrics")
  @ApiOperation({ summary: "Get notification delivery metrics by status" })
  @ApiResponse({ status: 200, description: "Queue metrics retrieved" })
  getMetrics() {
    return this.notificationsService.getQueueMetrics();
  }

  @Get("failed")
  @ApiOperation({
    summary: "List failed and dead-letter notifications (paginated)",
  })
  @ApiQuery({ name: "status", required: false, enum: NotificationStatus })
  @ApiQuery({ name: "type", required: false, enum: NotificationType })
  @ApiQuery({ name: "channel", required: false, enum: NotificationChannel })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Failed notifications retrieved" })
  findFailed(
    @Query("status") status?: NotificationStatus,
    @Query("type") type?: NotificationType,
    @Query("channel") channel?: NotificationChannel,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ) {
    return this.notificationsService.findFailed({
      status,
      type,
      channel,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post(":id/requeue")
  @ApiOperation({ summary: "Requeue a single failed/dead-letter notification" })
  @ApiResponse({ status: 201, description: "Notification requeued" })
  requeueOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.notificationsService.requeueOne(id);
  }

  @Post("requeue-all")
  @ApiOperation({
    summary: "Requeue all failed notifications (dead-letter included)",
  })
  @ApiResponse({ status: 201, description: "Failed notifications requeued" })
  async requeueAll() {
    const count = await this.notificationsService.requeueFailed({
      includeDeadLetter: true,
    });
    return { queuedCount: count };
  }
}
