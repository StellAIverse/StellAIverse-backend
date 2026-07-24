import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { NotificationsService } from '../services/notifications.service';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { UpdateNotificationDto } from '../dto/update-notification.dto';
import { NotificationType } from '../entities/notification.enums';
import { Notification } from '../entities/notification.entity';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('notifications')
  @ApiOperation({ summary: 'Create a new notification' })
  @ApiResponse({ status: 201, description: 'Notification created successfully', type: Notification })
  async create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  @Get('users/:id/notifications')
  @ApiOperation({ summary: 'Get all notifications for a user' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  @ApiQuery({ name: 'type', required: false, enum: NotificationType })
  @ApiResponse({ status: 200, description: 'List of notifications retrieved' })
  async findAll(
    @Param('id', ParseUUIDPipe) userId: string,
    @CurrentUser() currentUser: any,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('includeArchived') includeArchived?: boolean,
    @Query('type') type?: NotificationType,
  ) {
    if (currentUser.id !== userId) {
      throw new Error('Unauthorized to access this user\'s notifications');
    }

    return this.notificationsService.findAllByUserId(userId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      includeArchived: includeArchived === true,
      type,
    });
  }

  @Get('users/:id/notifications/unread-count')
  @ApiOperation({ summary: 'Get unread notification count for a user' })
  @ApiResponse({ status: 200, description: 'Unread count retrieved' })
  async getUnreadCount(
    @Param('id', ParseUUIDPipe) userId: string,
    @CurrentUser() currentUser: any,
  ) {
    if (currentUser.id !== userId) {
      throw new Error('Unauthorized');
    }
    const count = await this.notificationsService.getUnreadCount(userId);
    return { unreadCount: count };
  }

  @Get('notifications/:id')
  @ApiOperation({ summary: 'Get a specific notification' })
  @ApiResponse({ status: 200, description: 'Notification retrieved', type: Notification })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: any,
  ) {
    const notification = await this.notificationsService.findOne(id, currentUser.id);
    return notification;
  }

  @Patch('notifications/:id')
  @ApiOperation({ summary: 'Update notification status (mark as read/archived)' })
  @ApiResponse({ status: 200, description: 'Notification updated successfully', type: Notification })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateNotificationDto: UpdateNotificationDto,
    @CurrentUser() currentUser: any,
  ) {
    return this.notificationsService.update(id, currentUser.id, updateNotificationDto);
  }

  @Post('users/:id/notifications/mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read for a user' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(
    @Param('id', ParseUUIDPipe) userId: string,
    @CurrentUser() currentUser: any,
  ) {
    if (currentUser.id !== userId) {
      throw new Error('Unauthorized');
    }
    await this.notificationsService.markAllAsRead(userId);
    return { success: true };
  }

  @Delete('notifications/:id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiResponse({ status: 200, description: 'Notification deleted successfully' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: any,
  ) {
    await this.notificationsService.remove(id, currentUser.id);
    return { success: true };
  }

  @Get('notifications/queue/metrics')
  @ApiOperation({ summary: 'Get notification queue metrics' })
  @ApiResponse({ status: 200, description: 'Queue metrics retrieved' })
  async getQueueMetrics() {
    return this.notificationsService.getQueueMetrics();
  }

  @Post('notifications/queue/retry')
  @ApiOperation({ summary: 'Retry failed notifications' })
  @ApiResponse({ status: 200, description: 'Failed notifications requeued' })
  async retryFailed() {
    const count = await this.notificationsService.retryFailedNotifications();
    return { queuedCount: count };
  }
}