import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AnalyticsService } from "./analytics.service";

@Injectable()
export class AnalyticsCronService {
  private readonly logger = new Logger(AnalyticsCronService.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyMetricsAggregation() {
    this.logger.log("Starting daily analytics metrics aggregation...");
    try {
      // Aggregate for yesterday, as this runs right at midnight
      const dateToAggregate = new Date();
      dateToAggregate.setDate(dateToAggregate.getDate() - 1);
      
      await this.analyticsService.aggregateDailyMetrics(dateToAggregate);
      this.logger.log("Successfully completed daily metrics aggregation.");
    } catch (error) {
      this.logger.error("Failed to aggregate daily metrics", error);
    }
  }
}
