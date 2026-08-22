import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Runtime feature flag persisted in the database and cached by
 * FeatureFlagsService. Changes propagate to subscribers via onChange.
 */
@Entity("feature_flags")
@Index(["key"], { unique: true })
export class FeatureFlag {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  key: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ default: false })
  enabled: boolean;

  /** Percentage rollout 0-100 for gradual enablement. */
  @Column({ type: "int", default: 100 })
  rolloutPercentage: number;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: "text", nullable: true })
  updatedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
