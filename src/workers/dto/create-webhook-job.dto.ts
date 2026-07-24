import {
  IsString,
  IsUrl,
  IsOptional,
  IsObject,
  IsArray,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CreateJobDto } from "./create-job.dto";

export class CreateWebhookJobDto extends CreateJobDto {
  @ApiProperty({
    description: "Target webhook URL",
    example: "https://api.example.com/webhooks/incoming",
  })
  @IsUrl()
  url: string;

  @ApiProperty({
    description: "HTTP method",
    enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    default: "POST",
  })
  @IsEnum(["GET", "POST", "PUT", "PATCH", "DELETE"])
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "POST";

  @ApiPropertyOptional({
    description: "HTTP headers to include",
    example: { "Content-Type": "application/json", Authorization: "Bearer token" },
  })
  @IsObject()
  @IsOptional()
  headers?: Record<string, string>;

  @ApiPropertyOptional({
    description: "Request body (for POST/PUT/PATCH)",
  })
  @IsOptional()
  body?: any;

  @ApiPropertyOptional({
    description: "HTTP status codes that should trigger a retry",
    type: [Number],
    example: [500, 502, 503, 504],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  retryOn?: number[] = [500, 502, 503, 504, 429];

  @ApiPropertyOptional({
    description: "Request timeout in milliseconds",
    default: 30000,
  })
  @IsNumber()
  @Min(1000)
  @Max(120000)
  @IsOptional()
  timeout?: number = 30000;
}
