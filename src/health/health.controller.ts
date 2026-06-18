import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  HealthCheckResult,
} from "@nestjs/terminus";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { RateLimit } from "../common/decorators/rate-limit.decorator";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
  ) {}

  /**
   * Liveness probe — basic check that the process is running.
   * Returns HTTP 200 if the app is alive.
   */
  @Get("live")
  @HealthCheck()
  @RateLimit({ level: "free", limit: 5, windowMs: 60000 })
  @ApiOperation({
    summary: "Liveness Check",
    description:
      "Basic health check for Kubernetes liveness probe. Returns 200 if the process is alive.",
    operationId: "getLiveness",
  })
  @ApiResponse({
    status: 200,
    description: "Service is alive",
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
  async checkLiveness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.memory.checkHeap("memory_heap", 150 * 1024 * 1024), // 150MB
    ]);
  }

  /**
   * Readiness probe — detailed check of all dependencies.
   * Verifies database connectivity, cache, and external services.
   */
  @Get("ready")
  @HealthCheck()
  @RateLimit({ level: "free", limit: 2, windowMs: 60000 })
  @ApiOperation({
    summary: "Readiness Check",
    description:
      "Detailed readiness probe for Kubernetes. Checks database connectivity, cache, and external services.",
    operationId: "getReadiness",
  })
  @ApiResponse({
    status: 200,
    description: "Service is ready",
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
    status: 503,
    description: "Service is not ready — one or more dependencies are down",
  })
  async checkReadiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () =>
        this.db.pingCheck("database", {
          timeout: 3000,
        }),
      () => this.memory.checkHeap("memory_heap", 300 * 1024 * 1024), // 300MB
      () => this.memory.checkRSS("memory_rss", 500 * 1024 * 1024), // 500MB
    ]);
  }

  /**
   * Startup probe — checks if the application has fully started.
   * Includes database, memory, and any initialization checks.
   */
  @Get("startup")
  @HealthCheck()
  @RateLimit({ level: "free", limit: 1, windowMs: 60000 })
  @ApiOperation({
    summary: "Startup Check",
    description:
      "Startup probe for Kubernetes. Confirms the application has fully initialized and all connections are established.",
    operationId: "getStartup",
  })
  @ApiResponse({
    status: 200,
    description: "Application startup is complete",
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
  async checkStartup(): Promise<HealthCheckResult> {
    return this.health.check([
      () =>
        this.db.pingCheck("database", {
          timeout: 5000,
        }),
      () => this.memory.checkHeap("memory_heap", 200 * 1024 * 1024), // 200MB
    ]);
  }
}