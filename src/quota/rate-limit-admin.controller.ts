import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Role, Roles } from "../common/decorators/roles.decorator";
import { RolesGuard } from "../common/guard/roles.guard";
import { UpdateRateLimitPolicyDto } from "./rate-limit-admin.dto";
import { RateLimiterService } from "./rate-limiter.service";

@ApiTags("Admin Rate Limits")
@ApiBearerAuth("JWT-auth")
@Controller("admin/rate-limits")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class RateLimitAdminController {
  constructor(private readonly rateLimiter: RateLimiterService) {}

  @Get(":identifier")
  getState(@Param("identifier") identifier: string) {
    return this.rateLimiter.getIdentifierState(identifier);
  }

  @Put(":identifier/policy")
  setPolicy(
    @Param("identifier") identifier: string,
    @Body() policy: UpdateRateLimitPolicyDto,
  ) {
    return this.rateLimiter.setPolicy(identifier, policy);
  }

  @Delete(":identifier/policy")
  @HttpCode(204)
  deletePolicy(@Param("identifier") identifier: string) {
    return this.rateLimiter.deletePolicy(identifier);
  }

  @Put(":identifier/whitelist")
  whitelist(@Param("identifier") identifier: string) {
    return this.rateLimiter.setListMembership("whitelist", identifier, true);
  }

  @Delete(":identifier/whitelist")
  removeWhitelist(@Param("identifier") identifier: string) {
    return this.rateLimiter.setListMembership("whitelist", identifier, false);
  }

  @Put(":identifier/blacklist")
  blacklist(@Param("identifier") identifier: string) {
    return this.rateLimiter.setListMembership("blacklist", identifier, true);
  }

  @Delete(":identifier/blacklist")
  removeBlacklist(@Param("identifier") identifier: string) {
    return this.rateLimiter.setListMembership("blacklist", identifier, false);
  }
}
