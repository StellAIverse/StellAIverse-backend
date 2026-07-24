/**
 * Sentry instrumentation — only initialised when @sentry/nestjs is installed
 * and SENTRY_DSN is set. Safe to import unconditionally.
 */
export async function initSentry(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;

  try {
    const Sentry = await import("@sentry/nestjs" as any);
    const { nodeProfilingIntegration } = await import(
      "@sentry/profiling-node" as any
    );

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [nodeProfilingIntegration()],
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      profilesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      environment: process.env.NODE_ENV || "development",
      release: process.env.npm_package_version || "1.0.0",
    });
  } catch {
    // Package not installed — Sentry is optional
  }
}
