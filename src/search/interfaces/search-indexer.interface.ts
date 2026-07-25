/**
 * Represents one document in the search index table.
 */
export interface SearchIndexDocument {
  resourceType: "user" | "message" | "conversation";
  resourceId: string;
  /** Plain text that will be stored for snippet generation */
  plainText: string;
  /** Extra metadata stored as JSON (title, sender, etc.) */
  metadata: Record<string, unknown>;
}
