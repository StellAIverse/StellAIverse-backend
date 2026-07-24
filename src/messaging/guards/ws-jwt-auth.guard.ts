import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Observable } from "rxjs";
import { Socket } from "socket.io";
import { ConfigService } from "@nestjs/config";
import * as jwt from "jsonwebtoken";
import { TokenBlacklistService } from "../../auth/token-blacklist.service";

interface JwtPayload {
  sub?: string;
  address?: string;
  email?: string;
  username?: string;
  role?: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private tokenBlacklist: TokenBlacklistService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const authToken = this.extractTokenFromHandshake(client);
    
    if (!authToken) {
      throw new UnauthorizedException("Authentication token not provided");
    }

    try {
      const secret = this.configService.get<string>("JWT_SECRET");
      const payload = jwt.verify(authToken, secret) as JwtPayload;
      
      // Check if token is blacklisted
      if (payload.jti && this.tokenBlacklist.isRevoked(payload.jti)) {
        throw new UnauthorizedException("Token has been revoked");
      }

      // Attach user to client for later use
      if (payload.sub) {
        client.data.user = {
          id: payload.sub,
          email: payload.email,
          username: payload.username,
          role: payload.role || "user",
          type: "traditional",
        };
      } else if (payload.address) {
        client.data.user = {
          address: payload.address,
          email: payload.email,
          role: payload.role || "user",
          type: "wallet",
        };
      } else {
        throw new UnauthorizedException("Invalid token payload");
      }

      return true;
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  private extractTokenFromHandshake(client: Socket): string | undefined {
    const authHeader = client.handshake.auth?.token || client.handshake.headers?.authorization;
    if (!authHeader) return undefined;
    
    if (authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }
    return authHeader;
  }
}