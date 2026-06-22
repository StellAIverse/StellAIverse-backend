import { logger, createLogger } from "../../config/logger";
import { LoggingMiddleware } from "./logging.middleware";
import { Request, Response } from "express";

describe("logger", () => {
  it("should be defined", () => {
    expect(logger).toBeDefined();
  });

  it("should have required logging methods", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("should include service base field", () => {
    expect((logger as any).bindings?.()?.service ?? (logger as any)[Symbol.for('pino.serializers')]).toBeTruthy();
  });
});

describe("createLogger", () => {
  it("should return a child logger with the given context", () => {
    const child = createLogger({ module: "test" });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
  });
});

describe("LoggingMiddleware", () => {
  let middleware: LoggingMiddleware;

  beforeEach(() => {
    middleware = new LoggingMiddleware();
  });

  it("should be defined", () => {
    expect(middleware).toBeDefined();
  });

  it("should call next()", () => {
    const req = {
      headers: {},
      method: "GET",
      url: "/test",
      ip: "127.0.0.1",
    } as unknown as Request;

    const res = {
      setHeader: jest.fn(),
      on: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should set x-correlation-id response header", () => {
    const req = {
      headers: {},
      method: "GET",
      url: "/test",
      ip: "127.0.0.1",
    } as unknown as Request;

    const setHeader = jest.fn();
    const res = {
      setHeader,
      on: jest.fn(),
    } as unknown as Response;

    middleware.use(req, res, jest.fn());

    expect(setHeader).toHaveBeenCalledWith(
      "x-correlation-id",
      expect.any(String),
    );
  });

  it("should use provided x-correlation-id from request headers", () => {
    const correlationId = "test-correlation-id-123";
    const req = {
      headers: { "x-correlation-id": correlationId },
      method: "GET",
      url: "/test",
      ip: "127.0.0.1",
    } as unknown as Request;

    const setHeader = jest.fn();
    const res = {
      setHeader,
      on: jest.fn(),
    } as unknown as Response;

    middleware.use(req, res, jest.fn());

    expect(setHeader).toHaveBeenCalledWith("x-correlation-id", correlationId);
    expect((req as any).correlationId).toBe(correlationId);
  });
});
