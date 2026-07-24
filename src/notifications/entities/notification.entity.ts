import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  NotificationType,
  NotificationStatus,
  NotificationChannel,
  NotificationPriority,
  NotificationTemplate,
} from './notification.enums';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({
    type: 'varchar',
    length: 50,
    enum: [...Object.values(NotificationType)],
  })
  type: NotificationType;

  @Column({
    type: 'varchar',
    length: 50,
    enum: [...Object.values(NotificationStatus)],
    default: NotificationStatus.PENDING,
  })
  @Index()
  status: NotificationStatus;

  @Column({
    type: 'varchar',
    length: 50,
    enum: [...Object.values(NotificationChannel)],
  })
  channel: NotificationChannel;

  @Column({
    type: 'varchar',
    length: 50,
    enum: [...Object.values(NotificationPriority)],
    default: NotificationPriority.NORMAL,
  })
  priority: NotificationPriority;

  @Column({
    type: 'varchar',
    length: 100,
    enum: [...Object.values(NotificationTemplate)],
  })
  template: NotificationTemplate;

  @Column({ type: 'jsonb', nullable: true })
  templateData: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  subject?: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ nullable: true })
  recipient: string;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'timestamp', nullable: true })
  nextRetryAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @Column({ type: 'boolean', default: false })
  @Index()
  isRead: boolean;

  @Column({ type: 'boolean', default: false })
  @Index()
  isArchived: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  failureReason?: string;

  @Column({ type: 'int', nullable: true })
  providerResponseCode?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}