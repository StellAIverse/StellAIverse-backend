import { Inject, Injectable } from "@nestjs/common";
import { NotificationChannel } from "../entities/notification.enums";
import {
  NotificationProvider,
  NOTIFICATION_PROVIDERS,
} from "../interfaces/notification-provider.interface";

/**
 * Resolves the delivery provider for a given channel.
 *
 * Providers are injected as an array via the {@link NOTIFICATION_PROVIDERS}
 * token and indexed by their `channel`. Adding a new transport therefore
 * requires no change here — implement {@link NotificationProvider} and register
 * the provider in the token's factory (see notifications.module.ts).
 */
@Injectable()
export class ProviderFactory {
  private readonly providers: Map<NotificationChannel, NotificationProvider>;

  constructor(
    @Inject(NOTIFICATION_PROVIDERS)
    providers: NotificationProvider[],
  ) {
    this.providers = new Map(providers.map((p) => [p.channel, p]));
  }

  getProvider(channel: NotificationChannel): NotificationProvider {
    const provider = this.providers.get(channel);
    if (!provider) {
      throw new Error(`Unsupported notification channel: ${channel}`);
    }
    return provider;
  }

  /** Channels with a registered provider (useful for diagnostics/tests). */
  supportedChannels(): NotificationChannel[] {
    return [...this.providers.keys()];
  }
}
