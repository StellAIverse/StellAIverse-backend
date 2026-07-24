import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPreference } from '../entities/notification-preference.entity';

class UpdatePreferencesDto {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  channelPreferences?: any;
  templatePreferences?: any;
}

@ApiTags('notification-preferences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/:id/notification-preferences')
export class NotificationPreferencesController {
  constructor(
    @InjectRepository(NotificationPreference)
    private preferenceRepository: Repository<NotificationPreference>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get notification preferences for a user' })
  @ApiResponse({ status: 200, description: 'Preferences retrieved successfully' })
  async getPreferences(
    @Param('id', ParseUUIDPipe) userId: string,
    @CurrentUser() currentUser: any,
  ) {
    if (currentUser.id !== userId) {
      throw new Error('Unauthorized to access these preferences');
    }

    let preferences = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      preferences = this.preferenceRepository.create({
        userId,
        emailEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,
      });
      await this.preferenceRepository.save(preferences);
    }

    return preferences;
  }

  @Put()
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updatePreferences(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() updateDto: UpdatePreferencesDto,
    @CurrentUser() currentUser: any,
  ) {
    if (currentUser.id !== userId) {
      throw new Error('Unauthorized to update these preferences');
    }

    let preferences = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      preferences = this.preferenceRepository.create({
        userId,
        ...updateDto,
      });
    } else {
      Object.assign(preferences, updateDto);
    }

    return this.preferenceRepository.save(preferences);
  }
}