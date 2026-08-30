import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { ProvenanceRecord } from "src/audit/entities/provenance-record.entity";
import { Wallet } from "src/auth/entities/wallet.entity";

export enum UserRole {
  USER = "user",
  OPERATOR = "operator",
  GOVERNANCE_OPERATOR = "governance_operator",
  KYC_OPERATOR = "kyc_operator",
  ADMIN = "admin",
}

export enum KycStatus {
  UNVERIFIED = "unverified",
  PENDING = "pending",
  IN_REVIEW = "in_review",
  VERIFIED = "verified",
  REJECTED = "rejected",
}

export enum ProfileVisibility {
  PUBLIC = "public",
  PRIVATE = "private",
  FOLLOWERS_ONLY = "followers_only",
}

export interface ProfilePreferences {
  visibility: ProfileVisibility;
  showEmail: boolean;
  showBio: boolean;
  showActivity: boolean;
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true, nullable: true })
  @Index()
  username: string | null;

  @Column({ unique: true, nullable: false })
  @Index()
  walletAddress: string;

  @Column({ unique: true, nullable: true })
  @Index()
  email: string | null;

  @Column({ nullable: true })
  password: string | null;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  displayName: string | null;

  @Column({ type: "text", nullable: true })
  bio: string | null;

  @Column({ nullable: true })
  avatar: string | null;

  @Column({ 
    type: "jsonb", 
    nullable: false, 
    default: {
      visibility: ProfileVisibility.PUBLIC,
      showEmail: false,
      showBio: true,
      showActivity: true
    } 
  })
  preferences: ProfilePreferences;

  @Column({
    type: "varchar",
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({
    type: "varchar",
    default: KycStatus.UNVERIFIED,
  })
  kycStatus: KycStatus;

  @Column({ default: false })
  isActive: boolean;

  @Column({ type: "timestamp", nullable: true })
  lastLoginAt: Date;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ type: "timestamp", nullable: true })
  lockedUntil: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Provenance records associated with this user
   */
  @OneToMany(() => ProvenanceRecord, (provenance) => provenance.user)
  provenanceRecords: ProvenanceRecord[];

  /**
   * Wallets linked to this user account
   */
  @OneToMany(() => Wallet, (wallet) => wallet.user)
  wallets: Wallet[];

  @Column({ unique: true, nullable: true })
  @Index()
  referralCode: string | null;

  @Column({ nullable: true })
  referredById: string | null;

  @ManyToOne(() => User, (user) => user.referrals)
  @JoinColumn({ name: "referredById" })
  referredBy: User | null;

  /**
   * Wallets linked to this user account
   */

  @OneToMany(() => User, (user) => user.referredBy)
  referrals: User[];
}
