import { Test, TestingModule } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { QuotaGuard } from "./quota.guard";
import { HttpException } from "@nestjs/common";
import { RateLimiterService } from "src/quota/rate-limiter.service";

describe("QuotaGuard", () => {
  let guard: QuotaGuard;
  let reflector: Reflector;
  let rateLimiterService: RateLimiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaGuard,
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
        {
          provide: RateLimiterService,
          useValue: {
            checkQuota: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<QuotaGuard>(QuotaGuard);
    reflector = module.get<Reflector>(Reflector);
    rateLimiterService = module.get<RateLimiterService>(RateLimiterService);
  });

  it("should be defined", () => {
    expect(guard).toBeDefined();
  });

  it("should allow request if no @RateLimit decorator is present", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(null);
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn(),
      }),
    } as any;

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it("should throw HttpException if rate limit is exceeded", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      level: "free",
    });
    (rateLimiterService.checkQuota as jest.Mock).mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetMs: 60000,
    });

    const mockResponse = {
      header: jest.fn(),
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ ip: "127.0.0.1", headers: {} }),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    expect(mockResponse.header).toHaveBeenCalledWith(
      "X-RateLimit-Limit",
      expect.any(Number),
    );
    expect(mockResponse.header).toHaveBeenCalledWith("Retry-After", 60);
  });

  it("should allow request and set headers if within limit", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      level: "free",
    });
    (rateLimiterService.checkQuota as jest.Mock).mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 5,
      resetMs: 60000,
    });

    const mockResponse = {
      header: jest.fn(),
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ ip: "127.0.0.1", headers: {} }),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as any;

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockResponse.header).toHaveBeenCalledWith(
      "X-RateLimit-Remaining",
      5,
    );
  });

  it("hashes API keys before using them as Redis identifiers", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      limit: 10,
      windowMs: 60_000,
    });
    (rateLimiterService.checkQuota as jest.Mock).mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetMs: 6_000,
    });
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          headers: { "x-api-key": "secret-api-key" },
        }),
        getResponse: jest.fn().mockReturnValue({ header: jest.fn() }),
      }),
    } as any;

    await guard.canActivate(context);

    expect(rateLimiterService.checkQuota).toHaveBeenCalledWith(
      expect.stringMatching(/^api-key:[a-f0-9]{64}$/),
      10,
      60_000,
      expect.any(Number),
      "token-bucket",
    );
    expect(rateLimiterService.checkQuota).not.toHaveBeenCalledWith(
      expect.stringContaining("secret-api-key"),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});
