import { DataSource } from "typeorm";
import { User } from "src/user/entities/user.entity";
import { EmailVerification } from "src/auth/entities/email-verification.entity";
import { Wallet } from "src/auth/entities/wallet.entity";
import { SignedPayload } from "src/oracle/entities/signed-payload.entity";
import { SubmissionNonce } from "src/oracle/entities/submission-nonce.entity";
import { AgentEvent } from "src/audit/entities/agent-event.entity";
import { OracleSubmission } from "src/audit/entities/oracle-submission.entity";
import { ComputeResult } from "src/audit/entities/compute-result.entity";
import { ProvenanceRecord } from "src/audit/entities/provenance-record.entity";
import { DeFiPosition } from "src/defi/entities/defi-position.entity";
import { DeFiYieldRecord } from "src/defi/entities/defi-yield-record.entity";
import { DeFiTransaction } from "src/defi/entities/defi-transaction.entity";
import { DeFiYieldStrategy } from "src/defi/entities/defi-yield-strategy.entity";
import { DeFiRiskAssessment } from "src/defi/entities/defi-risk-assessment.entity";
import { Alert } from "src/alerts/entities/alert.entity";
import { AlertTriggerLog } from "src/alerts/entities/alert-trigger-log.entity";
import { AlertPreference } from "src/alerts/entities/alert-preference.entity";
import { AlertDeliveryLog } from "src/alerts/entities/alert-delivery-log.entity";

export default new DataSource({
  type: "postgres",
  url:
    process.env.DATABASE_URL ||
    "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
  entities: [
    User,
    EmailVerification,
    Wallet,
    SignedPayload,
    SubmissionNonce,
    AgentEvent,
    OracleSubmission,
    ComputeResult,
    ProvenanceRecord,
    DeFiPosition,
    DeFiYieldRecord,
    DeFiTransaction,
    DeFiYieldStrategy,
    DeFiRiskAssessment,
    Alert,
    AlertTriggerLog,
    AlertPreference,
    AlertDeliveryLog,
  ],
  migrations: [`${__dirname}/../migrations/*{.ts,.js}`],
  synchronize: false, // Never use synchronize in production
  logging: process.env.NODE_ENV === "development",
});
