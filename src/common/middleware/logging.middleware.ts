import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../../config/logger";

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = (req.headers["x-correlation-id"] as string) || uuidv4();
    const startTime = Date.now();

    // Attach correlation ID to request and response headers
    (req as any).correlationId = correlationId;
    res.setHeader("x-correlation-id", correlationId);

    const requestLog = logger.child({ correlationId });

    requestLog.info(
      {
        method: req.method,
        url: req.url,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      },
      "Incoming request",
    );

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const level = res.statusCode >= 400 ? "warn" : "info";
      requestLog[level](
        {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
        },
        "Request completed",
      );
    });

    next();
  }
}
