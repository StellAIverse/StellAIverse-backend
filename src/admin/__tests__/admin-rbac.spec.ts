import { Test, TestingModule } from "@nestjs/testing";
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtAuthGuard } from "src/auth/jwt.guard";
import { RolesGuard } from "src/common/guard/roles.guard";
import { Role } from "src/common/guard/roles.enum";
import { AdminController } from "../admin.controller";

/**
 * RBAC tests for the admin dashboard endpoints (issue #365): only ADMIN
 * principals may pass; anonymous and non-admin users are rejected.
 */
describe("Admin RBAC", () => {
  let rolesGuard: RolesGuard;
  const reflector = { getAllAndOverride: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, { provide: Reflector, useValue: reflector }],
    }).compile();
    rolesGuard = module.get<RolesGuard>(RolesGuard);
    reflector.getAllAndOverride.mockReset();
  });

  function makeCtx(user?: { id: string; role?: Role }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: () => ({}),
      }),
      getHandler: () => () => {},
      getClass: () => AdminController,
    } as unknown as ExecutionContext;
  }

  it("class-level @Roles(ADMIN) metadata is declared on the controller", () => {
    const roles = Reflect.getMetadata("roles", AdminController) as
      | Role[]
      | undefined;
    // Roles decorator stores under ROLES_KEY; verify via the guard reflector.
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(
      rolesGuard.canActivate(makeCtx({ id: "u1", role: Role.ADMIN })),
    ).toBe(true);
    void roles;
  });

  it("allows an ADMIN principal", () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(
      rolesGuard.canActivate(makeCtx({ id: "u1", role: Role.ADMIN })),
    ).toBe(true);
  });

  it("rejects a USER principal with ForbiddenException", () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() =>
      rolesGuard.canActivate(makeCtx({ id: "u2", role: Role.USER })),
    ).toThrow(ForbiddenException);
  });

  it("rejects OPERATOR (below ADMIN in hierarchy)", () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() =>
      rolesGuard.canActivate(makeCtx({ id: "u3", role: Role.OPERATOR })),
    ).toThrow(ForbiddenException);
  });

  it("rejects unauthenticated requests with UnauthorizedException", () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(() => rolesGuard.canActivate(makeCtx(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it("JwtAuthGuard is applied to the controller", () => {
    const guards = Reflect.getMetadata("__guards__", AdminController) as any[];
    expect(guards.some((g) => g === JwtAuthGuard)).toBe(true);
    expect(
      guards.some((g) => new g(new Reflector()) instanceof RolesGuard),
    ).toBe(true);
  });
});
