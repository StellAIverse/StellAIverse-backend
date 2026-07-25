import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

export enum TransactionType {
  CHARGE = "charge",
  INVOICE = "invoice",
}

export enum TransactionStatus {
  SUCCEEDED = "succeeded",
  FAILED = "failed",
  PENDING = "pending",
  REFUNDED = "refunded",
}

@Entity("payment_transactions")
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ nullable: true })
  subscriptionId?: string;

  @Column({ unique: true })
  @Index()
  stripeObjectId: string;

  @Column({ type: "enum", enum: TransactionType })
  type: TransactionType;

  @Column({ type: "enum", enum: TransactionStatus })
  status: TransactionStatus;

  @Column({ type: "bigint" })
  amount: number;

  @Column()
  currency: string;

  @Column({ nullable: true })
  invoiceUrl?: string;

  @Column({ nullable: true })
  failureReason?: string;

  @CreateDateColumn()
  createdAt: Date;
}
