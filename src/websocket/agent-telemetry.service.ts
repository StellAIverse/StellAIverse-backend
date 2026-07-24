import { Injectable } from "@nestjs/common";

export interface TelemetryEvent {
  agentId: string;
  eventType: string;
  payload: Record<string, unknown>;
  timestamp?: string;
  [key: string]: unknown;
}

export interface TelemetryFilter {
  agentId?: string;
  eventTypes?: string[];
  [key: string]: unknown;
}

export interface ProcessedTelemetryEvent extends TelemetryEvent {
  processedAt: string;
}

@Injectable()
export class AgentTelemetryService {
  /**
   * Processes a raw telemetry event — normalises timestamps and enriches metadata.
   */
  processTelemetry(event: TelemetryEvent): ProcessedTelemetryEvent {
    return {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };
  }

  /**
   * Returns true when a processed event satisfies the given filter.
   */
  matchesFilter(
    event: ProcessedTelemetryEvent,
    filter: TelemetryFilter,
  ): boolean {
    if (filter.agentId && filter.agentId !== "all" && event.agentId !== filter.agentId) {
      return false;
    }
    if (filter.eventTypes?.length && !filter.eventTypes.includes(event.eventType)) {
      return false;
    }
    return true;
  }
}
