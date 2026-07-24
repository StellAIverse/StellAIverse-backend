import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class JobStatusDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional()
  bullJobId?: string;

  @ApiProperty()
  jobType: string;

  @ApiProperty({
    enum: ["waiting", "active", "completed", "failed", "delayed", "paused"],
  })
  status: string;

  @ApiProperty()
  payload: Record<string, any>;

  @ApiPropertyOptional()
  result?: Record<string, any>;

  @ApiPropertyOptional()
  error?: string;

  @ApiProperty()
  attempts: number;

  @ApiProperty()
  maxAttempts: number;

  @ApiProperty()
  priority: number;

  @ApiProperty({ description: "Progress percentage (0-100)" })
  progress: number;

  @ApiPropertyOptional()
  idempotencyKey?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional()
  processedAt?: Date;

  @ApiPropertyOptional()
  completedAt?: Date;

  @ApiPropertyOptional()
  failedAt?: Date;

  @ApiPropertyOptional()
  scheduledAt?: Date;

  @ApiPropertyOptional()
  metadata?: Record<string, any>;
}

export class QueueStatsDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  waiting: number;

  @ApiProperty()
  active: number;

  @ApiProperty()
  completed: number;

  @ApiProperty()
  failed: number;

  @ApiProperty()
  delayed: number;

  @ApiProperty()
  paused: number;

  @ApiProperty()
  total: number;
}

export class QueueStatsResponseDto {
  @ApiProperty({ type: [QueueStatsDto] })
  queues: QueueStatsDto[];

  @ApiProperty()
  timestamp: string;
}
