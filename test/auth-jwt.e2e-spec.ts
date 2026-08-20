import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { TypeOrmModule } from "@nestjs/typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../src/user/entities/user.entity";
import { RefreshToken } from "../src/auth/entities/auth.entity";
import * as bcrypt from "bcrypt";

describe("JWT Authentication (e2e)", () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let refreshTokenRepository: Repository<RefreshToken>;

  const testUser = {
    email: "test@example.com",
    password: "TestPassword123!",
    username: "testuser",
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        AppModule,
        TypeOrmModule.forRoot({
          type: "sqlite",
          database: ":memory:",
          entities: [User, RefreshToken],
          synchronize: true,
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    userRepository = app.get<Repository<User>>(getRepositoryToken(User));
    refreshTokenRepository = app.get<Repository<RefreshToken>>(
      getRepositoryToken(RefreshToken),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up database before each test
    await refreshTokenRepository.delete({});
    await userRepository.delete({});
  });

  describe("POST /auth/jwt/register", () => {
    it("should register a new user and return tokens", () => {
      return request(app.getHttpServer())
        .post("/auth/jwt/register")
        .send(testUser)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("accessToken");
          expect(res.body).toHaveProperty("refreshToken");
          expect(res.body).toHaveProperty("user");
          expect(res.body.user).toHaveProperty("email", testUser.email);
          expect(res.body.user).toHaveProperty("username", testUser.username);
          expect(res.body.user).toHaveProperty("id");
        });
    });

    it("should not allow duplicate email registration", async () => {
      // First registration
      await request(app.getHttpServer())
        .post("/auth/jwt/register")
        .send(testUser)
        .expect(201);

      // Duplicate registration
      return request(app.getHttpServer())
        .post("/auth/jwt/register")
        .send(testUser)
        .expect(409);
    });

    it("should validate required fields", () => {
      return request(app.getHttpServer())
        .post("/auth/jwt/register")
        .send({ email: testUser.email })
        .expect(400);
    });
  });

  describe("POST /auth/jwt/login", () => {
    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash(testUser.password, 12);
      const user = userRepository.create({
        email: testUser.email,
        password: hashedPassword,
        username: testUser.username,
        walletAddress: `email_${testUser.email}`,
        isActive: true,
        emailVerified: false,
        failedLoginAttempts: 0,
      });
      await userRepository.save(user);
    });

    it("should login with valid credentials", () => {
      return request(app.getHttpServer())
        .post("/auth/jwt/login")
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("accessToken");
          expect(res.body).toHaveProperty("refreshToken");
          expect(res.body).toHaveProperty("user");
          expect(res.body.user).toHaveProperty("email", testUser.email);
        });
    });

    it("should reject invalid credentials", () => {
      return request(app.getHttpServer())
        .post("/auth/jwt/login")
        .send({
          email: testUser.email,
          password: "WrongPassword123!",
        })
        .expect(401);
    });

    it("should reject non-existent user", () => {
      return request(app.getHttpServer())
        .post("/auth/jwt/login")
        .send({
          email: "nonexistent@example.com",
          password: testUser.password,
        })
        .expect(401);
    });

    it("should lock account after too many failed attempts", async () => {
      // Attempt login 5 times with wrong password
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/auth/jwt/login")
          .send({
            email: testUser.email,
            password: "WrongPassword123!",
          })
          .expect(401);
      }

      // 6th attempt should be locked
      return request(app.getHttpServer())
        .post("/auth/jwt/login")
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain("locked");
        });
    });
  });

  describe("POST /auth/jwt/refresh", () => {
    let validRefreshToken: string;

    beforeEach(async () => {
      // Register a user to get tokens
      const response = await request(app.getHttpServer())
        .post("/auth/jwt/register")
        .send(testUser);
      validRefreshToken = response.body.refreshToken;
    });

    it("should refresh tokens with valid refresh token", () => {
      return request(app.getHttpServer())
        .post("/auth/jwt/refresh")
        .send({ refreshToken: validRefreshToken })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("accessToken");
          expect(res.body).toHaveProperty("refreshToken");
          expect(res.body.refreshToken).not.toBe(validRefreshToken);
        });
    });

    it("should reject invalid refresh token", () => {
      return request(app.getHttpServer())
        .post("/auth/jwt/refresh")
        .send({ refreshToken: "invalid-token" })
        .expect(401);
    });

    it("should revoke old refresh token after refresh", async () => {
      // First refresh
      const firstRefresh = await request(app.getHttpServer())
        .post("/auth/jwt/refresh")
        .send({ refreshToken: validRefreshToken });

      // Try to use the old token again
      return request(app.getHttpServer())
        .post("/auth/jwt/refresh")
        .send({ refreshToken: validRefreshToken })
        .expect(401);
    });
  });

  describe("POST /auth/jwt/logout", () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      // Register a user to get tokens
      const response = await request(app.getHttpServer())
        .post("/auth/jwt/register")
        .send(testUser);
      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it("should logout and revoke all refresh tokens", () => {
      return request(app.getHttpServer())
        .post("/auth/jwt/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("message", "Logged out successfully");
        });
    });

    it("should require authentication", () => {
      return request(app.getHttpServer())
        .post("/auth/jwt/logout")
        .expect(401);
    });

    it("should prevent refresh token usage after logout", async () => {
      // Logout
      await request(app.getHttpServer())
        .post("/auth/jwt/logout")
        .set("Authorization", `Bearer ${accessToken}`);

      // Try to refresh
      return request(app.getHttpServer())
        .post("/auth/jwt/refresh")
        .send({ refreshToken })
        .expect(401);
    });
  });

  describe("POST /auth/jwt/logout/current", () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      // Register a user to get tokens
      const response = await request(app.getHttpServer())
        .post("/auth/jwt/register")
        .send(testUser);
      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it("should logout current session only", () => {
      return request(app.getHttpServer())
        .post("/auth/jwt/logout/current")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty(
            "message",
            "Current session logged out successfully",
          );
        });
    });
  });
});
