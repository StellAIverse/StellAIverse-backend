import { Injectable } from "@nestjs/common";
import {
  LoadedEnvironment,
  EnvironmentInstanceState,
  EnvironmentStatus,
  AuditLogEntry,
  ISimulationEnvironment,
} from "./environment.interface";

interface EnvironmentInstance {
  instanceId: string;
  environment: ISimulationEnvironment;
  state: EnvironmentInstanceState;
}

@Injectable()
export class EnvironmentRegistryService {
  private environments = new Map<string, LoadedEnvironment>();
  private instances = new Map<string, EnvironmentInstance>();
  private auditLog: AuditLogEntry[] = [];

  registerEnvironment(env: LoadedEnvironment): void {
    const key = `${env.metadata.id}@${env.metadata.version}`;
    this.environments.set(key, env);
  }

  unregisterEnvironment(id: string, version: string): boolean {
    return this.environments.delete(`${id}@${version}`);
  }

  getEnvironment(id: string, version: string): LoadedEnvironment | undefined {
    return this.environments.get(`${id}@${version}`);
  }

  getAllEnvironments(): LoadedEnvironment[] {
    return Array.from(this.environments.values());
  }

  async createInstance(
    environmentId: string,
    version: string,
  ): Promise<{ instanceId: string; environment: ISimulationEnvironment }> {
    const env = this.getEnvironment(environmentId, version);
    if (!env) throw new Error(`Environment ${environmentId}@${version} not found`);

    const instanceId = `${environmentId}-${Date.now()}`;
    const environment = env.factory();

    this.instances.set(instanceId, {
      instanceId,
      environment,
      state: {
        status: EnvironmentStatus.INITIALIZING,
        metadata: env.metadata,
      },
    });

    return { instanceId, environment };
  }

  getInstance(instanceId: string): EnvironmentInstance | undefined {
    return this.instances.get(instanceId);
  }

  getInstancesForEnvironment(
    id: string,
    version: string,
  ): Array<{ instanceId: string }> {
    return Array.from(this.instances.values())
      .filter(
        (i) =>
          i.state.metadata?.id === id && i.state.metadata?.version === version,
      )
      .map((i) => ({ instanceId: i.instanceId }));
  }

  updateInstanceState(
    instanceId: string,
    updates: Partial<EnvironmentInstanceState>,
  ): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      instance.state = { ...instance.state, ...updates };
    }
  }

  removeInstance(instanceId: string): void {
    this.instances.delete(instanceId);
  }

  addAuditEntry(entry: Omit<AuditLogEntry, "timestamp">): void {
    this.auditLog.push({ ...entry, timestamp: new Date() });
  }

  getAuditLog(
    filter?: { instanceId?: string; environmentId?: string },
  ): AuditLogEntry[] {
    if (!filter) return [...this.auditLog];
    return this.auditLog.filter(
      (e) =>
        (!filter.instanceId || e.instanceId === filter.instanceId) &&
        (!filter.environmentId || e.environmentId === filter.environmentId),
    );
  }
}
