import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { LoginAttempt } from "./entities/auth.entity";
import { User } from "src/user/entities/user.entity";

@Injectable()
export class LoginAttemptService {
  constructor(
    @InjectRepository(LoginAttempt)
    private readonly loginAttemptRepository: Repository<LoginAttempt>,
  ) {}

  async recordLoginAttempt(
    user: User | null,
    email: string,
    success: boolean,
    ipAddress: string,
    userAgent?: string,
    failureReason?: string,
  ): Promise<void> {
    const attempt = this.loginAttemptRepository.create({
      userId: user?.id,
      email,
      success,
      failureReason,
      ipAddress,
      userAgent,
    });
    await this.loginAttemptRepository.save(attempt);
  }

  async getFailedAttemptsCount(
    email: string,
    sinceMinutes: number = 15,
  ): Promise<number> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    return this.loginAttemptRepository.count({
      where: {
        email,
        success: false,
        createdAt: { $gte: since } as any,
      },
    });
  }

  async getFailedAttemptsForUser(
    userId: string,
    sinceMinutes: number = 15,
  ): Promise<number> {
    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    return this.loginAttemptRepository.count({
      where: {
        userId,
        success: false,
        createdAt: { $gte: since } as any,
      },
    });
  }

  async cleanupOldAttempts(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = new Date(
      Date.now() - daysToKeep * 24 * 60 * 60 * 1000,
    );
    await this.loginAttemptRepository
      .createQueryBuilder()
      .delete()
      .where("createdAt < :cutoffDate", { cutoffDate })
      .execute();
  }
}
