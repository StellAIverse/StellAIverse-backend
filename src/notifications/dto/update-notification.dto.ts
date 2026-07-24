import { IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateNotificationDto {
  @ApiProperty({
    description: 'Mark notification as read',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @ApiProperty({
    description: 'Mark notification as archived',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}