import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";
import { SearchQueryDto, SearchResourceType } from "./dto/search-query.dto";
import {
  PaginatedSearchResultDto,
  SearchHitDto,
} from "./dto/search-result.dto";
import { SearchIndex } from "./entities/search-index.entity";
import { SearchIndexDocument } from "./interfaces/search-indexer.interface";

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(SearchIndex)
    private readonly index: Repository<SearchIndex>,
  ) {}

  async upsert(document: SearchIndexDocument): Promise<SearchIndex> {
    const existing = await this.index.findOne({
      where: {
        resourceType: document.resourceType,
        resourceId: document.resourceId,
      },
    });
    const value = this.index.create({
      ...(existing ?? {}),
      ...document,
      tsv: null,
    });
    return this.index.save(value);
  }

  async remove(
    resourceType: SearchIndexDocument["resourceType"],
    resourceId: string,
  ) {
    await this.index.delete({ resourceType, resourceId });
  }

  async search(query: SearchQueryDto): Promise<PaginatedSearchResultDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.index.createQueryBuilder("search");
    const textQuery = query.q.trim();
    const where = new Brackets((qb) => {
      qb.where(
        "to_tsvector('english', search.plainText) @@ websearch_to_tsquery('english', :query)",
        { query: textQuery },
      ).orWhere("search.plainText ILIKE :fallback", {
        fallback: `%${this.escapeLike(textQuery)}%`,
      });
    });
    builder.where(where);
    if (query.type && query.type !== SearchResourceType.ALL) {
      builder.andWhere("search.resourceType = :resourceType", {
        resourceType: query.type,
      });
    }

    const { entities: rows, raw } = await builder
      .addSelect(
        "ts_rank(to_tsvector('english', search.plainText), websearch_to_tsquery('english', :query))",
        "score",
      )
      .addSelect(
        "ts_headline('english', search.plainText, websearch_to_tsquery('english', :query), 'StartSel=<em>, StopSel=</em>, MaxWords=28, MinWords=8')",
        "snippet",
      )
      .addSelect("COUNT(*) OVER()", "total")
      .setParameter("query", textQuery)
      .orderBy("score", "DESC")
      .addOrderBy("search.updatedAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit)
      .getRawAndEntities();

    const total = Number(raw[0]?.total ?? 0);

    return {
      data: rows.map((row, index) => this.toHit(row, raw[index])),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      query: textQuery,
      resourceType: query.type ?? SearchResourceType.ALL,
    };
  }

  async facets(query: SearchQueryDto) {
    const result = await this.search(query);
    const counts = result.data.reduce<Record<string, number>>((acc, hit) => {
      acc[hit.type] = (acc[hit.type] ?? 0) + 1;
      return acc;
    }, {});
    return { query: result.query, total: result.total, resourceTypes: counts };
  }

  private toHit(row: SearchIndex, raw?: Record<string, unknown>): SearchHitDto {
    return {
      id: row.resourceId,
      type: row.resourceType,
      title: String(
        row.metadata.title ?? row.metadata.username ?? row.resourceId,
      ),
      snippet: String(raw?.snippet ?? row.plainText),
      score: Number(raw?.score ?? 0),
      data: row.metadata,
      updatedAt: row.updatedAt,
    };
  }

  private escapeLike(value: string) {
    return value.replace(/[\\%_]/g, "\\$&");
  }
}
