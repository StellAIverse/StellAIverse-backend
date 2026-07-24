import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("idempotency_keys")
@Index(["key"], { unique: true })
@Index(["expiresAt"])
export class IdempotencyKey {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  key: string;

  @Column({ name: "job_id" })
  jobId: string;

  @Column({ name: "job_type" })
  jobType: string;

  @Column({ type: "jsonb", nullable: true })
  result: Record<string, any>;

  @Column({
    type: "enum",
    enum: ["processing", "completed", "failed"],
    default: "processing",
  })
  status: string;

  @Column({ type: "timestamp", name: "expires_at" })
  @Index()
  expiresAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
