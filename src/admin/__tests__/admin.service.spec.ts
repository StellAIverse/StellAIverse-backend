import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AdminService } from "../admin.service";
import { FeatureFlagsService } from "../feature-flags.service";
import { JobControlService } from "../job-control.service";
import { User, UserRole } from "src/user/entities/user.entity";
import { JobEntity } from "src/workers/entities/job.entity";
import { FeatureFlag } from "../entities/feature-flag.entity";

const makeUser = (over: Partial<User> = {}): User =>
  ({
    id: "u1",
    username: "alice",
    walletAddress: "0xabc",
    email: "a@x.io",
    role: UserRole.USER,
    kycStatus: "unverified",
    isActive: true,
    createdAt: new Date("2026-01-01"),
    lastLoginAt: null,
    ...over,
  }) as unknown as User;

describe("AdminService", () => {
  let service: AdminService;
  let userRepo: Record<string, jest.Mock>;
  let jobRepo: Record<string, jest.Mock>;
  let flags: { list: jest.Mock; upsert: jest.Mock; isEnabled: jest.Mock };
  let jobs: { list: jest.Mock; get: jest.Mock; trigger: jest.Mock };

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (u) => u),
      createQueryBuilder: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    };
    jobRepo = { createQueryBuilder: jest.fn() };
    flags = {
      list: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(
        async (_k, patch, actor) =>
          ({
            key: _k,
            enabled: !!patch.enabled,
            updatedBy: actor,
          }) as FeatureFlag,
      ),
      isEnabled: jest.fn().mockResolvedValue(false),
    };
    jobs = {
      list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      get: jest.fn(),
      trigger: jest
        .fn()
        .mockResolvedValue({ id: "j1", jobType: "reindex", status: "pending" }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(JobEntity), useValue: jobRepo },
        { provide: FeatureFlagsService, useValue: flags },
        { provide: JobControlService, useValue: jobs },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  describe("user management", () => {
    it("lists users with pagination metadata", async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[makeUser()], 1]),
      };
      userRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.listUsers({ page: 1, limit: 25 });
      expect(res.total).toBe(1);
      expect(res.data[0].id).toBe("u1");
      expect(res.data[0].role).toBe(UserRole.USER);
      expect(qb.take).toHaveBeenCalledWith(25);
    });

    it("changes a user's role", async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      const res = await service.setUserRole("admin-1", "u1", UserRole.ADMIN);
      expect(res.role).toBe(UserRole.ADMIN);
      expect(userRepo.save).toHaveBeenCalled();
    });

    it("rejects unknown roles", async () => {
      await expect(
        service.setUserRole("admin-1", "u1", "superadmin" as UserRole),
      ).rejects.toThrow(BadRequestException);
    });

    it("404s on missing user for role/status/get", async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.setUserRole("a", "nope", UserRole.USER),
      ).rejects.toThrow(NotFoundException);
      await expect(service.setUserActive("a", "nope", false)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getUser("nope")).rejects.toThrow(NotFoundException);
    });

    it("disables and re-enables an account", async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      expect((await service.setUserActive("a", "u1", false)).isActive).toBe(
        false,
      );
      expect((await service.setUserActive("a", "u1", true)).isActive).toBe(
        true,
      );
    });
  });

  describe("system metrics", () => {
    it("aggregates user + job counters", async () => {
      userRepo.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(90)
        .mockResolvedValueOnce(10);

      const mkQb = (rows: any[]) => ({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(rows),
        getCount: jest.fn().mockResolvedValue(7),
      });

      let call = 0;
      userRepo.createQueryBuilder.mockImplementation(() => {
        // First QB = new-users-last-7d (getCount), second = byRole rows.
        return ++call === 1 ? mkQb([]) : mkQb([{ role: "user", count: "100" }]);
      });
      jobRepo.createQueryBuilder.mockReturnValue(
        mkQb([
          { status: "pending", count: "3" },
          { status: "failed", count: "1" },
          { status: "bogus", count: "9" },
        ]),
      );

      const m = await service.getSystemMetrics();
      expect(m.totalUsers).toBe(100);
      expect(m.activeUsers).toBe(90);
      expect(m.disabledUsers).toBe(10);
      expect(m.newUsersLast7d).toBe(7);
      expect(m.byRole.user).toBe(100);
      expect(m.jobs.pending).toBe(3);
      expect(m.jobs.failed).toBe(1);
      expect((m.jobs as any).bogus).toBeUndefined();
    });
  });

  describe("delegation", () => {
    it("forwards flag writes with the acting admin", async () => {
      const out = await service.setFlag("admin-9", "new_swap_ui", {
        enabled: true,
      });
      expect(flags.upsert).toHaveBeenCalledWith(
        "new_swap_ui",
        { enabled: true },
        "admin-9",
      );
      expect(out.enabled).toBe(true);
    });

    it("forwards job triggers", async () => {
      const out = await service.triggerJob("admin-9", "reindex", {
        index: "trades",
      });
      expect(jobs.trigger).toHaveBeenCalledWith("admin-9", "reindex", {
        index: "trades",
      });
      expect(out.status).toBe("pending");
    });
  });
});
