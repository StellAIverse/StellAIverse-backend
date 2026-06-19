import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreatePortfolioTransactionsTable1704067200000 implements MigrationInterface {
  name = "CreatePortfolioTransactionsTable1704067200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "portfolio_transactions",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "portfolioId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "userId",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "type",
            type: "enum",
            enum: ["buy", "sell", "transfer", "dividend", "stake", "unstake", "deposit", "withdrawal"],
            isNullable: false,
          },
          {
            name: "status",
            type: "enum",
            enum: ["pending", "completed", "failed", "cancelled", "archived"],
            default: "'completed'",
            isNullable: false,
          },
          {
            name: "ticker",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "name",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "quantity",
            type: "numeric",
            precision: 18,
            scale: 8,
            isNullable: false,
          },
          {
            name: "price",
            type: "numeric",
            precision: 18,
            scale: 8,
            isNullable: true,
          },
          {
            name: "totalValue",
            type: "numeric",
            precision: 18,
            scale: 2,
            isNullable: true,
          },
          {
            name: "fees",
            type: "numeric",
            precision: 18,
            scale: 8,
            default: "0",
            isNullable: false,
          },
          {
            name: "chain",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "gasFees",
            type: "numeric",
            precision: 18,
            scale: 8,
            isNullable: true,
          },
          {
            name: "transactionHash",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "walletAddress",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "exchange",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "notes",
            type: "text",
            isNullable: true,
          },
          {
            name: "metadata",
            type: "jsonb",
            isNullable: true,
          },
          {
            name: "costBasisPerUnit",
            type: "numeric",
            precision: 18,
            scale: 8,
            isNullable: true,
          },
          {
            name: "transactionDate",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "idempotencyKey",
            type: "varchar",
            isNullable: true,
            isUnique: true,
          },
          {
            name: "createdAt",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
          {
            name: "archivedAt",
            type: "timestamp",
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ["portfolioId"],
            referencedTableName: "portfolios",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
          {
            columnNames: ["userId"],
            referencedTableName: "users",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
        ],
      }),
      true,
    );

    // Create indices for fast queries
    await queryRunner.createIndex(
      "portfolio_transactions",
      new TableIndex({
        name: "IDX_portfolio_transactions_portfolio_created",
        columnNames: ["portfolioId", "createdAt"],
      }),
    );

    await queryRunner.createIndex(
      "portfolio_transactions",
      new TableIndex({
        name: "IDX_portfolio_transactions_portfolio_type",
        columnNames: ["portfolioId", "type"],
      }),
    );

    await queryRunner.createIndex(
      "portfolio_transactions",
      new TableIndex({
        name: "IDX_portfolio_transactions_ticker",
        columnNames: ["portfolioId", "ticker"],
      }),
    );

    await queryRunner.createIndex(
      "portfolio_transactions",
      new TableIndex({
        name: "IDX_portfolio_transactions_user_created",
        columnNames: ["userId", "createdAt"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("portfolio_transactions", true);
  }
}
