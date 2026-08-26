import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, Repository } from "typeorm";
import { User, UserRole } from "src/user/entities/user.entity";
import { JobEntity } from "src/workers/entities/job.entity";
import { FeatureFlag } from "./entities/feature-flag.entity";
import { FeatureFlagsService } from "./feature-flags.service";
import { JobControlService } from "./job-control.service";

export interface UserSummary {
  id: string;
  username: string | null;
  walletAddress: string;
  email: string | null;
  role: UserRole;
  kycStatus: string;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface SystemMetrics {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  newUsersLast7d: number;
  byRole: Record<string, number>;
  jobs: { pending: number; active: number; failed: number; completed: number };
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(JobEntity)
    private readonly jobRepo: Repository<JobEntity>,
    private readonly featureFlags: FeatureFlagsService,
    private readonly jobControl: JobControlService,
  ) {}

  // ─── User administration ───────────────────────────────────────────

  async listUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    role?: UserRole;
    isActive?: boolean;
  }): Promise<{
    data: UserSummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));

    const qb = this.userRepo.createQueryBuilder("user");
    if (params.search) {
      const term = `%${params.search.toLowerCase()}%`;
      qb.where(
        new Brackets((w) => {
          w.where("LOWER(user.username) LIKE :term", { term })
            .orWhere("LOWER(user.email) LIKE :term", { term })
            .orWhere("LOWER(user.walletAddress) LIKE :term", { term });
        }),
      );
    }
    if (params.role) qb.andWhere("user.role = :role", { role: params.role });
    if (params.isActive !== undefined)
      qb.andWhere("user.isActive = :isActive", { isActive: params.isActive });

    qb.orderBy("user.createdAt", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    const [users, total] = await qb.getManyAndCount();
    return {
      data: users.map((u) => this.toSummary(u)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async setUserRole(
    actorId: string,
    userId: string,
    role: UserRole,
  ): Promise<UserSummary> {
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException(`Unknown role: ${role}`);
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const previousRole = user.role;
    user.role = role;
    const saved = await this.userRepo.save(user);
    this.logger.log(
      `Admin ${actorId} changed role of ${userId}: ${previousRole} -> ${role}`,
    );
    return this.toSummary(saved);
  }

  async setUserActive(
    actorId: string,
    userId: string,
    isActive: boolean,
  ): Promise<UserSummary> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    user.isActive = isActive;
    const saved = await this.userRepo.save(user);
    this.logger.log(
      `Admin ${actorId} ${isActive ? "enabled" : "disabled"} account ${userId}`,
    );
    return this.toSummary(saved);
  }

  async getUser(userId: string): Promise<UserSummary> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return this.toSummary(user);
  }

  // ─── Metrics ───────────────────────────────────────────────────────

  async getSystemMetrics(): Promise<SystemMetrics> {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    const [totalUsers, activeUsers, disabledUsers, newUsersLast7d] =
      await Promise.all([
        this.userRepo.count(),
        this.userRepo.count({ where: { isActive: true } }),
        this.userRepo.count({ where: { isActive: false } }),
        this.userRepo
          .createQueryBuilder("user")
          .where("user.createdAt >= :weekAgo", { weekAgo })
          .getCount(),
      ]);

    const roleRows = await this.userRepo
      .createQueryBuilder("user")
      .select("user.role", "role")
      .addSelect("COUNT(*)", "count")
      .groupBy("user.role")
      .getRawMany<{ role: string; count: string }>();

    const byRole: Record<string, number> = {};
    for (const row of roleRows) byRole[row.role] = Number(row.count);

    const jobRows = await this.jobRepo
      .createQueryBuilder("job")
      .select("job.status", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("job.status")
      .getRawMany<{ status: string; count: string }>();

    const jobs = { pending: 0, active: 0, failed: 0, completed: 0 };
    for (const row of jobRows) {
      if (row.status in jobs)
        jobs[row.status as keyof typeof jobs] = Number(row.count);
    }

    return {
      totalUsers,
      activeUsers,
      disabledUsers,
      newUsersLast7d,
      byRole,
      jobs,
    };
  }

  // ─── Feature flag delegation ───────────────────────────────────────

  listFlags(): Promise<FeatureFlag[]> {
    return this.featureFlags.list();
  }

  async setFlag(
    actorId: string,
    key: string,
    patch: {
      enabled?: boolean;
      description?: string;
      rolloutPercentage?: number;
    },
  ): Promise<FeatureFlag> {
    const flag = await this.featureFlags.upsert(key, patch, actorId);
    this.logger.log(
      `Admin ${actorId} updated feature flag "${key}": enabled=${flag.enabled}, rollout=${flag.rolloutPercentage}`,
    );
    return flag;
  }

  isFlagEnabled(key: string): Promise<boolean> {
    return this.featureFlags.isEnabled(key);
  }

  // ─── Job control delegation ────────────────────────────────────────

  listJobs(params: {
    page?: number;
    limit?: number;
    status?: string;
    jobType?: string;
  }) {
    return this.jobControl.list(params);
  }

  getJob(jobId: string) {
    return this.jobControl.get(jobId);
  }

  triggerJob(actorId: string, jobType: string, payload: Record<string, any>) {
    return this.jobControl.trigger(actorId, jobType, payload);
  }

  private toSummary(u: User): UserSummary {
    return {
      id: u.id,
      username: u.username,
      walletAddress: u.walletAddress,
      email: u.email,
      role: u.role,
      kycStatus: u.kycStatus,
      isActive: u.isActive,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    };
  }
}
