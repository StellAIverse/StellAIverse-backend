import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum SubscriptionStatus {
  INCOMPLETE = "incomplete",
  TRIALING = "trialing",
  ACTIVE = "active",
  PAST_DUE = "past_due",
  CANCELED = "canceled",
  UNPAID = "unpaid",
}

@Entity("subscriptions")
export class Subscription {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ unique: true })
  @Index()
  stripeSubscriptionId: string;

  @Column()
  stripeCustomerId: string;

  @Column()
  priceId: string;

  @Column({ type: "enum", enum: SubscriptionStatus })
  status: SubscriptionStatus;

  @Column({ type: "timestamp" })
  currentPeriodStart: Date;

  @Column({ type: "timestamp" })
  currentPeriodEnd: Date;

  @Column({ default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ type: "timestamp", nullable: true })
  canceledAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
