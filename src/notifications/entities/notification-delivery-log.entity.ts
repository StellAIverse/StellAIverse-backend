import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Notification } from './notification.entity';

@Entity('notification_delivery_logs')
export class NotificationDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  notificationId: string;

  @ManyToOne(() => Notification)
  @JoinColumn({ name: 'notificationId' })
  notification: Notification;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ type: 'int', nullable: true })
  attemptNumber: number;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'jsonb', nullable: true })
  providerResponse?: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}