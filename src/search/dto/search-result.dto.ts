import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class SearchHitDto {
  @ApiProperty({ description: "Unique resource identifier" })
  id: string;

  @ApiProperty({
    description: "Resource type",
    enum: ["user", "message", "conversation"],
  })
  type: "user" | "message" | "conversation";

  @ApiProperty({ description: "Primary display text for the result" })
  title: string;

  @ApiPropertyOptional({
    description:
      "Short highlighted snippet showing where the query matched. Tags <em> and </em> wrap the matching term.",
  })
  snippet?: string;

  @ApiProperty({ description: "Full-text relevance score" })
  score: number;

  @ApiProperty({ description: "Original resource data" })
  data: Record<string, unknown>;

  @ApiProperty({ description: "When the resource was last modified" })
  updatedAt: Date;
}

export class PaginatedSearchResultDto {
  @ApiProperty({ type: [SearchHitDto] })
  data: SearchHitDto[];

  @ApiProperty({ description: "Total number of matching records" })
  total: number;

  @ApiProperty({ description: "Current page number" })
  page: number;

  @ApiProperty({ description: "Records per page" })
  limit: number;

  @ApiProperty({ description: "Total pages" })
  totalPages: number;

  @ApiProperty({ description: "Query that produced this result" })
  query: string;

  @ApiProperty({ description: "Resource type filter applied" })
  resourceType: string;
}
