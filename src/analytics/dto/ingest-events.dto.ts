import { IsString, IsOptional, IsObject, IsEnum, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { EventType } from "../entities/analytics-event.entity";

export class IngestEventDto {
  @ApiProperty({ enum: EventType, description: "Type of event" })
  @IsEnum(EventType)
  eventType: EventType;

  @ApiPropertyOptional({ description: "Name of the event" })
  @IsString()
  @IsOptional()
  eventName?: string;

  @ApiPropertyOptional({ description: "Custom properties" })
  @IsObject()
  @IsOptional()
  properties?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Page path" })
  @IsString()
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ description: "Referrer URL" })
  @IsString()
  @IsOptional()
  referrer?: string;

  @ApiPropertyOptional({ description: "Session ID" })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({ description: "Timestamp" })
  @IsString()
  @IsOptional()
  timestamp?: string;
}

export class BatchIngestEventsDto {
  @ApiProperty({ type: [IngestEventDto], description: "Array of events" })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestEventDto)
  events: IngestEventDto[];

  @ApiPropertyOptional({ description: "User ID for all events" })
  @IsString()
  @IsOptional()
  userId?: string;
}
