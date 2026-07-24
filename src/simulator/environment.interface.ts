export enum EnvironmentStatus {
  INITIALIZING = "initializing",
  READY = "ready",
  RUNNING = "running",
  PAUSED = "paused",
  COMPLETED = "completed",
  ERROR = "error",
  TEARING_DOWN = "tearing_down",
  DESTROYED = "destroyed",
}

export interface EnvironmentMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  tags?: string[];
}

export interface EnvironmentLoadOptions {
  path?: string;
  hotReload?: boolean;
  remoteUrl?: string;
  authToken?: string;
  watchPatterns?: string[];
}

export interface EnvironmentInitConfig {
  [key: string]: unknown;
}

export interface EnvironmentRunConfig {
  steps?: number;
  timeoutMs?: number;
  [key: string]: unknown;
}

export interface EnvironmentInitResult {
  success: boolean;
  state?: unknown;
  error?: string;
}

export interface EnvironmentRunResult {
  success: boolean;
  steps: number;
  finalState?: unknown;
  error?: string;
}

export interface EnvironmentTeardownResult {
  success: boolean;
  error?: string;
}

export interface EnvironmentInstanceState {
  status: EnvironmentStatus;
  config?: EnvironmentInitConfig;
  state?: unknown;
  currentStep?: number;
  metadata?: EnvironmentMetadata;
}

export interface AuditLogEntry {
  instanceId: string;
  environmentId: string;
  version: string;
  action: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  actor: string;
  timestamp?: Date;
}

export interface LoadedEnvironment {
  path: string;
  factory: EnvironmentFactory;
  metadata: EnvironmentMetadata;
  loadedAt: Date;
  hash: string;
  hotReloadEnabled: boolean;
}

export type EnvironmentFactory = () => ISimulationEnvironment;

export interface ISimulationEnvironment {
  getMetadata(): EnvironmentMetadata;
  init(config: EnvironmentInitConfig): Promise<EnvironmentInitResult>;
  run(config: EnvironmentRunConfig): Promise<EnvironmentRunResult>;
  teardown(): Promise<EnvironmentTeardownResult>;
}
