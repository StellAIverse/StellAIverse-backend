import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Flat denormalized table that mirrors searchable content from all resources.
 *
 * The `tsv` column holds a pre-computed PostgreSQL tsvector so that search
 * queries are a simple index scan instead of an on-the-fly conversion.
 *
 * A GIN index is created on `tsv` via a raw migration / synchronize, making
 * full-text search fast even with millions of rows.
 */
@Entity("search_index")
@Index("IDX_SEARCH_RESOURCE", ["resourceType", "resourceId"], { unique: true })
export class SearchIndex {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  /**
   * Discriminator for the source table (user | message | conversation).
   */
  @Column({ type: "varchar", length: 32 })
  @Index("IDX_SEARCH_RESOURCE_TYPE")
  resourceType: "user" | "message" | "conversation";

  /**
   * PK of the originating row in its own table.
   */
  @Column({ type: "uuid" })
  resourceId: string;

  /**
   * Concatenated plain text used for pg full-text search.
   * Stored explicitly so we can rebuild tsv without re-reading source tables.
   */
  @Column({ type: "text" })
  plainText: string;

  /**
   * Serialized tsvector kept in sync by a trigger *or* by the indexer service.
   * Stored as text because TypeORM does not natively map `tsvector`.
   * We cast it at query time: `to_tsvector('english', plain_text)`.
   */
  @Column({ type: "text", nullable: true })
  tsv: string | null;

  /**
   * Arbitrary JSON bag – title, username, avatarUrl, etc.
   * Returned alongside the search hit for rendering without a secondary query.
   */
  @Column({ type: "jsonb", default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
