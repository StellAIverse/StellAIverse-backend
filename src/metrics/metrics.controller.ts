import { Controller, Get, Header, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Response } from "express";
import { register } from "../config/metrics";
import { Public } from "../common/decorators/public.decorator";

@ApiExcludeController()
@Controller("metrics")
export class MetricsController {
  @Public()
  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async metrics(@Res() res: Response): Promise<void> {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  }
}
