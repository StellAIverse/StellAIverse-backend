import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateDeploymentDto } from "./dto/create-deployment.dto";
import { QueryDeploymentsDto } from "./dto/query-deployments.dto";
import { UpdateDeploymentStatusDto } from "./dto/update-deployment-status.dto";
import { DeploymentEvent } from "./entities/deployment-event.entity";
import {
  DEPLOYMENT_STATUS_TRANSITIONS,
  DeploymentStatus,
} from "./entities/deployment.enums";
import { Deployment } from "./entities/deployment.entity";

@Injectable()
export class DeploymentsService {
  constructor(
    @InjectRepository(Deployment)
    private readonly deployments: Repository<Deployment>,
    @InjectRepository(DeploymentEvent)
    private readonly events: Repository<DeploymentEvent>,
  ) {}

  async create(dto: CreateDeploymentDto): Promise<Deployment> {
    if (dto.externalId) {
      const existing = await this.deployments.findOne({
        where: { externalId: dto.externalId },
      });
      if (existing) return existing;
    }

    const status = dto.status ?? DeploymentStatus.RECEIVED;
    const deployment = this.deployments.create({
      externalId: dto.externalId ?? null,
      environment: dto.environment,
      version: dto.version,
      commitSha: dto.commitSha,
      status,
      failureReason:
        status === DeploymentStatus.FAILED ? (dto.message ?? null) : null,
      rollbackReason: null,
      metadata: dto.metadata ?? {},
      completedAt: this.isTerminal(status) ? new Date() : null,
      rollbackRequestedAt: null,
    });
    const saved = await this.deployments.save(deployment);
    await this.recordEvent(saved, status, dto.message, dto.metadata);
    return saved;
  }

  async updateStatus(
    id: string,
    dto: UpdateDeploymentStatusDto,
  ): Promise<Deployment> {
    const deployment = await this.get(id);
    if (deployment.status === dto.status) return deployment;

    const allowed = DEPLOYMENT_STATUS_TRANSITIONS[deployment.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `Cannot transition deployment from ${deployment.status} to ${dto.status}`,
      );
    }

    deployment.status = dto.status;
    deployment.failureReason =
      dto.status === DeploymentStatus.FAILED
        ? (dto.message ?? null)
        : deployment.failureReason;
    deployment.completedAt = this.isTerminal(dto.status) ? new Date() : null;
    if (dto.status === DeploymentStatus.ROLLBACK_REQUESTED) {
      deployment.rollbackRequestedAt = new Date();
      deployment.rollbackReason = dto.message ?? null;
    }
    if (dto.metadata)
      deployment.metadata = { ...deployment.metadata, ...dto.metadata };

    const saved = await this.deployments.save(deployment);
    await this.recordEvent(saved, dto.status, dto.message, dto.metadata);
    return saved;
  }

  async requestRollback(id: string, reason?: string): Promise<Deployment> {
    return this.updateStatus(id, {
      status: DeploymentStatus.ROLLBACK_REQUESTED,
      message: reason,
    });
  }

  async findRecent(query: QueryDeploymentsDto) {
    const builder = this.deployments.createQueryBuilder("deployment");
    if (query.environment)
      builder.andWhere("deployment.environment = :environment", {
        environment: query.environment,
      });
    if (query.status)
      builder.andWhere("deployment.status = :status", { status: query.status });
    const [data, total] = await builder
      .orderBy("deployment.createdAt", "DESC")
      .take(query.limit)
      .getManyAndCount();
    return { data, total, limit: query.limit };
  }

  async history(id: string) {
    await this.get(id);
    return this.events.find({
      where: { deploymentId: id },
      order: { createdAt: "ASC" },
    });
  }

  private async get(id: string): Promise<Deployment> {
    const deployment = await this.deployments.findOne({ where: { id } });
    if (!deployment)
      throw new NotFoundException(`Deployment ${id} was not found`);
    return deployment;
  }

  private async recordEvent(
    deployment: Deployment,
    status: DeploymentStatus,
    message?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.events.save(
      this.events.create({
        deploymentId: deployment.id,
        status,
        message: message ?? null,
        metadata: metadata ?? {},
      }),
    );
  }

  private isTerminal(status: DeploymentStatus) {
    return [
      DeploymentStatus.SUCCEEDED,
      DeploymentStatus.FAILED,
      DeploymentStatus.ROLLED_BACK,
    ].includes(status);
  }
}
