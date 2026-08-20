import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequireRole } from "../common/decorators/roles.decorator";
import { Role } from "../common/guard/roles.enum";
import { CreateDeploymentDto } from "./dto/create-deployment.dto";
import { QueryDeploymentsDto } from "./dto/query-deployments.dto";
import { UpdateDeploymentStatusDto } from "./dto/update-deployment-status.dto";
import { DeploymentsService } from "./deployments.service";

@ApiTags("deployments")
@ApiBearerAuth()
@RequireRole(Role.OPERATOR)
@Controller("deployments")
export class DeploymentsController {
  constructor(private readonly service: DeploymentsService) {}

  @Post()
  @ApiOperation({ summary: "Register a CI/CD deployment event" })
  create(@Body() dto: CreateDeploymentDto) {
    return this.service.create(dto);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Record a deployment status transition" })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateDeploymentStatusDto,
  ) {
    return this.service.updateStatus(id, dto);
  }

  @Post(":id/rollback")
  @ApiOperation({ summary: "Request and record a deployment rollback" })
  requestRollback(@Param("id") id: string, @Body() body: { reason?: string }) {
    return this.service.requestRollback(id, body?.reason);
  }

  @Get()
  @ApiOperation({ summary: "List recent deployments and their health" })
  findRecent(@Query() query: QueryDeploymentsDto) {
    return this.service.findRecent(query);
  }

  @Get(":id/history")
  @ApiOperation({
    summary: "View the immutable status history for a deployment",
  })
  history(@Param("id") id: string) {
    return this.service.history(id);
  }
}
