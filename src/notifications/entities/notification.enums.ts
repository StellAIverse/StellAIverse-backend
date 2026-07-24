export enum NotificationType {
  EMAIL = 'email',
  PUSH = 'push',
  IN_APP = 'in_app',
}

export enum NotificationStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

export enum NotificationChannel {
  SENDGRID = 'sendgrid',
  MAILGUN = 'mailgun',
  FCM = 'fcm',
  APNs = 'apns',
  INTERNAL = 'internal',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum NotificationTemplate {
  WELCOME = 'welcome',
  PASSWORD_RESET = 'password_reset',
  EMAIL_VERIFICATION = 'email_verification',
  TRANSACTION_CONFIRMATION = 'transaction_confirmation',
  PORTFOLIO_UPDATE = 'portfolio_update',
  SECURITY_ALERT = 'security_alert',
  SYSTEM_MAINTENANCE = 'system_maintenance',
}