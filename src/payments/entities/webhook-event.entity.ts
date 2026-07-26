import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("payment_webhook_events")
export class WebhookEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  @Index()
  stripeEventId: string;

  @Column()
  type: string;

  @CreateDateColumn()
  processedAt: Date;
}
