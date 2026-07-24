import { ExecutionContext, CallHandler } from "@nestjs/common";
import { of, throwError } from "rxjs";
import { MetricsInterceptor } from "./metrics.interceptor";
import * as metricsConfig from "../config/metrics";

describe("MetricsInterceptor", () => {
  let interceptor: MetricsInterceptor;

  const mockTimerEnd = jest.fn();
  const mockResponse = { statusCode: 200 };
  const mockRequest = { method: "GET", route: { path: "/test" }, url: "/test" };

  beforeEach(() => {
    interceptor = new MetricsInterceptor();
    jest.spyOn(metricsConfig.httpRequestDuration, "startTimer").mockReturnValue(mockTimerEnd);
    jest.spyOn(metricsConfig.httpRequestsInProgress, "inc").mockImplementation(jest.fn());
    jest.spyOn(metricsConfig.httpRequestsInProgress, "dec").mockImplementation(jest.fn());
    jest.spyOn(metricsConfig.httpRequestTotal, "inc").mockImplementation(jest.fn());
    jest.spyOn(metricsConfig.httpErrorTotal, "inc").mockImplementation(jest.fn());
  });

  afterEach(() => jest.restoreAllMocks());

  function mockContext(overrides: Partial<typeof mockRequest> = {}): ExecutionContext {
    const req = { ...mockRequest, ...overrides };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  }

  it("records duration and increments request total on success", (done) => {
    const ctx = mockContext();
    const handler: CallHandler = { handle: () => of({ ok: true }) };

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        expect(metricsConfig.httpRequestDuration.startTimer).toHaveBeenCalledWith({
          method: "GET",
          route: "/test",
        });
        expect(mockTimerEnd).toHaveBeenCalledWith({ status_code: "200" });
        expect(metricsConfig.httpRequestTotal.inc).toHaveBeenCalledWith({
          method: "GET",
          route: "/test",
          status_code: "200",
        });
        expect(metricsConfig.httpRequestsInProgress.dec).toHaveBeenCalled();
        done();
      },
    });
  });

  it("records error metrics when handler throws", (done) => {
    const ctx = mockContext();
    const err = { status: 400 };
    const handler: CallHandler = { handle: () => throwError(() => err) };

    interceptor.intercept(ctx, handler).subscribe({
      error: () => {
        expect(mockTimerEnd).toHaveBeenCalledWith({ status_code: "400" });
        expect(metricsConfig.httpErrorTotal.inc).toHaveBeenCalledWith({
          method: "GET",
          route: "/test",
          status_code: "400",
        });
        expect(metricsConfig.httpRequestsInProgress.dec).toHaveBeenCalled();
        done();
      },
    });
  });

  it("defaults to 500 status when error has no status property", (done) => {
    const ctx = mockContext();
    const handler: CallHandler = { handle: () => throwError(() => ({})) };

    interceptor.intercept(ctx, handler).subscribe({
      error: () => {
        expect(mockTimerEnd).toHaveBeenCalledWith({ status_code: "500" });
        done();
      },
    });
  });

  it("skips tracking when no HTTP request available", (done) => {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => null, getResponse: () => null }),
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => of("ok") };

    interceptor.intercept(ctx, handler).subscribe({
      next: () => {
        expect(metricsConfig.httpRequestDuration.startTimer).not.toHaveBeenCalled();
        done();
      },
    });
  });
});
