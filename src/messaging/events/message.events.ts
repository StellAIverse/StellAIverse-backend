export class MessageSentEvent {
  constructor(
    public readonly message: any,
    public readonly conversationId: string,
    public readonly recipientIds: string[],
  ) {}
}

export class MessageDeliveredEvent {
  constructor(
    public readonly messageId: string,
    public readonly conversationId: string,
    public readonly userId: string,
  ) {}
}

export class MessageReadEvent {
  constructor(
    public readonly messageId: string,
    public readonly conversationId: string,
    public readonly userId: string,
  ) {}
}

export class UserPresenceChangedEvent {
  constructor(
    public readonly userId: string,
    public readonly isOnline: boolean,
    public readonly lastSeenAt?: Date,
  ) {}
}