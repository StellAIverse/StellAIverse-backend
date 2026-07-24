export type PluginStatus =
  | "pending"
  | "approved"
  | "active"
  | "inactive"
  | "rejected";

export interface IPlugin {
  id: string;
  name: string;
  version: string;
  execute(payload: unknown): Promise<unknown>;
}
