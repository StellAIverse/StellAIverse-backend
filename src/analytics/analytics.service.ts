import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { AnalyticsEvent, EventType } from "./entities/analytics-event.entity";
import { DailyMetric } from "./entities/daily-metric.entity";
import { IngestEventDto, BatchIngestEventsDto } from "./dto/ingest-events.dto";

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly eventRepository: Repository<AnalyticsEvent>,
    @InjectRepository(DailyMetric)
    private readonly metricRepository: Repository<DailyMetric>,
  ) {}

  /**
   * Ingest a single event
   */
  async ingestEvent(
    dto: IngestEventDto,
    metadata: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      country?: string;
      device?: string;
      browser?: string;
      os?: string;
    },
  ): Promise<AnalyticsEvent> {
    const event = this.eventRepository.create({
      ...dto,
      userId: metadata.userId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      country: metadata.country,
      device: metadata.device,
      browser: metadata.browser,
      os: metadata.os,
      processed: false,
      optedOut: false,
    });

    return this.eventRepository.save(event);
  }

  /**
   * Ingest a batch of events
   */
  async ingestBatch(
    dto: BatchIngestEventsDto,
    metadata: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      country?: string;
      device?: string;
      browser?: string;
      os?: string;
    },
  ): Promise<{ accepted: number; rejected: number }> {
    const events = dto.events.map((eventDto) =>
      this.eventRepository.create({
        ...eventDto,
        userId: dto.userId || metadata.userId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        country: metadata.country,
        device: metadata.device,
        browser: metadata.browser,
        os: metadata.os,
        processed: false,
        optedOut: false,
      }),
    );

    const result = await this.eventRepository.save(events);
    this.logger.log(`Batch ingested ${result.length} events`);
    return { accepted: result.length, rejected: 0 };
  }

  /**
   * Get daily active users for a date range
   */
  async getDailyActiveUsers(startDate: Date, endDate: Date): Promise<{ date: string; count: number }[]> {
    const result = await this.eventRepository
      .createQueryBuilder("event")
      .select("DATE(event.createdAt)", "date")
      .addSelect("COUNT(DISTINCT event.userId)", "count")
      .where("event.createdAt BETWEEN :startDate AND :endDate", { startDate, endDate })
      .andWhere("event.userId IS NOT NULL")
      .andWhere("event.optedOut = false")
      .groupBy("DATE(event.createdAt)")
      .orderBy("date", "ASC")
      .getRawMany();

    return result.map((r) => ({
      date: r.date,
      count: parseInt(r.count, 10),
    }));
  }

  /**
   * Get event counts by type for a date range
   */
  async getEventCountsByType(startDate: Date, endDate: Date): Promise<{ eventType: string; count: number }[]> {
    const result = await this.eventRepository
      .createQueryBuilder("event")
      .select("event.eventType", "eventType")
      .addSelect("COUNT(*)", "count")
      .where("event.createdAt BETWEEN :startDate AND :endDate", { startDate, endDate })
      .andWhere("event.optedOut = false")
      .groupBy("event.eventType")
      .orderBy("count", "DESC")
      .getRawMany();

    return result.map((r) => ({
      eventType: r.eventType,
      count: parseInt(r.count, 10),
    }));
  }

  /**
   * Get funnel conversion rates
   */
  async getFunnelConversion(
    steps: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<{ step: string; count: number; conversionRate: number }[]> {
    const results: { step: string; count: number; conversionRate: number }[] = [];
    let previousCount = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const count = await this.eventRepository
        .createQueryBuilder("event")
        .where("event.eventName = :step", { step })
        .andWhere("event.createdAt BETWEEN :startDate AND :endDate", { startDate, endDate })
        .andWhere("event.optedOut = false")
        .getCount();

      const conversionRate = i === 0 ? 100 : previousCount > 0 ? (count / previousCount) * 100 : 0;

      results.push({
        step,
        count,
        conversionRate: Math.round(conversionRate * 100) / 100,
      });

      previousCount = count;
    }

    return results;
  }

  /**
   * Aggregate daily metrics
   */
  async aggregateDailyMetrics(date: Date): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Count DAU
    const dau = await this.eventRepository
      .createQueryBuilder("event")
      .select("COUNT(DISTINCT event.userId)", "count")
      .where("event.createdAt BETWEEN :start AND :end", { start: startOfDay, end: endOfDay })
      .andWhere("event.userId IS NOT NULL")
      .andWhere("event.optedOut = false")
      .getRawOne();

    await this.upsertMetric("dau", date, parseInt(dau.count, 10));

    // Count total events
    const totalEvents = await this.eventRepository
      .createQueryBuilder("event")
      .select("COUNT(*)", "count")
      .where("event.createdAt BETWEEN :start AND :end", { start: startOfDay, end: endOfDay })
      .andWhere("event.optedOut = false")
      .getRawOne();

    await this.upsertMetric("total_events", date, parseInt(totalEvents.count, 10));

    // Count page views
    const pageViews = await this.eventRepository
      .createQueryBuilder("event")
      .select("COUNT(*)", "count")
      .where("event.createdAt BETWEEN :start AND :end", { start: startOfDay, end: endOfDay })
      .andWhere("event.eventType = :type", { type: EventType.PAGE_VIEW })
      .andWhere("event.optedOut = false")
      .getRawOne();

    await this.upsertMetric("page_views", date, parseInt(pageViews.count, 10));

    // Count transactions
    const transactions = await this.eventRepository
      .createQueryBuilder("event")
      .select("COUNT(*)", "count")
      .where("event.createdAt BETWEEN :start AND :end", { start: startOfDay, end: endOfDay })
      .andWhere("event.eventType = :type", { type: EventType.TRANSACTION })
      .andWhere("event.optedOut = false")
      .getRawOne();

    await this.upsertMetric("transactions", date, parseInt(transactions.count, 10));

    this.logger.log(`Aggregated daily metrics for ${date.toISOString().split("T")[0]}`);
  }

  /**
   * Get aggregated metrics for a date range
   */
  async getMetrics(startDate: Date, endDate: Date): Promise<DailyMetric[]> {
    return this.metricRepository.find({
      where: {
        date: Between(startDate, endDate),
      },
      order: { date: "ASC", metricName: "ASC" },
    });
  }

  /**
   * Opt out user from tracking
   */
  async optOut(userId: string): Promise<void> {
    await this.eventRepository.update(
      { userId },
      { optedOut: true },
    );
    this.logger.log(`User ${userId} opted out of analytics`);
  }

  /**
   * Process unprocessed events
   */
  async processUnprocessedEvents(limit: number = 1000): Promise<number> {
    const events = await this.eventRepository.find({
      where: { processed: false },
      order: { createdAt: "ASC" },
      take: limit,
    });

    if (events.length === 0) return 0;

    // Mark as processed
    const ids = events.map((e) => e.id);
    await this.eventRepository.update(ids, { processed: true });

    this.logger.log(`Processed ${events.length} events`);
    return events.length;
  }

  private async upsertMetric(name: string, date: Date, value: number): Promise<void> {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const existing = await this.metricRepository.findOne({
      where: { metricName: name, date: normalizedDate },
    });

    if (existing) {
      existing.value = value;
      await this.metricRepository.save(existing);
    } else {
      const metric = this.metricRepository.create({
        metricName: name,
        date: normalizedDate,
        value,
      });
      await this.metricRepository.save(metric);
    }
  }
}
