import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  ValidateNested,
  IsObject,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { CreateJobDto } from "./create-job.dto";

export class EmailAttachmentDto {
  @ApiProperty()
  @IsString()
  filename: string;

  @ApiProperty({ description: "Base64-encoded content" })
  @IsString()
  content: string;

  @ApiPropertyOptional({ example: "application/pdf" })
  @IsString()
  @IsOptional()
  contentType?: string;
}

export class CreateEmailJobDto extends CreateJobDto {
  @ApiProperty({
    description: "Recipient email address(es)",
    example: "user@example.com",
  })
  @IsEmail()
  to: string | string[];

  @ApiProperty({ description: "Email subject" })
  @IsString()
  subject: string;

  @ApiProperty({ description: "Plain text body" })
  @IsString()
  body: string;

  @ApiPropertyOptional({ description: "HTML body" })
  @IsString()
  @IsOptional()
  html?: string;

  @ApiPropertyOptional({ description: "From address override" })
  @IsEmail()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: "CC recipients", type: [String] })
  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  cc?: string[];

  @ApiPropertyOptional({ description: "BCC recipients", type: [String] })
  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  bcc?: string[];

  @ApiPropertyOptional({ type: [EmailAttachmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmailAttachmentDto)
  @IsOptional()
  attachments?: EmailAttachmentDto[];
}
