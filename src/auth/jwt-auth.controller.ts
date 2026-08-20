import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { EnhancedAuthService } from "./enhanced-auth.service";
import { JwtAuthGuard } from "./jwt.guard";
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  TwoFactorVerifyDto,
} from "./dto/auth.dto";
import { Public } from "../common/decorators/public.decorator";
import { SensitiveRateLimit } from "../common/decorators/rate-limit.decorator";

@ApiTags("JWT Authentication")
@Controller("auth/jwt")
export class JwtAuthController {
  constructor(private readonly enhancedAuthService: EnhancedAuthService) {}

  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Register with email and password",
    description:
      "Creates a new user account with email/password authentication. Returns access and refresh tokens.",
  })
  @ApiResponse({
    status: 201,
    description: "User registered successfully",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            username: { type: "string" },
            role: { type: "string" },
            kycStatus: { type: "string" },
          },
        },
        requiresTwoFactor: { type: "boolean" },
      },
    },
  })
  @ApiResponse({ status: 409, description: "Email or username already exists" })
  @ApiResponse({ status: 400, description: "Invalid input data" })
  async register(
    @Body() registerDto: RegisterDto,
    @Request() req,
  ) {
    return this.enhancedAuthService.register(
      registerDto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Public()
  @SensitiveRateLimit("auth")
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Login with email and password",
    description:
      "Authenticates a user with email/password. Returns access and refresh tokens. Implements account lockout after configurable failed attempts.",
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: "Login successful",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            username: { type: "string" },
            role: { type: "string" },
            kycStatus: { type: "string" },
          },
        },
        requiresTwoFactor: { type: "boolean" },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Invalid credentials or account locked" })
  @ApiResponse({ status: 400, description: "Account uses wallet authentication" })
  @ApiResponse({ status: 429, description: "Too many login attempts" })
  async login(@Body() loginDto: LoginDto, @Request() req) {
    return this.enhancedAuthService.login(
      loginDto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Public()
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Refresh access token",
    description:
      "Uses a valid refresh token to issue a new access token. The old refresh token is revoked and replaced with a new one.",
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: "Token refreshed successfully",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Invalid or expired refresh token" })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto, @Request() req) {
    return this.enhancedAuthService.refreshToken(
      refreshTokenDto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Logout and revoke refresh tokens",
    description:
      "Revokes all refresh tokens for the authenticated user, effectively logging them out from all devices.",
  })
  @ApiResponse({ status: 200, description: "Logout successful" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async logout(@Request() req) {
    const userId = req.user.sub || req.user.id;
    await this.enhancedAuthService.revokeAllRefreshTokens(userId);
    return { message: "Logged out successfully" };
  }

  @Post("logout/current")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Logout current session",
    description:
      "Revokes only the current refresh token, allowing other sessions to remain active.",
  })
  @ApiResponse({ status: 200, description: "Logout successful" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async logoutCurrent(@Request() req) {
    const refreshToken = req.body.refreshToken;
    if (refreshToken) {
      await this.enhancedAuthService.revokeRefreshToken(refreshToken);
    }
    return { message: "Current session logged out successfully" };
  }

  @Public()
  @Post("2fa/verify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify two-factor authentication",
    description:
      "Completes the login process by verifying the 2FA code or backup code. Returns final access and refresh tokens.",
  })
  @ApiBody({ type: TwoFactorVerifyDto })
  @ApiResponse({
    status: 200,
    description: "2FA verified successfully",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Invalid 2FA code" })
  @ApiResponse({ status: 400, description: "2FA not enabled for user" })
  async verifyTwoFactor(
    @Body() verifyDto: TwoFactorVerifyDto,
    @Request() req,
  ) {
    const userId = req.body.userId;
    return this.enhancedAuthService.verifyTwoFactorLogin(userId, verifyDto);
  }
}
