export enum DeploymentEnvironment {
  DEVELOPMENT = "development",
  STAGING = "staging",
  PRODUCTION = "production",
}

export enum DeploymentStatus {
  RECEIVED = "received",
  IN_PROGRESS = "in_progress",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
  ROLLBACK_REQUESTED = "rollback_requested",
  ROLLED_BACK = "rolled_back",
}

export const TERMINAL_DEPLOYMENT_STATUSES = [
  DeploymentStatus.SUCCEEDED,
  DeploymentStatus.FAILED,
  DeploymentStatus.ROLLED_BACK,
];

export const DEPLOYMENT_STATUS_TRANSITIONS: Record<
  DeploymentStatus,
  DeploymentStatus[]
> = {
  [DeploymentStatus.RECEIVED]: [
    DeploymentStatus.IN_PROGRESS,
    DeploymentStatus.SUCCEEDED,
    DeploymentStatus.FAILED,
  ],
  [DeploymentStatus.IN_PROGRESS]: [
    DeploymentStatus.SUCCEEDED,
    DeploymentStatus.FAILED,
  ],
  [DeploymentStatus.SUCCEEDED]: [DeploymentStatus.ROLLBACK_REQUESTED],
  [DeploymentStatus.FAILED]: [DeploymentStatus.ROLLBACK_REQUESTED],
  [DeploymentStatus.ROLLBACK_REQUESTED]: [DeploymentStatus.ROLLED_BACK],
  [DeploymentStatus.ROLLED_BACK]: [],
};
