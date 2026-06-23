const pino = require("pino");

const isDevelopment = process.env.NODE_ENV === "development";

// Lazy getter to avoid circular dependency with tracing.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTraceId = (): string | undefined => {
  try {
    return require("./tracing").getCurrentTraceId();
  } catch {
    return undefined;
  }
};

// Create a Pino logger that automatically includes trace IDs
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  base: {
    env: process.env.NODE_ENV,
    service: "stellAIverse-backend",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Mixin to add trace ID to every log entry
  mixin() {
    const traceId = getTraceId();
    if (traceId) {
      return {
        trace_id: traceId,
      };
    }
    return {};
  },
});

// Helper function to create child loggers with context
export const createLogger = (context: Record<string, any>) => {
  const traceId = getTraceId();
  const contextWithTrace = traceId
    ? { ...context, trace_id: traceId }
    : context;
  return logger.child(contextWithTrace);
};
