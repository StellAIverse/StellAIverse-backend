import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { AnalyticsService } from "./analytics.service";
import { BatchIngestEventsDto, IngestEventDto } from "./dto/ingest-events.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Public } from "../common/decorators/public.decorator";

@ApiTags("Analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post("events")
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Ingest event",
    description: "Ingest a single analytics event",
  })
  @ApiResponse({ status: 202, description: "Event accepted for processing" })
  async ingestEvent(@Body() dto: IngestEventDto, @Req() req: any) {
    const metadata = this.extractMetadata(req);
    const event = await this.analyticsService.ingestEvent(dto, metadata);
    return { status: "accepted", eventId: event.id };
  }

  @Post("events/batch")
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Ingest batch events",
    description: "Ingest multiple analytics events in a single request",
  })
  @ApiResponse({ status: 202, description: "Batch accepted for processing" })
  async ingestBatch(@Body() dto: BatchIngestEventsDto, @Req() req: any) {
    const metadata = this.extractMetadata(req);
    const result = await this.analyticsService.ingestBatch(dto, metadata);
    return { status: "accepted", ...result };
  }

  @Get("metrics/dau")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get daily active users" })
  @ApiQuery({ name: "startDate", required: true, type: String })
  @ApiQuery({ name: "endDate", required: true, type: String })
  async getDailyActiveUsers(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.analyticsService.getDailyActiveUsers(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get("metrics/events")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get event counts by type" })
  @ApiQuery({ name: "startDate", required: true, type: String })
  @ApiQuery({ name: "endDate", required: true, type: String })
  async getEventCountsByType(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.analyticsService.getEventCountsByType(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get("metrics/funnel")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get funnel conversion rates" })
  @ApiQuery({ name: "steps", required: true, type: String, description: "Comma-separated step names" })
  @ApiQuery({ name: "startDate", required: true, type: String })
  @ApiQuery({ name: "endDate", required: true, type: String })
  async getFunnelConversion(
    @Query("steps") steps: string,
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    const stepArray = steps.split(",").map((s) => s.trim());
    return this.analyticsService.getFunnelConversion(
      stepArray,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get("metrics/summary")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get aggregated metrics summary" })
  @ApiQuery({ name: "startDate", required: true, type: String })
  @ApiQuery({ name: "endDate", required: true, type: String })
  async getMetricsSummary(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
  ) {
    return this.analyticsService.getMetrics(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Post("opt-out")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Opt out of analytics tracking" })
  async optOut(@Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    await this.analyticsService.optOut(userId);
    return { status: "opted_out" };
  }

  private extractMetadata(req: any) {
    const userAgent = req.headers?.["user-agent"] || "";
    const parsed = this.parseUserAgent(userAgent);

    return {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent,
      country: req.headers?.["cf-ipcountry"] || req.headers?.["x-country"],
      device: parsed.device,
      browser: parsed.browser,
      os: parsed.os,
    };
  }

  private parseUserAgent(ua: string) {
    let browser = "unknown";
    let os = "unknown";
    let device = "desktop";

    if (ua.includes("Mobile") || ua.includes("Android")) {
      device = "mobile";
    } else if (ua.includes("Tablet") || ua.includes("iPad")) {
      device = "tablet";
    }

    if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari")) browser = "Safari";
    else if (ua.includes("Edge")) browser = "Edge";

    if (ua.includes("Windows")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iOS")) os = "iOS";

    return { browser, os, device };
  }
}
