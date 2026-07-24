# Sentry Integration

Sentry has been integrated into the StellAIverse backend for error tracking and performance monitoring.

## Configuration

1.  **Dependencies**: Installed `@sentry/nestjs`, `@sentry/node`, and `@sentry/profiling-node`.
2.  **Initialization**: Created `src/instrument.ts` which initializes Sentry at the very start of the application.
3.  **Bootstrap**: Imported `instrument.ts` at the top of `src/main.ts`.
4.  **Error Handling**: Added `SentryGlobalFilter` to the global filters in `src/app.module.ts`.
5.  **Environment Variables**: Added `SENTRY_DSN` to `.env.example`.

## Testing

A test endpoint `/api/v1/auth/test-error` was added to verify error reporting to Sentry.
