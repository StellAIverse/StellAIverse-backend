import { Repository } from "typeorm";
import { SearchService } from "./search.service";
import { SearchIndex } from "./entities/search-index.entity";
import { SearchResourceType } from "./dto/search-query.dto";

describe("SearchService", () => {
  let service: SearchService;
  let repository: jest.Mocked<Repository<SearchIndex>>;

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value as SearchIndex),
      save: jest.fn(async (value) => value as SearchIndex),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<SearchIndex>>;
    service = new SearchService(repository);
  });

  it("upserts a searchable document without creating duplicates", async () => {
    repository.findOne.mockResolvedValue({
      id: "index-1",
      metadata: { old: true },
    } as unknown as SearchIndex);
    const result = await service.upsert({
      resourceType: "user",
      resourceId: "user-1",
      plainText: "Alice blockchain",
      metadata: { title: "Alice" },
    });
    expect(result).toMatchObject({
      id: "index-1",
      resourceId: "user-1",
      tsv: null,
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it("builds full-text, resource, relevance, and pagination constraints", async () => {
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
    };
    repository.createQueryBuilder.mockReturnValue(builder as never);

    const result = await service.search({
      q: "alice",
      type: SearchResourceType.USER,
      page: 2,
      limit: 10,
    });
    expect(builder.andWhere).toHaveBeenCalledWith(
      "search.resourceType = :resourceType",
      { resourceType: "user" },
    );
    expect(builder.skip).toHaveBeenCalledWith(10);
    expect(builder.take).toHaveBeenCalledWith(10);
    expect(result).toMatchObject({
      total: 0,
      page: 2,
      totalPages: 0,
      resourceType: "user",
    });
  });

  it("returns normalized result hits and facet counts", async () => {
    const rows = [
      {
        resourceId: "user-1",
        resourceType: "user",
        plainText: "Alice",
        metadata: { title: "Alice" },
        updatedAt: new Date(),
      },
      {
        resourceId: "message-1",
        resourceType: "message",
        plainText: "Hello",
        metadata: {},
        updatedAt: new Date(),
      },
    ] as SearchIndex[];
    const builder = {
      where: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({
        entities: rows,
        raw: [
          { score: "0.9", snippet: "<em>Alice</em>", total: "2" },
          { score: "0.7", snippet: "Hello", total: "2" },
        ],
      }),
    };
    repository.createQueryBuilder.mockReturnValue(builder as never);
    await expect(service.facets({ q: "hello", limit: 20 })).resolves.toEqual({
      query: "hello",
      total: 2,
      resourceTypes: { user: 1, message: 1 },
    });
  });
});
