import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("payment_customers")
export class PaymentCustomer {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  @Index()
  userId: string;

  @Column({ unique: true })
  @Index()
  stripeCustomerId: string;

  @Column({ nullable: true })
  defaultPaymentMethodId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
