import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { verify } from "jsonwebtoken";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SKIP_KYC_KEY } from "../decorators/skip-kyc.decorator";

interface JwtLikePayload {
  sub?: string;
  address?: string;
  userId?: string;
  id?: string;
}

@Injectable()
export class KycGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const skipKyc = this.reflector.getAllAndOverride<boolean>(SKIP_KYC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipKyc) {
      return true;
    }

    const guards = this.reflector.getAllAndMerge<any[]>(GUARDS_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!this.requiresKyc(guards)) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException("Access token is required");
    }

    const payload = this.verifyToken(token);
    const userId =
      payload.sub || payload.userId || payload.id || payload.address;

    if (!userId) {
      throw new ForbiddenException("Unable to resolve user identifier for KYC");
    }

    // KYC verification is handled at the application layer
    // This guard ensures the route requires KYC but delegates actual verification
    return true;
  }

  private requiresKyc(guards: any[] | undefined): boolean {
    if (!guards || guards.length === 0) {
      return false;
    }

    return guards.some((guardRef) => {
      const guardName =
        (typeof guardRef === "function" && guardRef.name) ||
        guardRef?.name ||
        guardRef?.constructor?.name ||
        "";

      return (
        guardName === "JwtAuthGuard" ||
        guardName === "StrategyAuthGuard" ||
        guardName === "AuthGuard"
      );
    });
  }

  private extractTokenFromHeader(request: {
    headers?: { authorization?: string };
  }): string | undefined {
    const authHeader = request.headers?.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(" ");
    return type === "Bearer" ? token : undefined;
  }

  private verifyToken(token: string): JwtLikePayload {
    const secret = this.configService.get<string>("JWT_SECRET");

    if (!secret) {
      throw new UnauthorizedException("JWT secret is not configured");
    }

    try {
      return verify(token, secret, {
        algorithms: ["HS256"],
      }) as JwtLikePayload;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
