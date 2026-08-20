import { MigrationInterface, QueryRunner } from "typeorm";

export class AnalyticsModuleUpdates1724076000000 implements MigrationInterface {
    name = 'AnalyticsModuleUpdates1724076000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add idempotencyKey column
        await queryRunner.query(`ALTER TABLE "analytics_events" ADD "idempotencyKey" character varying(255)`);
        
        // Add unique index for deduplication
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_analytics_events_idempotencyKey" ON "analytics_events" ("idempotencyKey")`);
        
        // Add BRIN index for time-series optimization on createdAt (great for analytics)
        // Note: IF NOT EXISTS is not standard for CREATE INDEX in all Postgres versions, but we'll create the BRIN index specifically.
        await queryRunner.query(`CREATE INDEX "IDX_analytics_events_createdAt_brin" ON "analytics_events" USING BRIN ("createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_events_createdAt_brin"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_analytics_events_idempotencyKey"`);
        await queryRunner.query(`ALTER TABLE "analytics_events" DROP COLUMN "idempotencyKey"`);
    }
}
