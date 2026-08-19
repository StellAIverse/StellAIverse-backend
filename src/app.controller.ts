import { Controller, Get, UseGuards, Request } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from "@nestjs/swagger";
import { AppService } from "./app.service";
import { JwtAuthGuard } from "./auth/jwt.guard";
import { RateLimit } from "./common/decorators/rate-limit.decorator";
import { RiskManagementHealthIndicator } from "./risk-management/health/risk-management.health";
import { Public } from "./common/decorators/public.decorator";

@ApiTags("Health")
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private health: HealthCheckService,
    private riskManagementHealth: RiskManagementHealthIndicator,
  ) {}

  @Public()
  @Get("health")
  @HealthCheck()
  @RateLimit({ level: "free", limit: 2, windowMs: 60000 }) // Max 2 requests per minute for health
  @ApiOperation({
    summary: "Health Check",
    description: "Check if the API is running and healthy",
    operationId: "getHealth",
  })
  @ApiResponse({
    status: 200,
    description: "Service is healthy",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        info: { type: "object" },
        error: { type: "object" },
        details: { type: "object" },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: "Too many requests",
  })
  checkHealth() {
    return this.health.check([() => this.riskManagementHealth.isHealthy()]);
  }

  @Public()
  @Get("health/live")
  @HealthCheck()
  @ApiOperation({
    summary: "Liveness Probe",
    description:
      "Orchestrator liveness probe. Returns 200 while the process is up and " +
      "able to serve requests. It performs no dependency checks, so a transient " +
      "downstream outage does not cause the pod to be restarted.",
    operationId: "getLiveness",
  })
  @ApiResponse({ status: 200, description: "Process is alive" })
  checkLiveness() {
    // No indicators: a passing response simply means the event loop is
    // responsive and the app can serve HTTP — the correct semantics for
    // Kubernetes `livenessProbe`.
    return this.health.check([]);
  }

  @Public()
  @Get("health/ready")
  @HealthCheck()
  @ApiOperation({
    summary: "Readiness Probe",
    description:
      "Orchestrator readiness probe. Returns 200 only when the service and its " +
      "critical dependencies are ready to receive traffic; the orchestrator " +
      "routes traffic to the pod only while this check passes.",
    operationId: "getReadiness",
  })
  @ApiResponse({ status: 200, description: "Service is ready for traffic" })
  @ApiResponse({ status: 503, description: "Service is not ready" })
  checkReadiness() {
    return this.health.check([() => this.riskManagementHealth.isHealthy()]);
  }

  @Public()
  @Get("info")
  @RateLimit({ level: "standard" }) // Default standard level
  @ApiOperation({
    summary: "API Information",
    description: "Get information about the API and its modules",
    operationId: "getInfo",
  })
  @ApiResponse({
    status: 200,
    description: "API information retrieved successfully",
    schema: {
      type: "object",
      properties: {
        name: { type: "string", example: "StellAIverse Backend" },
        version: { type: "string", example: "1.0.0" },
        description: {
          type: "string",
          example: "Comprehensive API for StellAIverse services",
        },
        modules: {
          type: "array",
          items: { type: "string" },
          example: ["Auth", "Users", "Agents", "Oracle", "Compute", "Audit"],
        },
      },
    },
  })
  getInfo(): {
    name: string;
    version: string;
    description: string;
    modules: string[];
  } {
    return this.appService.getInfo();
  }

  @UseGuards(JwtAuthGuard)
  @Get("protected")
  @ApiBearerAuth("JWT-auth")
  @ApiOperation({
    summary: "Protected Endpoint",
    description:
      "Example of a protected endpoint that requires JWT authentication",
    operationId: "getProtected",
  })
  @ApiResponse({
    status: 200,
    description: "Protected data accessed successfully",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", example: "This is a protected endpoint" },
        userAddress: {
          type: "string",
          example: "0x1234567890abcdef1234567890abcdef1234567890",
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: "Unauthorized - Invalid or missing JWT token",
  })
  @ApiResponse({
    status: 403,
    description: "Forbidden - Insufficient permissions",
  })
  getProtected(@Request() req: any): {
    message: string;
    userAddress: string;
  } {
    return {
      message: "This is a protected endpoint",
      userAddress: req.user.address,
    };
  }
}
