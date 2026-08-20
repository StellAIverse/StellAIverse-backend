import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SearchController } from "./search.controller";
import { SearchIndex } from "./entities/search-index.entity";
import { SearchService } from "./search.service";

@Module({
  imports: [TypeOrmModule.forFeature([SearchIndex])],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
