import "reflect-metadata";
import { Role } from "../common/guard/roles.enum";
import { ROLES_KEY } from "../common/guard/roles.decorator";
import { RateLimitAdminController } from "./rate-limit-admin.controller";

describe("RateLimitAdminController", () => {
  it("requires the admin role", () => {
    expect(Reflect.getMetadata(ROLES_KEY, RateLimitAdminController)).toEqual([
      Role.ADMIN,
    ]);
  });

  it("delegates policy and list changes to the service", async () => {
    const service = {
      setPolicy: jest.fn().mockResolvedValue({ identifier: "user:42" }),
      setListMembership: jest.fn().mockResolvedValue({ identifier: "user:42" }),
    } as any;
    const controller = new RateLimitAdminController(service);

    await controller.setPolicy("user:42", {
      limit: 20,
      windowMs: 60_000,
      burst: 5,
    });
    await controller.blacklist("user:42");

    expect(service.setPolicy).toHaveBeenCalledWith("user:42", {
      limit: 20,
      windowMs: 60_000,
      burst: 5,
    });
    expect(service.setListMembership).toHaveBeenCalledWith(
      "blacklist",
      "user:42",
      true,
    );
  });
});
