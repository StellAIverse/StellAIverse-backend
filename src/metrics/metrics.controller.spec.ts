import { Test, TestingModule } from "@nestjs/testing";
import { MetricsController } from "./metrics.controller";
import { register } from "../config/metrics";
import { Response } from "express";

describe("MetricsController", () => {
  let controller: MetricsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  it("should return Prometheus metrics in text format", async () => {
    const mockEnd = jest.fn();
    const mockSet = jest.fn();
    const res = { set: mockSet, end: mockEnd } as unknown as Response;

    await controller.metrics(res);

    expect(mockSet).toHaveBeenCalledWith("Content-Type", register.contentType);
    expect(mockEnd).toHaveBeenCalledWith(expect.stringContaining("stellaiverse_"));
  });

  it("should include default system metrics", async () => {
    const metricsOutput = await register.metrics();
    expect(metricsOutput).toContain("stellaiverse_nodejs_");
  });

  it("should expose custom HTTP metrics", async () => {
    const metricsOutput = await register.metrics();
    expect(metricsOutput).toContain("stellaiverse_http_request_duration_seconds");
    expect(metricsOutput).toContain("stellaiverse_http_requests_total");
    expect(metricsOutput).toContain("stellaiverse_http_requests_in_progress");
  });

  it("should expose auth metrics", async () => {
    const metricsOutput = await register.metrics();
    expect(metricsOutput).toContain("stellaiverse_auth_attempts_total");
    expect(metricsOutput).toContain("stellaiverse_auth_success_total");
    expect(metricsOutput).toContain("stellaiverse_auth_failures_total");
  });

  it("should expose database query metrics", async () => {
    const metricsOutput = await register.metrics();
    expect(metricsOutput).toContain("stellaiverse_database_query_duration_seconds");
  });

  it("should validate metrics schema — all metric names have correct prefix", async () => {
    const metricsOutput = await register.metrics();
    const lines = metricsOutput
      .split("\n")
      .filter((l) => l.startsWith("# HELP "));
    const nonPrefixed = lines.filter((l) => !l.startsWith("# HELP stellaiverse_"));
    expect(nonPrefixed).toHaveLength(0);
  });
});
