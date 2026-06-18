import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
} from "@opentelemetry/sdk-trace-base";
import { trace, SpanStatusCode, Span, propagation, context } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";

// Configure global context propagation
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

// Sampling configuration
const samplingRatio = parseFloat(process.env.OTEL_TRACE_SAMPLING_RATIO || "0.1");
const isProduction = process.env.NODE_ENV === "production";

const sampler = isProduction
  ? new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(samplingRatio),
    })
  : new AlwaysOnSampler();

// Configure the trace exporter
const traceExporter = new OTLPTraceExporter({
  url:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    "http://localhost:4318/v1/traces",
  headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
    ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
    : {},
});

export const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": "stellAIverse-backend",
    "service.version": process.env.npm_package_version || "1.0.0",
    "deployment.environment": process.env.NODE_ENV || "development",
  }),
  sampler,
  spanProcessor: new BatchSpanProcessor(traceExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": {
        enabled: false,
      },
    }),
  ],
});

// Start the SDK
export const startTracing = async () => {
  try {
    sdk.start();
    console.log("OpenTelemetry tracing initialized");
  } catch (err) {
    console.error("Failed to start OpenTelemetry SDK:", err);
  }
};

// Graceful shutdown
export const shutdownTracing = async () => {
  try {
    await sdk.shutdown();
    console.log("OpenTelemetry tracing shut down");
  } catch (error) {
    console.error("Error shutting down tracing:", error);
  }
};

// Helper to get the tracer
export const getTracer = () => {
  return trace.getTracer("stellAIverse-backend", "1.0.0");
};

// Helper to create a span with automatic error handling
export const createSpan = async <T>(
  name: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> => {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
};
