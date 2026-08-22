import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { FeatureFlag } from "../entities/feature-flag.entity";
import { FeatureFlagsService } from "../feature-flags.service";

describe("FeatureFlagsService", () => {
  let service: FeatureFlagsService;
  let repo: Record<string, jest.Mock>;

  const flag = (over: Partial<FeatureFlag> = {}): FeatureFlag =>
    ({
      id: "f1",
      key: "new_swap_ui",
      description: null,
      enabled: false,
      rolloutPercentage: 100,
      metadata: null,
      updatedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    }) as FeatureFlag;

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([flag()]),
      findOne: jest.fn().mockResolvedValue(flag()),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: x.id ?? "saved" })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: getRepositoryToken(FeatureFlag), useValue: repo },
      ],
    }).compile();

    service = module.get<FeatureFlagsService>(FeatureFlagsService);
  });

  it("lists flags and warms the cache", async () => {
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(await service.isEnabled("new_swap_ui")).toBe(false);
    // Second read served from cache — repo.find not called again.
    await service.get("new_swap_ui");
    expect(repo.find).toHaveBeenCalledTimes(1);
  });

  it("creates a flag when missing and propagates to listeners", async () => {
    repo.findOne.mockResolvedValue(null);
    const listener = jest.fn();
    service.onChange(listener);

    const created = await service.upsert(
      "dark_mode",
      { enabled: true, description: "Dark theme" },
      "admin-1",
    );

    expect(created.enabled).toBe(true);
    expect(created.updatedBy).toBe("admin-1");
    expect(repo.create).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBe("dark_mode");
    // Cache updated too.
    expect(await service.isEnabled("dark_mode")).toBe(true);
  });

  it("toggles an existing flag and invalidates the cached state", async () => {
    await service.list(); // warm cache with enabled=false
    const updated = await service.upsert(
      "new_swap_ui",
      { enabled: true },
      "admin-2",
    );
    expect(updated.enabled).toBe(true);
    expect(await service.isEnabled("new_swap_ui")).toBe(true);
  });

  it("unsubscribes listeners", async () => {
    const listener = jest.fn();
    const off = service.onChange(listener);
    off();
    await service.upsert("x", { enabled: true }, "a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("survives listener errors without breaking the write", async () => {
    service.onChange(() => {
      throw new Error("subscriber exploded");
    });
    const updated = await service.upsert("y", { enabled: true }, "a");
    expect(updated.enabled).toBe(true);
  });
});

describe("JobControlService (contract via AdminService delegation)", () => {
  it("rejects non-whitelisted job types at the service boundary", async () => {
    // Covered through JobControlService directly to avoid BullMQ deps here.
    const mod = await Test.createTestingModule({
      providers: [
        (await import("../job-control.service")).JobControlService,
        {
          provide: getRepositoryToken(
            (await import("src/workers/entities/job.entity")).JobEntity,
          ),
          useValue: {
            createQueryBuilder: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
      ],
    }).compile();

    const svc = mod.get(
      (await import("../job-control.service")).JobControlService,
    );
    await expect(svc.trigger("a", "rm-rf-everything", {})).rejects.toThrow(
      /non-triggerable/i,
    );
  });
});
