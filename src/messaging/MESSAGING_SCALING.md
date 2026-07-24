# Messaging Module: Scaling Strategy & Infrastructure

## Overview
The StellAIverse messaging module uses Socket.IO for real-time WebSocket communication, combined with PostgreSQL for persistence and Redis for horizontal scaling. This document outlines the infrastructure requirements and scaling strategy to support a growing user base.

## Required Infrastructure

### 1. Redis (Required for Horizontal Scaling)
Socket.IO requires a Redis adapter to enable broadcasting across multiple backend instances. Redis acts as a pub/sub layer for message distribution.

#### Redis Setup:
```typescript
// In messaging.module.ts add the Redis adapter
import { RedisAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

// Then in the MessagingGateway after server initialization:
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
this.server.adapter(createAdapter(pubClient, subClient));
```

### 2. PostgreSQL (Current Persistence Layer)
We currently use PostgreSQL for storing all conversations, messages, and presence data. This is sufficient for up to millions of messages, but for larger scale we can implement the following optimizations:

### 3. Additional Recommended Infrastructure
- **S3/Object Storage**: For archiving old messages (older than 1 year)
- **Full-text Search Service**: For implementing message search functionality (Elasticsearch or Typesense)

## Message Lifecycle & Cleanup Strategy

### Persistence Rules:
1. **Active Messages**: Last 12 months stored in PostgreSQL
2. **Archived Messages**: Older than 12 months moved to S3/Glacier
3. **Cron Job**: Run `messagingService.archiveOldMessages()` monthly

### Implementation:
```typescript
// Add a cron service to run monthly archiving
import { Cron } from "@nestjs/schedule";

@Cron("0 0 1 * *") // Run on the 1st of every month
async handleArchiving() {
  const archivedCount = await this.messagingService.archiveOldMessages();
  logger.log(`Archived ${archivedCount} old messages`);
}
```

## WebSocket Connection Flow
1. Client connects to `wss://api.example.com/messaging`
2. Client sends JWT token in handshake
3. Server validates token, attaches user to socket
4. Server adds user to their personal room: `user:{userId}`
5. When joining a conversation, server adds socket to `conversation:{conversationId}`

## Reconnection & Message Guarantee
To handle dropped connections and ensure no message loss:
1. **Client-side buffering**: Messages are queued when disconnected
2. **Message IDs**: Every message gets a UUID client-side to prevent duplicates
3. **Last seen synchronization**: On reconnection, client fetches all messages since last seen
4. **At-least-once delivery**: Server persists messages before broadcasting

## Scaling to Multiple Instances
1. Deploy behind a load balancer that supports sticky sessions (or use Redis adapter which removes this requirement)
2. Use the Redis adapter to enable cross-instance communication
3. Implement connection draining during deployments to avoid abrupt disconnections
4. Monitor connection counts per instance, scale out when approaching 10k connections per instance

## Monitoring & Metrics
Key metrics to track:
- Active connections per instance
- Messages sent/sec
- Delivery receipts latency
- Archive job success rate
- WebSocket error rates

## Testing Strategy
1. **Unit tests**: Test all service methods
2. **Integration tests**: Test WebSocket connection, message flow
3. **Load tests**: Simulate thousands of concurrent users
4. **Chaos tests**: Simulate network splits, instance failures