import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";
import { DeploymentStatus } from "./deployment.enums";

@Entity("deployment_events")
@Index(["deploymentId", "createdAt"])
export class DeploymentEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  deploymentId: string;

  @Column({ type: "enum", enum: DeploymentStatus })
  status: DeploymentStatus;

  @Column({ type: "text", nullable: true })
  message: string | null;

  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
