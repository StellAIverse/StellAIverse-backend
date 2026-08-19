# Analytics Module

The Analytics Module provides event tracking and reporting capabilities for the StellAIverse platform.

## Event Schema

All events are stored in the `analytics_events` table and represented by the `AnalyticsEvent` entity.

### Standard Properties
- `eventType`: Enum specifying the type of event (`page_view`, `click`, `transaction`, etc.)
- `eventName`: String describing the specific event (e.g., "submit_order")
- `userId`: Identifier for the user who triggered the event
- `sessionId`: Session identifier
- `properties`: JSON object for arbitrary custom event data
- `idempotencyKey`: Unique string to prevent duplicate ingestion

### Context Properties
- `page`: Page path or URL
- `referrer`: Referrer URL
- `userAgent`: Raw user agent string
- `device`, `browser`, `os`: Parsed client metadata
- `ipAddress`, `country`: Location data

## Retention Policy

Events are stored in the primary transactional database (`analytics_events` table).
- Raw events are kept indefinitely by default, but a cleanup job could be introduced to prune events older than 90 days.
- Aggregated metrics (DAU, daily event counts) are precomputed daily and stored in `daily_metrics`. These are kept indefinitely for long-term trend analysis.
- The `analytics_events` table is optimized with a `BRIN` index on the `createdAt` column to support fast time-series queries.

## Adding New Events

To add a new event type:
1. Update the `EventType` enum in `src/analytics/entities/analytics-event.entity.ts`.
2. Fire the event from the client side or backend service using the ingestion API.

### Ingestion API

**Single Event Ingestion**
`POST /analytics/events`
```json
{
  "eventType": "custom",
  "eventName": "feature_unlocked",
  "properties": { "feature": "advanced_trading" },
  "idempotencyKey": "unique-uuid-1234"
}
```

**Batch Event Ingestion**
`POST /analytics/events/batch`
```json
{
  "events": [
    {
      "eventType": "page_view",
      "page": "/dashboard",
      "idempotencyKey": "unique-uuid-1235"
    }
  ]
}
```

## Reporting APIs

The module provides reporting APIs for rendering dashboards:
- `GET /analytics/metrics/dau`: Daily active users over time.
- `GET /analytics/metrics/events`: Count of events grouped by type.
- `GET /analytics/metrics/top-events`: Top most frequent custom events.
- `GET /analytics/metrics/retention`: Basic cohort retention analysis.
- `GET /analytics/metrics/funnel`: Conversion rate across a sequence of events.
