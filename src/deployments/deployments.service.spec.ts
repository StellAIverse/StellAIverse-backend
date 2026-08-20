import { ConflictException, NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { DeploymentsService } from "./deployments.service";
import {
  DeploymentEnvironment,
  DeploymentStatus,
} from "./entities/deployment.enums";
import { Deployment } from "./entities/deployment.entity";
import { DeploymentEvent } from "./entities/deployment-event.entity";

describe("DeploymentsService", () => {
  let service: DeploymentsService;
  let deployments: jest.Mocked<Repository<Deployment>>;
  let events: jest.Mocked<Repository<DeploymentEvent>>;

  beforeEach(() => {
    deployments = {
      findOne: jest.fn(),
      create: jest.fn((value) => value as Deployment),
      save: jest.fn(
        async (value) => ({ id: "deployment-1", ...value }) as Deployment,
      ),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<Repository<Deployment>>;
    events = {
      create: jest.fn((value) => value as DeploymentEvent),
      save: jest.fn(async (value) => value as DeploymentEvent),
      find: jest.fn(),
    } as unknown as jest.Mocked<Repository<DeploymentEvent>>;
    service = new DeploymentsService(deployments, events);
  });

  it("records a deployment and its initial event", async () => {
    const result = await service.create({
      externalId: "github-run-42",
      environment: DeploymentEnvironment.STAGING,
      version: "2026.08.20.1",
      commitSha: "abc123",
      metadata: { workflow: "deploy" },
    });

    expect(result).toMatchObject({
      id: "deployment-1",
      externalId: "github-run-42",
      status: DeploymentStatus.RECEIVED,
    });
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({
        deploymentId: "deployment-1",
        status: DeploymentStatus.RECEIVED,
      }),
    );
  });

  it("makes repeated CI submissions idempotent", async () => {
    const existing = {
      id: "existing",
      externalId: "github-run-42",
    } as Deployment;
    deployments.findOne.mockResolvedValue(existing);

    await expect(
      service.create({
        externalId: "github-run-42",
        environment: DeploymentEnvironment.PRODUCTION,
        version: "new-version",
        commitSha: "new-sha",
      }),
    ).resolves.toBe(existing);
    expect(deployments.save).not.toHaveBeenCalled();
    expect(events.save).not.toHaveBeenCalled();
  });

  it("enforces the lifecycle and records every valid transition", async () => {
    deployments.findOne.mockResolvedValue({
      id: "deployment-1",
      status: DeploymentStatus.IN_PROGRESS,
      metadata: {},
    } as Deployment);

    const result = await service.updateStatus("deployment-1", {
      status: DeploymentStatus.FAILED,
      message: "health check failed",
    });

    expect(result).toMatchObject({
      status: DeploymentStatus.FAILED,
      failureReason: "health check failed",
    });
    expect(events.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: DeploymentStatus.FAILED,
        message: "health check failed",
      }),
    );
  });

  it("rejects invalid transitions and unknown deployments", async () => {
    deployments.findOne.mockResolvedValue({
      id: "deployment-1",
      status: DeploymentStatus.ROLLED_BACK,
    } as Deployment);
    await expect(
      service.updateStatus("deployment-1", {
        status: DeploymentStatus.SUCCEEDED,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    deployments.findOne.mockResolvedValue(null);
    await expect(service.history("missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
