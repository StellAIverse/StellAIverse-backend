import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

export enum EventType {
  PAGE_VIEW = "page_view",
  CLICK = "click",
  FORM_SUBMIT = "form_submit",
  API_CALL = "api_call",
  TRANSACTION = "transaction",
  LOGIN = "login",
  LOGOUT = "logout",
  SIGNUP = "signup",
  FEATURE_USE = "feature_use",
  ERROR = "error",
  CUSTOM = "custom",
}

@Entity("analytics_events")
@Index(["eventType", "createdAt"])
@Index(["userId", "createdAt"])
@Index(["sessionId"])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "enum", enum: EventType })
  eventType: EventType;

  @Column({ type: "varchar", length: 255, nullable: true })
  eventName: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  @Index()
  userId: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  @Index()
  sessionId: string;

  @Column({ type: "jsonb", nullable: true })
  properties: Record<string, unknown>;

  @Column({ type: "varchar", length: 255, nullable: true })
  page: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  referrer: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  userAgent: string;

  @Column({ type: "inet", nullable: true })
  ipAddress: string;

  @Column({ type: "varchar", length: 10, nullable: true })
  country: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  device: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  browser: string;

  @Column({ type: "varchar", length: 50, nullable: true })
  os: string;

  @Column({ type: "boolean", default: false })
  processed: boolean;

  @Column({ type: "boolean", default: false })
  optedOut: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
