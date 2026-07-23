import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("analytics_daily_metrics")
@Index(["metricName", "date"], { unique: true })
export class DailyMetric {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 100 })
  metricName: string;

  @Column({ type: "date" })
  date: Date;

  @Column({ type: "bigint", default: 0 })
  value: number;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
