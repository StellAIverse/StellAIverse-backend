# Notifications Module

Transactional **email**, **push**, and **in-app** notifications for the StellAIverse
backend, with a **pluggable transport layer**, **templated content**, and
**reliable delivery** (retry with exponential backoff + dead-letter recovery).

## Features

- **Unified API** — enqueue and manage notifications through REST endpoints.
- **Pluggable transports** — email via **SMTP** / **SendGrid** / **Mailgun**, push via
  **FCM** / **APNs**, plus **in-app**. New transports plug in via a DI registry
  (see [Adding a transport](#adding-a-new-transport)) — no change to the dispatcher.
- **Templating** — dependency-free in-repo template registry with `{{variable}}`
  interpolation; interpolated data is HTML-escaped in the HTML body.
- **Reliable delivery** — Bull queue with exponential backoff, and a DB-backed
  dead-letter status for permanently failed items.
- **Admin surface** — ADMIN-only endpoints to view failed/dead-letter notifications
  and requeue them (single or bulk, dead-letter included).
- **User preferences** — per-user channel toggles, recipient emails, and push tokens.
- **Test mode** — every provider reports success without network calls when its
  credentials are unset, so the whole pipeline is exercisable in dev/test.

## Architecture

```
src/notifications/
├── controllers/
│   ├── notifications.controller.ts             # User-facing CRUD
│   ├── notification-preferences.controller.ts  # User preferences
│   └── notification-admin.controller.ts        # ADMIN-only view + requeue
├── services/
│   ├── notifications.service.ts                # Enqueue, render, requeue
│   └── template.service.ts                     # {{var}} template renderer
├── templates/
│   └── notification-templates.ts               # In-repo template registry
├── providers/                                  # Transports (implement NotificationProvider)
│   ├── smtp.provider.ts                         # SMTP (nodemailer)
│   ├── sendgrid.provider.ts / mailgun.provider.ts
│   ├── fcm.provider.ts / apns.provider.ts
│   ├── in-app.provider.ts
│   └── provider-factory.service.ts             # Resolves a provider by channel
├── processors/
│   └── notification.processor.ts               # Bull worker: send + retry/DLQ
├── entities/                                   # notification, delivery-log, preference, enums
├── dto/                                        # create-notification, update-notification, update-preferences
├── interfaces/
│   └── notification-provider.interface.ts      # NotificationProvider + NOTIFICATION_PROVIDERS token
└── notifications.module.ts
```

All routes are served under the global prefix `api/v1` (see `src/main.ts`).

## API Endpoints

### Notifications (authenticated user)
- `POST /api/v1/notifications` — enqueue a notification
- `GET /api/v1/users/:id/notifications` — list a user's notifications
- `GET /api/v1/users/:id/notifications/unread-count` — unread count
- `GET /api/v1/notifications/:id` — get one
- `PATCH /api/v1/notifications/:id` — mark read/archived
- `POST /api/v1/users/:id/notifications/mark-all-read` — mark all read
- `DELETE /api/v1/notifications/:id` — delete

### Admin (requires `Role.ADMIN`)
Guarded by `JwtAuthGuard` + `RolesGuard`. Non-admins receive `403`.
> These replace the previously **unsecured** `notifications/queue/*` endpoints, which
> have been removed from the user controller and relocated here.

- `GET /api/v1/admin/notifications/metrics` — counts by status
- `GET /api/v1/admin/notifications/failed` — list FAILED + DEAD_LETTER
  (query: `status`, `type`, `channel`, `limit`, `offset`)
- `POST /api/v1/admin/notifications/:id/requeue` — requeue a single item
- `POST /api/v1/admin/notifications/requeue-all` — requeue all (dead-letter included)

### Preferences
- `GET /api/v1/users/:id/notification-preferences`
- `PUT /api/v1/users/:id/notification-preferences`

## Templates

Templates live in [`templates/notification-templates.ts`](./templates/notification-templates.ts)
and are rendered by `TemplateService`. Each template defines a `subject`, an `html`
body, a plain-`text` body, and a documented `variables` list. Placeholders use
`{{ variable }}` (dotted paths like `{{ user.name }}` are supported). A missing
variable renders as an empty string; interpolated values are **HTML-escaped** in the
HTML output (the template markup itself is trusted, authored in-repo).

Rendering happens at **enqueue time** in `NotificationsService.create()`, so retries
re-send identical content. The rendered `html` is stored in `content`, the `subject`
in `subject`, and the plain-`text` part in `metadata.renderedText` (used by SMTP).
Explicit `subject`/`content` on the request **override** the template.

| Template                   | Variables                                        |
| -------------------------- | ------------------------------------------------ |
| `welcome`                  | `name`, `actionUrl`                              |
| `password_reset`           | `name`, `resetUrl`, `expiryMinutes`              |
| `email_verification`       | `name`, `verificationUrl`, `expiryMinutes`       |
| `transaction_confirmation` | `name`, `amount`, `asset`, `status`, `txHash`    |
| `portfolio_update`         | `name`, `changePercent`, `period`, `portfolioValue` |
| `security_alert`           | `name`, `event`, `ipAddress`, `timestamp`        |
| `system_maintenance`       | `startTime`, `endTime`, `description`            |

### Adding a template
1. Add a value to the `NotificationTemplate` enum in
   [`entities/notification.enums.ts`](./entities/notification.enums.ts).
2. Add a matching entry to `NOTIFICATION_TEMPLATES` in `templates/notification-templates.ts`
   (`subject` / `html` / `text` / `variables`). Use the `wrapHtml(title, body)` helper
   for a consistent shell.

That's it — `TemplateService.render()` and `listTemplates()` pick it up automatically.

## Transports (providers)

A transport is any class implementing `NotificationProvider`:

```ts
export interface NotificationProvider {
  readonly channel: NotificationChannel;         // which channel it serves
  send(notification: Notification): Promise<ProviderResponse>;
}
```

Providers are registered in the `NOTIFICATION_PROVIDERS` DI array
(`notifications.module.ts`). `ProviderFactory` injects that array and indexes it by
`channel`, so the processor resolves a transport with `factory.getProvider(channel)`.

| Channel    | Provider          | Type   | Configuration                                             |
| ---------- | ----------------- | ------ | --------------------------------------------------------- |
| `smtp`     | `SmtpProvider`    | email  | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` |
| `sendgrid` | `SendGridProvider`| email  | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`, `SENDGRID_RATE_LIMIT` |
| `mailgun`  | `MailgunProvider` | email  | `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM_EMAIL`, `MAILGUN_FROM_NAME`, `MAILGUN_RATE_LIMIT` |
| `fcm`      | `FCMProvider`     | push   | `FCM_SERVER_KEY`, `FCM_PROJECT_ID`, `FCM_RATE_LIMIT`      |
| `apns`     | `APNsProvider`    | push   | `APNS_AUTH_KEY`, `APNS_BUNDLE_ID`, `APNS_RATE_LIMIT`      |
| `internal` | `InAppProvider`   | in-app | —                                                         |

Each provider runs in **test mode** (logs and returns success, no network) when its
credentials are unset, so the pipeline works out-of-the-box in development.

### Adding a new transport
1. Add the channel to the `NotificationChannel` enum
   (`entities/notification.enums.ts`).
2. Create `providers/<name>.provider.ts`: a `@Injectable()` class implementing
   `NotificationProvider`, with `readonly channel = NotificationChannel.<NAME>` and a
   `send()` that returns `{ success, messageId?, error?, statusCode?, response? }`.
   Push transports read device tokens from `notification.metadata.pushTokens`.
3. Register it in `notifications.module.ts`: add the class to `providers`, and add it
   to the `NOTIFICATION_PROVIDERS` factory array + its `inject` list.

No change to `ProviderFactory` or the processor is needed — resolution is by `channel`.

## Configuration

All provider variables are **optional** (`src/config/env.validation.ts`); unset
providers run in test mode. Bull uses the default local Redis.

```env
# SMTP (email)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_user
SMTP_PASSWORD=your_password
EMAIL_FROM="StellAIverse" <noreply@stellaiverse.com>

# SendGrid (email)
SENDGRID_API_KEY=your_api_key
SENDGRID_FROM_EMAIL=notifications@stellaiverse.com
SENDGRID_FROM_NAME=StellAIverse
SENDGRID_RATE_LIMIT=100

# Mailgun (email)
MAILGUN_API_KEY=your_api_key
MAILGUN_DOMAIN=mg.stellaiverse.com
MAILGUN_FROM_EMAIL=notifications@mg.stellaiverse.com
MAILGUN_FROM_NAME=StellAIverse
MAILGUN_RATE_LIMIT=100

# FCM (Android/Web push)
FCM_SERVER_KEY=your_fcm_key
FCM_PROJECT_ID=your_project_id
FCM_RATE_LIMIT=500

# APNs (iOS push)
APNS_AUTH_KEY=your_apns_key
APNS_BUNDLE_ID=com.stellaiverse.app
APNS_RATE_LIMIT=500
```

## Usage

### Enqueue with a template
```typescript
await notificationsService.create({
  userId: 'user-uuid',
  type: NotificationType.EMAIL,
  channel: NotificationChannel.SMTP,
  template: NotificationTemplate.WELCOME,
  templateData: { name: 'Ada', actionUrl: 'https://app.stellaiverse.com' },
  // subject/content omitted -> rendered from the template
});
```

### Push (tokens resolved from preferences, or passed explicitly)
```typescript
await notificationsService.create({
  userId: 'user-uuid',
  type: NotificationType.PUSH,
  channel: NotificationChannel.FCM,
  template: NotificationTemplate.PORTFOLIO_UPDATE,
  templateData: { name: 'Ada', changePercent: '12.5', period: 'week', portfolioValue: '$10,000' },
  // metadata.pushTokens is filled from the user's saved preferences if not supplied
});
```

### Override the template
```typescript
await notificationsService.create({
  userId: 'user-uuid',
  type: NotificationType.EMAIL,
  channel: NotificationChannel.SENDGRID,
  template: NotificationTemplate.WELCOME, // required, but overridden below
  subject: 'A custom subject',
  content: '<h1>Custom HTML body</h1>',
  recipient: 'user@example.com',
});
```

## Retry, dead-letter & recovery

The Bull processor (`notification.processor.ts`) attempts delivery and, on failure:
- **Retries** with exponential backoff while attempts remain — status `FAILED`,
  `retryCount++`, `nextRetryAt` scheduled.
- Backoff: `min(1s * 2^retryCount, 5min)`; **max 5 attempts**.
- After the final attempt the notification is moved to **`DEAD_LETTER`** and the
  worker stops retrying it.

Every attempt is recorded in `notification_delivery_logs` (success/failure, attempt
number, error, provider response).

**Recovery** is via the admin surface. `requeueOne(id)` / `requeueFailed()` reset a
notification's retry state (`status=PENDING`, `retryCount=0`, `nextRetryAt=null`,
`failureReason=null`) and re-enqueue it with a fresh attempt budget — so **dead-letter
items can be recovered**, which the old `queue/retry` endpoint could not do.

## User preferences

```typescript
{
  emailEnabled: boolean,
  pushEnabled: boolean,
  inAppEnabled: boolean,
  // keyed by NotificationType ("email" | "push" | "in_app")
  channelPreferences: {
    email?: { enabled?: boolean; email?: string },
    push?:  { enabled?: boolean; pushTokens?: string[] },
  },
  // keyed by template name
  templatePreferences: { [template: string]: { enabled?: boolean; channels?: NotificationType[] } }
}
```

`create()` refuses a channel the user has disabled and resolves the recipient email
(or push tokens) from these preferences when not supplied on the request.

## Testing

```bash
npm test -- notifications
```

Covers templating (render, nested paths, HTML-escaping, missing var, unknown
template), SMTP delivery (test-mode + configured success/error), processor delivery
success / retry / dead-letter / backoff, and the service's create-renders-and-enqueues
plus requeue/findFailed behavior.
