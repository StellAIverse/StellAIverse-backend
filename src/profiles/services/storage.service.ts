import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3 } from "aws-sdk";
import { v4 as uuid } from "uuid";
import * as fs from "fs/promises";
import * as path from "path";
import { Express } from "express";

export interface StorageUploadResult {
  url: string;
  key: string;
}

@Injectable()
export class StorageService {
  private readonly s3: S3;
  private readonly storageType: "local" | "s3";
  private readonly uploadDir: string;
  private readonly s3Bucket: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.storageType = this.configService.get("STORAGE_TYPE", "local") as "local" | "s3";
    this.uploadDir = path.join(process.cwd(), this.configService.get("LOCAL_UPLOAD_DIR", "uploads/avatars"));
    this.s3Bucket = this.configService.get("AWS_S3_BUCKET_NAME", "");
    this.baseUrl = this.configService.get("APP_BASE_URL", "http://localhost:3000");
    
    if (this.storageType === "s3") {
      this.s3 = new S3({
        region: this.configService.get("AWS_REGION", "us-east-1"),
        accessKeyId: this.configService.get("AWS_ACCESS_KEY_ID"),
        secretAccessKey: this.configService.get("AWS_SECRET_ACCESS_KEY"),
      });
    }

    // Create local upload directory if it doesn't exist
    this.ensureUploadDirExists();
  }

  private async ensureUploadDirExists(): Promise<void> {
    if (this.storageType === "local") {
      try {
        await fs.access(this.uploadDir);
      } catch {
        await fs.mkdir(this.uploadDir, { recursive: true });
      }
    }
  }

  async uploadFile(file: Express.Multer.File, userId: string): Promise<StorageUploadResult> {
    const fileExtension = path.extname(file.originalname);
    const fileName = `${userId}-${uuid()}${fileExtension}`;

    if (this.storageType === "s3") {
      return this.uploadToS3(file, fileName);
    } else {
      return this.uploadToLocal(file, fileName);
    }
  }

  private async uploadToS3(file: Express.Multer.File, key: string): Promise<StorageUploadResult> {
    const uploadResult = await this.s3
      .upload({
        Bucket: this.s3Bucket,
        Body: file.buffer,
        Key: `avatars/${key}`,
        ContentType: file.mimetype,
        ACL: "public-read",
      })
      .promise();

    return {
      url: uploadResult.Location,
      key: uploadResult.Key,
    };
  }

  private async uploadToLocal(file: Express.Multer.File, fileName: string): Promise<StorageUploadResult> {
    const filePath = path.join(this.uploadDir, fileName);
    await fs.writeFile(filePath, file.buffer);
    
    const url = `${this.baseUrl}/uploads/avatars/${fileName}`;
    return {
      url,
      key: fileName,
    };
  }

  async deleteFile(key: string): Promise<void> {
    if (this.storageType === "s3") {
      await this.s3
        .deleteObject({
          Bucket: this.s3Bucket,
          Key: key,
        })
        .promise();
    } else {
      const filePath = path.join(this.uploadDir, key);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.warn(`Failed to delete local file: ${filePath}`, error);
      }
    }
  }

  getStorageType(): "local" | "s3" {
    return this.storageType;
  }
}