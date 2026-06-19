import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Portfolio } from "./portfolio.entity";
import { User } from "../../user/entities/user.entity";

export enum TransactionType {
  BUY = "buy",
  SELL = "sell",
  TRANSFER = "transfer",
  DIVIDEND = "dividend",
  STAKE = "stake",
  UNSTAKE = "unstake",
  DEPOSIT = "deposit",
  WITHDRAWAL = "withdrawal",
}

export enum TransactionStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
  ARCHIVED = "archived",
}

@Entity("portfolio_transactions")
@Index(["portfolioId", "createdAt"])
@Index(["portfolioId", "type"])
@Index(["portfolioId", "ticker"])
@Index(["userId", "createdAt"])
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  portfolioId: string;

  @Column()
  userId: string;

  @Column({
    type: "enum",
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: "enum",
    enum: TransactionStatus,
    default: TransactionStatus.COMPLETED,
  })
  status: TransactionStatus;

  // Asset information
  @Column()
  ticker: string;

  @Column()
  name: string;

  // Transaction quantity (positive for buy/deposit/stake/dividend, negative for sell/withdrawal/unstake)
  @Column({ type: "decimal", precision: 18, scale: 8 })
  quantity: number;

  // Price per unit at time of transaction
  @Column({ type: "decimal", precision: 18, scale: 8, nullable: true })
  price: number;

  // Total transaction value (quantity * price, or 0 for transfers/dividends)
  @Column({ type: "decimal", precision: 18, scale: 2, nullable: true })
  totalValue: number;

  // Transaction fees (commission, platform fees, etc.)
  @Column({ type: "decimal", precision: 18, scale: 8, default: 0 })
  fees: number;

  // Blockchain/Chain information
  @Column({ type: "varchar", nullable: true })
  chain: string; // e.g., "ethereum", "polygon", "solana"

  // Gas fees (for blockchain transactions)
  @Column({ type: "decimal", precision: 18, scale: 8, nullable: true })
  gasFees: number;

  // Transaction hash or reference
  @Column({ type: "varchar", nullable: true })
  transactionHash: string;

  // Wallet address (if applicable)
  @Column({ type: "varchar", nullable: true })
  walletAddress: string;

  // Exchange or market where transaction occurred
  @Column({ type: "varchar", nullable: true })
  exchange: string;

  // Additional notes
  @Column({ type: "text", nullable: true })
  notes: string;

  // Metadata for extensibility (e.g., tax lot, counterparty, etc.)
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>;

  // Cost basis at the time of transaction (for historical reference)
  @Column({ type: "decimal", precision: 18, scale: 8, nullable: true })
  costBasisPerUnit: number;

  // Immutable timestamp of when transaction occurred (not when recorded)
  @Column({ nullable: true })
  transactionDate: Date;

  // Idempotency key to prevent duplicate transactions
  @Column({ type: "varchar", nullable: true, unique: true })
  idempotencyKey: string;

  // Timestamp when this record was created
  @CreateDateColumn()
  createdAt: Date;

  // For soft-delete/archival (transactions can be archived but never deleted)
  @DeleteDateColumn({ nullable: true })
  archivedAt: Date;

  // Relations
  @ManyToOne(() => Portfolio)
  @JoinColumn({ name: "portfolioId" })
  portfolio: Portfolio;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;
}
