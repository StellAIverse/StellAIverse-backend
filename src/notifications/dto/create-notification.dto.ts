import {
  IsNotEmpty,
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  IsObject,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  NotificationType,
  NotificationChannel,
  NotificationPriority,
  NotificationTemplate,
} from '../entities/notification.enums';

export class CreateNotificationDto {
  @ApiProperty({
    description: 'ID of the user to send the notification to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @ApiProperty({
    enum: NotificationType,
    description: 'Type of notification to send',
    example: NotificationType.EMAIL,
  })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({
    enum: NotificationChannel,
    description: 'Channel to send the notification through',
    example: NotificationChannel.SENDGRID,
  })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiProperty({
    enum: NotificationPriority,
    description: 'Priority of the notification',
    default: NotificationPriority.NORMAL,
    required: false,
  })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiProperty({
    enum: NotificationTemplate,
    description: 'Template to use for the notification',
    example: NotificationTemplate.WELCOME,
  })
  @IsEnum(NotificationTemplate)
  template: NotificationTemplate;

  @ApiProperty({
    description: 'Data to populate the template with',
    example: { name: 'John Doe', email: 'john@example.com' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  templateData?: Record<string, any>;

  @ApiProperty({
    description: 'Custom subject line (overrides template)',
    example: 'Welcome to StellAIverse!',
    required: false,
  })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({
    description: 'Custom content (overrides template)',
    example: 'Thank you for joining our platform.',
    required: false,
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiProperty({
    description: 'Override recipient email/device token',
    example: 'recipient@example.com',
    required: false,
  })
  @IsOptional()
  @IsString()
  recipient?: string;

  @ApiProperty({
    description: 'Additional metadata for the notification',
    required: false,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}