import { NotificationTemplate } from "../entities/notification.enums";

/**
 * A single notification template definition.
 *
 * `subject`, `html`, and `text` are template strings that may contain
 * `{{ dotted.path }}` placeholders. Placeholders are resolved against the
 * caller-supplied `templateData` by {@link TemplateService}. Values interpolated
 * into `html` are HTML-escaped; `subject`/`text` are treated as plain text.
 *
 * `variables` documents the data keys a template expects. It is informational
 * (surfaced by `TemplateService.listTemplates()` and the README) — missing
 * variables simply render as an empty string rather than throwing.
 */
export interface NotificationTemplateDefinition {
  subject: string;
  html: string;
  text: string;
  variables: string[];
}

const wrapHtml = (title: string, body: string): string => `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 24px; text-align: center; border-radius: 10px 10px 0 0; }
      .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 10px 10px; }
      .button { display: inline-block; padding: 12px 30px; background: #667eea; color: #fff; text-decoration: none; border-radius: 5px; margin: 16px 0; }
      .muted { color: #666; font-size: 12px; text-align: center; margin-top: 16px; }
      .code { background: #fff; padding: 12px; border-left: 4px solid #667eea; margin: 12px 0; font-family: monospace; word-break: break-all; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header"><h1>${title}</h1></div>
      <div class="content">${body}</div>
      <div class="muted">© StellAIverse. This is an automated message — please do not reply.</div>
    </div>
  </body>
</html>`;

/**
 * The built-in transactional templates. To add a template: add a value to the
 * {@link NotificationTemplate} enum and a matching entry here.
 */
export const NOTIFICATION_TEMPLATES: Record<
  NotificationTemplate,
  NotificationTemplateDefinition
> = {
  [NotificationTemplate.WELCOME]: {
    subject: "Welcome to StellAIverse, {{name}}!",
    html: wrapHtml(
      "👋 Welcome to StellAIverse",
      '<p>Hi {{name}},</p><p>Your account is ready. Explore your dashboard to get started with autonomous, on-chain agents.</p><p style="text-align:center;"><a href="{{actionUrl}}" class="button">Open dashboard</a></p>',
    ),
    text: "Hi {{name}}, welcome to StellAIverse! Your account is ready. Open your dashboard: {{actionUrl}}",
    variables: ["name", "actionUrl"],
  },

  [NotificationTemplate.PASSWORD_RESET]: {
    subject: "Reset your StellAIverse password",
    html: wrapHtml(
      "🔑 Reset your password",
      '<p>Hi {{name}},</p><p>We received a request to reset your password. Click below to choose a new one.</p><p style="text-align:center;"><a href="{{resetUrl}}" class="button">Reset password</a></p><div class="code">{{resetUrl}}</div><p><strong>This link expires in {{expiryMinutes}} minutes.</strong> If you didn\'t request this, you can safely ignore this email.</p>',
    ),
    text: "Hi {{name}}, reset your StellAIverse password here: {{resetUrl}} (expires in {{expiryMinutes}} minutes). If you did not request this, ignore this email.",
    variables: ["name", "resetUrl", "expiryMinutes"],
  },

  [NotificationTemplate.EMAIL_VERIFICATION]: {
    subject: "Verify your email address",
    html: wrapHtml(
      "📧 Verify your email",
      '<p>Hi {{name}},</p><p>Please confirm your email address to finish setting up your account.</p><p style="text-align:center;"><a href="{{verificationUrl}}" class="button">Verify email</a></p><div class="code">{{verificationUrl}}</div><p><strong>This link expires in {{expiryMinutes}} minutes.</strong></p>',
    ),
    text: "Hi {{name}}, verify your email address: {{verificationUrl}} (expires in {{expiryMinutes}} minutes).",
    variables: ["name", "verificationUrl", "expiryMinutes"],
  },

  [NotificationTemplate.TRANSACTION_CONFIRMATION]: {
    subject: "Transaction {{status}}: {{amount}} {{asset}}",
    html: wrapHtml(
      "✅ Transaction {{status}}",
      '<p>Hi {{name}},</p><p>Your transaction of <strong>{{amount}} {{asset}}</strong> is now <strong>{{status}}</strong>.</p><p>Reference:</p><div class="code">{{txHash}}</div>',
    ),
    text: "Hi {{name}}, your transaction of {{amount}} {{asset}} is now {{status}}. Reference: {{txHash}}",
    variables: ["name", "amount", "asset", "status", "txHash"],
  },

  [NotificationTemplate.PORTFOLIO_UPDATE]: {
    subject: "Your portfolio moved {{changePercent}}% ({{period}})",
    html: wrapHtml(
      "📈 Portfolio update",
      "<p>Hi {{name}},</p><p>Over the last {{period}}, your portfolio changed by <strong>{{changePercent}}%</strong>.</p><p>Current value: <strong>{{portfolioValue}}</strong>.</p>",
    ),
    text: "Hi {{name}}, over the last {{period}} your portfolio changed by {{changePercent}}%. Current value: {{portfolioValue}}.",
    variables: ["name", "changePercent", "period", "portfolioValue"],
  },

  [NotificationTemplate.SECURITY_ALERT]: {
    subject: "Security alert: {{event}}",
    html: wrapHtml(
      "🔐 Security alert",
      "<p>Hi {{name}},</p><p>We detected the following activity on your account:</p><p><strong>{{event}}</strong></p><p>IP address: {{ipAddress}}<br/>When: {{timestamp}}</p><p>If this wasn't you, secure your account immediately.</p>",
    ),
    text: "Hi {{name}}, security alert: {{event}}. IP: {{ipAddress}} at {{timestamp}}. If this was not you, secure your account immediately.",
    variables: ["name", "event", "ipAddress", "timestamp"],
  },

  [NotificationTemplate.SYSTEM_MAINTENANCE]: {
    subject: "Scheduled maintenance: {{startTime}}",
    html: wrapHtml(
      "🛠️ Scheduled maintenance",
      "<p>StellAIverse will be undergoing scheduled maintenance from <strong>{{startTime}}</strong> to <strong>{{endTime}}</strong>.</p><p>{{description}}</p>",
    ),
    text: "Scheduled maintenance from {{startTime}} to {{endTime}}. {{description}}",
    variables: ["startTime", "endTime", "description"],
  },
};
