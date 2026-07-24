import "./instrument";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { logger } from "./config/logger";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { SanitizePipe } from "./common/pipes/sanitize.pipe";
import { setupSwagger } from "./config/swagger.config";
import { setupCors } from "./config/cors.config";
import { setupHelmet } from "./config/helmet.config";

async function bootstrap() {
  // Initialize tracing safely
  try {
    const { startTracing } = await import("./config/tracing");
    await startTracing();
    logger.info("Tracing initialized");
  } catch (error) {
    logger.warn({ error: error.message }, "Tracing initialization failed");
  }

  // Create app with appropriate logging
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>("NODE_ENV");
  const isProduction = nodeEnv === "production";

  // Use configured logging levels
  app.useLogger(
    isProduction
      ? ["error", "warn"]
      : ["log", "error", "warn", "debug", "verbose"],
  );

  // Setup security, CORS, and other middleware
  setupHelmet(app);
  setupCors(app, configService);
  
  // Global configuration
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    // Sanitize first to strip XSS payloads before validation
    new SanitizePipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: isProduction,
      forbidUnknownValues: true,
    }),
  );

  // Disable x-powered-by header
  app.getHttpAdapter().getInstance().disable("x-powered-by");

  // Setup Swagger documentation
  setupSwagger(app);

  const port = configService.get<number>("PORT");
  await app.listen(port);

  logger.info(`🚀 Application running on http://localhost:${port}/api/v1`);
  logger.info(
    `📚 API Documentation available at http://localhost:${port}/api/docs`,
  );
}

bootstrap().catch((error) => {
  logger.error({ error }, "Bootstrap failed");
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  logger.error({ error }, "Uncaught Exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason: any) => {
  logger.error({ reason }, "Unhandled Rejection");
  process.exit(1);
});