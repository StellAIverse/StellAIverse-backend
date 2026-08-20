import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { DeploymentEnvironment, DeploymentStatus } from "./deployment.enums";

@Entity("deployments")
@Index(["environment", "createdAt"])
@Index(["status", "createdAt"])
export class Deployment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 128, nullable: true, unique: true })
  externalId: string | null;

  @Column({ type: "enum", enum: DeploymentEnvironment })
  environment: DeploymentEnvironment;

  @Column({ type: "varchar", length: 128 })
  version: string;

  @Column({ type: "varchar", length: 64 })
  commitSha: string;

  @Column({
    type: "enum",
    enum: DeploymentStatus,
    default: DeploymentStatus.RECEIVED,
  })
  status: DeploymentStatus;

  @Column({ type: "text", nullable: true })
  failureReason: string | null;

  @Column({ type: "text", nullable: true })
  rollbackReason: string | null;

  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: "timestamptz", nullable: true })
  completedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  rollbackRequestedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
