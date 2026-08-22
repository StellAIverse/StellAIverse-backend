import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FeatureFlag } from "./entities/feature-flag.entity";

export type FlagListener = (key: string, flag: FeatureFlag) => void;

/**
 * Database-backed feature flags with an in-process cache and a listener
 * registry so other services can react to changes immediately
 * (issue #365: "changes should be propagated to services or cached").
 */
@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly cache = new Map<string, FeatureFlag>();
  private cacheLoaded = false;
  private readonly listeners = new Set<FlagListener>();

  constructor(
    @InjectRepository(FeatureFlag)
    private readonly flagRepo: Repository<FeatureFlag>,
  ) {}

  /** Subscribe to flag updates; returns an unsubscribe function. */
  onChange(listener: FlagListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async list(): Promise<FeatureFlag[]> {
    const flags = await this.flagRepo.find({ order: { key: "ASC" } });
    for (const flag of flags) this.cache.set(flag.key, flag);
    this.cacheLoaded = true;
    return flags;
  }

  /**
   * Cached read — safe on the hot path. The first call loads all flags from
   * the database; subsequent reads hit memory until a write invalidates.
   */
  async get(key: string): Promise<FeatureFlag | null> {
    if (!this.cacheLoaded) await this.list();
    return this.cache.get(key) ?? null;
  }

  async isEnabled(key: string): Promise<boolean> {
    const flag = await this.get(key);
    return !!flag && flag.enabled;
  }

  async upsert(
    key: string,
    patch: {
      enabled?: boolean;
      description?: string;
      rolloutPercentage?: number;
    },
    actorId: string,
  ): Promise<FeatureFlag> {
    if (
      patch.rolloutPercentage !== undefined &&
      (patch.rolloutPercentage < 0 || patch.rolloutPercentage > 100)
    ) {
      throw new Error("rolloutPercentage must be between 0 and 100");
    }

    let flag = await this.flagRepo.findOne({ where: { key } });
    if (!flag) {
      flag = this.flagRepo.create({
        key,
        enabled: patch.enabled ?? false,
        description: patch.description ?? null,
        rolloutPercentage: patch.rolloutPercentage ?? 100,
        metadata: null,
        updatedBy: actorId,
      });
    } else {
      if (patch.enabled !== undefined) flag.enabled = patch.enabled;
      if (patch.description !== undefined) flag.description = patch.description;
      if (patch.rolloutPercentage !== undefined)
        flag.rolloutPercentage = patch.rolloutPercentage;
      flag.updatedBy = actorId;
    }

    const saved = await this.flagRepo.save(flag);
    // Propagate: refresh cache and notify in-process subscribers.
    this.cache.set(saved.key, saved);
    this.cacheLoaded = true;
    for (const listener of this.listeners) {
      try {
        listener(saved.key, saved);
      } catch (err) {
        this.logger.warn(
          `feature flag listener failed for ${saved.key}: ${err}`,
        );
      }
    }
    return saved;
  }
}
