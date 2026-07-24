import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AnalyticsService } from "./analytics.service";
import { AnalyticsController } from "./controllers/analytics.controller";
import { AnalyticsEvent } from "./entities/analytics-event.entity";
import { DailyMetric } from "./entities/daily-metric.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AnalyticsEvent, DailyMetric])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
