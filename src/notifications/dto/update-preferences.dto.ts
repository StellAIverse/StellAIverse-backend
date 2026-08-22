import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsObject, IsOptional } from "class-validator";
import { NotificationType } from "../entities/notification.enums";

/**
 * Body for `PUT /users/:id/notification-preferences`.
 *
 * The global `ValidationPipe` runs with `forbidNonWhitelisted: true`
 * (see `src/main.ts`), so every accepted property needs a validation decorator —
 * a plain interface/class without decorators would have every field stripped and
 * the request rejected. The nested `channelPreferences`/`templatePreferences`
 * maps are validated as opaque objects (`@IsObject`) rather than deeply, which is
 * intentional: their keys are dynamic (`NotificationType` / template names).
 */
export class UpdatePreferencesDto {
  @ApiPropertyOptional({ description: "Master switch for email notifications" })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({ description: "Master switch for push notifications" })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({
    description: "Master switch for in-app notifications",
  })
  @IsOptional()
  @IsBoolean()
  inAppEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      "Per-channel settings keyed by notification type, e.g. " +
      '{ "email": { "enabled": true, "email": "me@example.com" }, ' +
      '"push": { "enabled": true, "pushTokens": ["<token>"] } }',
  })
  @IsOptional()
  @IsObject()
  channelPreferences?: Record<
    NotificationType,
    { enabled?: boolean; email?: string; pushTokens?: string[] }
  >;

  @ApiPropertyOptional({
    description:
      "Per-template opt-in settings keyed by template name, e.g. " +
      '{ "portfolio_update": { "enabled": false } }',
  })
  @IsOptional()
  @IsObject()
  templatePreferences?: Record<
    string,
    { enabled?: boolean; channels?: NotificationType[] }
  >;
}
