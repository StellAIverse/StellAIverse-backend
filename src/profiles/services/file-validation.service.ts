import { Injectable, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Express } from "express";

@Injectable()
export class FileValidationService {
  private readonly allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  private readonly maxFileSize: number; // in bytes

  constructor(private configService: ConfigService) {
    this.maxFileSize = this.configService.get("MAX_AVATAR_SIZE", 5 * 1024 * 1024); // Default 5MB
  }

  validateFile(file: Express.Multer.File): void {
    // Validate file type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.allowedMimeTypes.join(", ")}`
      );
    }

    // Validate file size
    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File too large. Maximum size allowed is ${this.maxFileSize / 1024 / 1024}MB`
      );
    }

    // Additional security checks
    this.validateFileContent(file);
  }

  private validateFileContent(file: Express.Multer.File): void {
    // Check for magic numbers to prevent file spoofing
    const buffer = file.buffer;
    
    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) return;
    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return;
    // GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return;
    // WEBP
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return;

    throw new BadRequestException("File content does not match its declared MIME type");
  }

  getAllowedMimeTypes(): string[] {
    return [...this.allowedMimeTypes];
  }

  getMaxFileSize(): number {
    return this.maxFileSize;
  }
}