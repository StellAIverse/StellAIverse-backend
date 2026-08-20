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

    const result = await this.eventRepository
      .createQueryBuilder()
      .insert()
      .into(AnalyticsEvent)
      .values(event)
      .orIgnore()
      .execute();

    if (result.identifiers && result.identifiers.length > 0) {
      event.id = result.identifiers[0].id;
    }
    return event;
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
    if (!dto.events.length) {
      return { accepted: 0, rejected: 0 };
    }

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

    const result = await this.eventRepository
      .createQueryBuilder()
      .insert()
      .into(AnalyticsEvent)
      .values(events)
      .orIgnore()
      .execute();
      
    // result.identifiers might not match input length if duplicates were ignored
    const acceptedCount = result.identifiers?.length || 0;
    const rejectedCount = events.length - acceptedCount;

    this.logger.log(`Batch ingested ${acceptedCount} events, rejected ${rejectedCount} duplicates`);
    return { accepted: acceptedCount, rejected: rejectedCount };
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
   * Get top events by frequency
   */
  async getTopEvents(startDate: Date, endDate: Date, limit: number = 10): Promise<{ eventName: string; count: number }[]> {
    const result = await this.eventRepository
      .createQueryBuilder("event")
      .select("event.eventName", "eventName")
      .addSelect("COUNT(*)", "count")
      .where("event.createdAt BETWEEN :startDate AND :endDate", { startDate, endDate })
      .andWhere("event.eventName IS NOT NULL")
      .andWhere("event.optedOut = false")
      .groupBy("event.eventName")
      .orderBy("count", "DESC")
      .limit(limit)
      .getRawMany();

    return result.map((r) => ({
      eventName: r.eventName,
      count: parseInt(r.count, 10),
    }));
  }

  /**
   * Get basic retention cohorts (by day)
   */
  async getRetentionCohorts(startDate: Date, endDate: Date): Promise<any[]> {
    // This is a simplified retention query. In production with a huge DB, 
    // it's better to precalculate this or use specific analytics DB like ClickHouse.
    const query = `
      WITH user_first_seen AS (
        SELECT "userId", DATE("createdAt") AS first_day
        FROM "analytics_events"
        WHERE "userId" IS NOT NULL AND "optedOut" = false
        GROUP BY "userId"
      ),
      retention_data AS (
        SELECT 
          u.first_day AS cohort_day,
          DATE(e."createdAt") - u.first_day AS day_offset,
          COUNT(DISTINCT e."userId") AS active_users
        FROM user_first_seen u
        JOIN "analytics_events" e ON u."userId" = e."userId" 
        WHERE e."createdAt" BETWEEN $1 AND $2 
          AND e."optedOut" = false
        GROUP BY u.first_day, DATE(e."createdAt") - u.first_day
      )
      SELECT 
        cohort_day,
        day_offset,
        active_users
      FROM retention_data
      WHERE day_offset >= 0
      ORDER BY cohort_day ASC, day_offset ASC
    `;

    const result = await this.eventRepository.query(query, [startDate, endDate]);
    
    // Group by cohort_day
    const cohorts: Record<string, { size: number; retention: Record<number, number> }> = {};
    
    result.forEach((row: any) => {
      const cohortDay = new Date(row.cohort_day).toISOString().split('T')[0];
      const offset = parseInt(row.day_offset, 10);
      const count = parseInt(row.active_users, 10);
      
      if (!cohorts[cohortDay]) {
        cohorts[cohortDay] = { size: 0, retention: {} };
      }
      
      if (offset === 0) {
        cohorts[cohortDay].size = count;
      }
      
      cohorts[cohortDay].retention[offset] = count;
    });

    // Format output
    return Object.keys(cohorts).map((day) => {
      const cohort = cohorts[day];
      const retentionRates: Record<number, number> = {};
      
      Object.keys(cohort.retention).forEach((offsetStr) => {
        const offset = parseInt(offsetStr, 10);
        retentionRates[offset] = Math.round((cohort.retention[offset] / cohort.size) * 10000) / 100;
      });
      
      return {
        cohortDay: day,
        size: cohort.size,
        retentionRates,
      };
    });
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
