import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { NotificationType, NotificationTemplate } from './notification.enums';

@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index({ unique: true })
  userId: string;

  @Column({ type: 'jsonb', default: {} })
  channelPreferences: {
    [key in NotificationType]?: {
      enabled: boolean;
      email?: string;
      pushTokens?: string[];
    };
  };

  @Column({ type: 'jsonb', default: {} })
  templatePreferences: {
    [key in NotificationTemplate]?: {
      enabled: boolean;
      channels: NotificationType[];
    };
  };

  @Column({ type: 'boolean', default: true })
  emailEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  pushEnabled: boolean;

  @Column({ type: 'boolean', default: true })
  inAppEnabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  quietHoursStart?: Date;

  @Column({ type: 'timestamp', nullable: true })
  quietHoursEnd?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}