import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequireRole } from "../common/decorators/roles.decorator";
import { Role } from "../common/guard/roles.enum";
import { SearchQueryDto } from "./dto/search-query.dto";
import { SearchService } from "./search.service";

@ApiTags("search")
@ApiBearerAuth()
@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary: "Search indexed users, messages, and conversations",
  })
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }

  @Get("facets")
  @ApiOperation({ summary: "Return result counts by resource type" })
  facets(@Query() query: SearchQueryDto) {
    return this.searchService.facets(query);
  }

  @Post("index")
  @RequireRole(Role.OPERATOR)
  @ApiOperation({ summary: "Upsert a document in the search index" })
  index(
    @Body()
    document: {
      resourceType: "user" | "message" | "conversation";
      resourceId: string;
      plainText: string;
      metadata: Record<string, unknown>;
    },
  ) {
    return this.searchService.upsert(document);
  }

  @Delete(":resourceType/:resourceId")
  @RequireRole(Role.OPERATOR)
  @ApiOperation({ summary: "Remove a document from the search index" })
  remove(
    @Param("resourceType") resourceType: "user" | "message" | "conversation",
    @Param("resourceId") resourceId: string,
  ) {
    return this.searchService.remove(resourceType, resourceId);
  }
}
