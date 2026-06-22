import { IsString, IsNotEmpty, IsOptional, IsNumber, IsBoolean, IsEnum, IsUrl, Min, Max } from "class-validator";
import { plainToInstance } from "class-transformer";

export enum NodeEnv {
  DEVELOPMENT = "development",
  PRODUCTION = "production",
  TEST = "test",
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.DEVELOPMENT;

  @IsNumber()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN: string = "http://localhost:3001";

  @IsString()
  LOG_LEVEL: string = "info";

  // Sentry
  @IsOptional()
  @IsUrl()
  SENTRY_DSN?: string;

  // RPC URLs for blockchain connections
  @IsOptional()
  @IsUrl()
  ETH_RPC_URL?: string;

  @IsOptional()
  @IsUrl()
  ARB_RPC_URL?: string;

  @IsOptional()
  @IsUrl()
  POLY_RPC_URL?: string;

  @IsOptional()
  @IsUrl()
  OPT_RPC_URL?: string;

  // OpenTelemetry / Tracing
  @IsNumber()
  @Min(0)
  @Max(1)
  OTEL_SAMPLING_RATE: number = 1.0;

  @IsNumber()
  @Min(0)
  @Max(1)
  OTEL_MIN_SAMPLING_RATE: number = 0.1;

  @IsBoolean()
  OTEL_EXPORTER_JAEGER_ENABLED: boolean = true;

  @IsOptional()
  @IsUrl()
  OTEL_EXPORTER_JAEGER_ENDPOINT?: string;

  @IsBoolean()
  OTEL_EXPORTER_OTLP_ENABLED: boolean = false;

  @IsOptional()
  @IsUrl()
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  // SMTP / Email configuration
  @IsOptional()
  @IsString()
  SMTP_HOST?: string = "smtp.ethereal.email";

  @IsNumber()
  @Min(1)
  @Max(65535)
  SMTP_PORT: number = 587;

  @IsBoolean()
  SMTP_SECURE: boolean = false;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsString()
  EMAIL_VERIFICATION_URL: string = "http://localhost:3000/auth/verify-email";

  @IsString()
  EMAIL_FROM: string = '"StellAIverse" <noreply@stellaiverse.com>';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  return validatedConfig;
}