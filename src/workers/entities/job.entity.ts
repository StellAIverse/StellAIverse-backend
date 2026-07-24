import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("background_jobs")
@Index(["jobType", "status"])
@Index(["bullJobId"])
@Index(["idempotencyKey"], { unique: true, where: "idempotency_key IS NOT NULL" })
export class JobEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "bull_job_id", nullable: true })
  @Index()
  bullJobId: string;

  @Column({ name: "job_type" })
  jobType: string;

  @Column({
    type: "enum",
    enum: ["pending", "active", "completed", "failed", "delayed", "paused"],
    default: "pending",
  })
  status: string;

  @Column({ type: "jsonb" })
  payload: Record<string, any>;

  @Column({ type: "jsonb", nullable: true })
  result: Record<string, any>;

  @Column({ type: "text", nullable: true })
  error: string;

  @Column({ type: "int", default: 0 })
  attempts: number;

  @Column({ type: "int", default: 3, name: "max_attempts" })
  maxAttempts: number;

  @Column({ type: "int", default: 10, name: "priority" })
  priority: number;

  @Column({ name: "idempotency_key", nullable: true })
  idempotencyKey: string;

  @Column({ type: "timestamp", nullable: true, name: "processed_at" })
  processedAt: Date;

  @Column({ type: "timestamp", nullable: true, name: "completed_at" })
  completedAt: Date;

  @Column({ type: "timestamp", nullable: true, name: "failed_at" })
  failedAt: Date;

  @Column({ type: "timestamp", nullable: true, name: "scheduled_at" })
  scheduledAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any>;
}
