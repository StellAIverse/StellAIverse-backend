# Search API

The search module provides PostgreSQL full-text search over denormalized
documents for users, messages, and conversations. Each document keeps its
display metadata beside the searchable text, so result rendering does not
require a second query to the source table.

## Indexing

Use `POST /search/index` from an indexing worker whenever a searchable record
is created or updated:

```json
{
  "resourceType": "message",
  "resourceId": "3b1f...",
  "plainText": "The portfolio rebalance completed",
  "metadata": { "title": "Portfolio update", "conversationId": "..." }
}
```

The `(resourceType, resourceId)` pair is unique, so retries update the same
document. Deletion workers can call `DELETE /search/:resourceType/:resourceId`.
Index-management routes require an operator or administrator role.

## Querying

`GET /search?q=portfolio&type=message&page=1&limit=20` supports web-style
English full-text queries, resource filtering, relevance ordering, pagination,
and highlighted snippets. `GET /search/facets` returns the matching total and
counts by resource type for filter UIs.

PostgreSQL's `websearch_to_tsquery` handles quoted phrases and boolean terms;
the `ILIKE` fallback keeps short or unusual terms searchable when the full-text
parser produces no match. The index service is isolated behind `SearchService`
so an Elasticsearch adapter can be added later without changing API clients.
