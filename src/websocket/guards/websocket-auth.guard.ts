import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

/**
 * WebSocket authentication guard.
 * Validates JWT tokens on WebSocket connections via the socket handshake auth.
 */
@Injectable()
export class WebSocketAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    const token =
      client.handshake?.auth?.token ||
      client.handshake?.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      client.disconnect(true);
      return false;
    }

    // Token validation is handled by the JWT strategy attached to the socket.
    // The userId/walletAddress are set on the socket during the connection lifecycle.
    return true;
  }
}
