# Notifications Module

A comprehensive notifications system for StellAIverse backend supporting email, push, and in-app notifications with reliable delivery, retry logic, and comprehensive metrics.

## Features

### ✅ Core Capabilities
- **Unified API**: Create, list, and manage notifications through REST endpoints
- **Multiple Channels**: Email (SendGrid, Mailgun), Push (FCM, APNs), In-app
- **Delivery Guarantees**: BullMQ-backed queue with exponential backoff retry logic
- **Dead Letter Queue**: Automatic DLQ for permanently failed notifications
- **User Preferences**: Per-user channel and template preferences
- **Unread Count**: Real-time unread notification tracking
- **Queue Metrics**: Pending/processing/delivered/failed/DLQ counts
- **Test Mode**: Test provider integrations without sending real notifications
- **Rate Limiting**: Per-provider rate limits to avoid hitting API restrictions

## Architecture

```
src/notifications/
├── controllers/              # API endpoints
│   ├── notifications.controller.ts          # Main notification CRUD
│   └── notification-preferences.controller.ts  # User preferences
├── services/
│   └── notifications.service.ts            # Business logic
├── providers/              # Channel providers
│   ├── sendgrid.provider.ts               # SendGrid email
│   ├── mailgun.provider.ts                # Mailgun email
│   ├── fcm.provider.ts                    # Firebase Cloud Messaging
│   ├── apns.provider.ts                   # Apple Push Notifications
│   ├── in-app.provider.ts                 # In-app notifications
│   └── provider-factory.service.ts        # Provider resolution
├── processors/             # Bull queue processors
│   └── notification.processor.ts          # Background processing
├── entities/               # TypeORM entities
│   ├── notification.entity.ts
│   ├── notification-delivery-log.entity.ts
│   ├── notification-preference.entity.ts
│   └── notification.enums.ts
├── dto/                   # Validation DTOs
│   ├── create-notification.dto.ts
│   └── update-notification.dto.ts
├── interfaces/            # TypeScript interfaces
│   └── notification-provider.interface.ts
└── notifications.module.ts # Module definition
```

## API Endpoints

### Notifications
- `POST /notifications` - Create a new notification
- `GET /users/:id/notifications` - List user's notifications
- `GET /users/:id/notifications/unread-count` - Get unread count
- `GET /notifications/:id` - Get specific notification
- `PATCH /notifications/:id` - Update (mark read/archived)
- `POST /users/:id/notifications/mark-all-read` - Mark all as read
- `DELETE /notifications/:id` - Delete notification

### Queue Management
- `GET /notifications/queue/metrics` - Get queue metrics
- `POST /notifications/queue/retry` - Retry failed notifications

### Preferences
- `GET /users/:id/notification-preferences` - Get user preferences
- `PUT /users/:id/notification-preferences` - Update preferences

## Configuration

Add these variables to your `.env` file:

```env
# SendGrid (Email)
SENDGRID_API_KEY=your_api_key
SENDGRID_FROM_EMAIL=notifications@stellaiverse.com
SENDGRID_FROM_NAME=StellAIverse
SENDGRID_RATE_LIMIT=100

# Mailgun (Alternative Email)
MAILGUN_API_KEY=your_api_key
MAILGUN_DOMAIN=mg.stellaiverse.com
MAILGUN_FROM_EMAIL=notifications@mg.stellaiverse.com
MAILGUN_FROM_NAME=StellAIverse
MAILGUN_RATE_LIMIT=100

# FCM (Android Push)
FCM_SERVER_KEY=your_fcm_key
FCM_RATE_LIMIT=500

# APNs (iOS Push)
APNS_AUTH_KEY=your_apns_key
APNS_BUNDLE_ID=com.stellaiverse.app
APNS_RATE_LIMIT=500

# Redis (for Bull queue)
REDIS_HOST=localhost
REDIS_PORT=6379
```

## Usage Examples

### Create a Notification
```typescript
// Email notification
await notificationsService.create({
  userId: 'user-uuid',
  type: NotificationType.EMAIL,
  channel: NotificationChannel.SENDGRID,
  subject: 'Welcome to StellAIverse!',
  content: '<h1>Welcome!</h1>...',
  template: 'user_welcome',
  templateData: { name: 'John' },
  priority: NotificationPriority.HIGH,
  recipient: 'user@example.com',
});

// Push notification
await notificationsService.create({
  userId: 'user-uuid',
  type: NotificationType.PUSH,
  channel: NotificationChannel.FCM,
  subject: 'Your portfolio is growing!',
  content: '+12.5% ROI this week',
  template: 'portfolio_update',
  metadata: { pushTokens: ['fcm_token1', 'fcm_token2'] },
});

// In-app notification
await notificationsService.create({
  userId: 'user-uuid',
  type: NotificationType.IN_APP,
  channel: NotificationChannel.INTERNAL,
  subject: 'New transaction completed',
  content: 'Your ETH transfer was successful',
  template: 'transaction_complete',
});
```

## Retry Logic

Failed notifications are retried with exponential backoff:
- Max retries: 5 attempts
- Base delay: 1 second
- Max delay: 5 minutes
- Backoff formula: `1s * 2^retry_count`

## Delivery Tracking

Every delivery attempt is logged in `notification_delivery_logs` with:
- Success/failure status
- Error messages
- Provider response data
- Timestamps

## User Preferences

Users can opt in/out of channels:
```typescript
{
  emailEnabled: boolean,
  pushEnabled: boolean,
  inAppEnabled: boolean,
  channelPreferences: { email: { email: string } },
  templatePreferences: { template_id: { enabled: boolean } }
}
```

## Metrics

Get real-time queue metrics:
```typescript
{
  pending: 5,      // Waiting to be processed
  processing: 2,   // Currently processing
  delivered: 1234, // Successfully delivered
  failed: 12,      // Failed, will be retried
  deadLetter: 3    // Permanently failed
}
```

## Testing

Run the notification module tests:
```bash
npm test -- notifications
```

## Integration Status

✅ All core features implemented:
- Provider abstraction layer
- Queue processing with retries
- REST API with Swagger docs
- User preference system
- Metrics endpoints
- Test mode for all providers
- Rate limiting
- Delivery logging
- Dead letter queue
- Unread count tracking