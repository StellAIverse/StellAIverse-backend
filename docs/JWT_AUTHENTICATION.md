# JWT Authentication Module Documentation

## Overview

The JWT Authentication module provides secure token-based authentication with refresh tokens, account lockout, and rate limiting. It implements industry best practices for password hashing, token management, and security controls.

## Features

- **JWT Access Tokens**: Short-lived tokens (configurable, default 15 minutes)
- **Refresh Tokens**: Long-lived tokens (configurable, default 7 days) with revocation support
- **Account Lockout**: Automatic account lockout after configurable failed login attempts
- **Rate Limiting**: Per-IP and per-user rate limiting for login attempts
- **Login Attempt Tracking**: Comprehensive logging of all authentication attempts
- **Password Security**: Bcrypt hashing with per-user salt (12 rounds)
- **Token Revocation**: Support for revoking individual or all refresh tokens
- **2FA Support**: Two-factor authentication integration (TOTP and backup codes)

## Configuration

Add the following environment variables to your `.env` file:

```bash
# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_ACCESS_TOKEN_EXPIRY=15m
JWT_REFRESH_TOKEN_EXPIRY_DAYS=7

# Authentication Security
AUTH_MAX_LOGIN_ATTEMPTS=5
AUTH_LOCKOUT_DURATION_MINUTES=15
AUTH_RATE_LIMIT_TTL_MS=60000
AUTH_RATE_LIMIT_MAX_ATTEMPTS=5
```

### Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for signing JWT tokens | Required |
| `JWT_ACCESS_TOKEN_EXPIRY` | Access token expiry time | `15m` |
| `JWT_REFRESH_TOKEN_EXPIRY_DAYS` | Refresh token expiry in days | `7` |
| `AUTH_MAX_LOGIN_ATTEMPTS` | Maximum failed login attempts before lockout | `5` |
| `AUTH_LOCKOUT_DURATION_MINUTES` | Account lockout duration in minutes | `15` |
| `AUTH_RATE_LIMIT_TTL_MS` | Rate limit time window in milliseconds | `60000` |
| `AUTH_RATE_LIMIT_MAX_ATTEMPTS` | Maximum attempts within rate limit window | `5` |

## API Endpoints

### Register User

**Endpoint:** `POST /auth/jwt/register`

**Description:** Creates a new user account with email/password authentication.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "username": "johndoe"
}
```

**Response (201 Created):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "role": "user",
    "kycStatus": "unverified"
  },
  "requiresTwoFactor": false
}
```

**Error Responses:**
- `409 Conflict`: Email or username already exists
- `400 Bad Request`: Invalid input data

---

### Login

**Endpoint:** `POST /auth/jwt/login`

**Description:** Authenticates a user with email/password. Implements account lockout after configurable failed attempts.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6...",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "role": "user",
    "kycStatus": "unverified"
  },
  "requiresTwoFactor": false
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid credentials or account locked
- `400 Bad Request`: Account uses wallet authentication
- `429 Too Many Requests`: Rate limit exceeded

**Security Features:**
- Rate limited: 5 attempts per minute per IP
- Account lockout after 5 failed attempts (configurable)
- Lockout duration: 15 minutes (configurable)
- All attempts logged for audit trail

---

### Refresh Token

**Endpoint:** `POST /auth/jwt/refresh`

**Description:** Uses a valid refresh token to issue a new access token. The old refresh token is revoked and replaced with a new one.

**Request Body:**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "newtoken123..."
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or expired refresh token

**Security Features:**
- Old refresh token is automatically revoked
- New refresh token issued with fresh expiry
- Rate limited: 10 attempts per minute per IP

---

### Logout (All Sessions)

**Endpoint:** `POST /auth/jwt/logout`

**Description:** Revokes all refresh tokens for the authenticated user, effectively logging them out from all devices.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or expired access token

**Security Features:**
- Revokes all refresh tokens for the user
- Invalidates all active sessions
- Requires valid access token

---

### Logout (Current Session)

**Endpoint:** `POST /auth/jwt/logout/current`

**Description:** Revokes only the current refresh token, allowing other sessions to remain active.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Response (200 OK):**
```json
{
  "message": "Current session logged out successfully"
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or expired access token

---

### Verify Two-Factor Authentication

**Endpoint:** `POST /auth/jwt/2fa/verify`

**Description:** Completes the login process by verifying the 2FA code or backup code. Returns final access and refresh tokens.

**Request Body:**
```json
{
  "userId": "uuid",
  "code": "123456"
}
```

or with backup code:
```json
{
  "userId": "uuid",
  "backupCode": "ABCD1234"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "a1b2c3d4e5f6..."
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid 2FA code
- `400 Bad Request`: 2FA not enabled for user

## Security Considerations

### Password Security

- **Hashing Algorithm**: Bcrypt with 12 salt rounds
- **Per-User Salt**: Each password has a unique salt
- **Minimum Password Length**: 8 characters (enforced by validation)
- **Password Storage**: Never store plaintext passwords

### Token Security

- **Access Tokens**: Short-lived (15 minutes default)
- **Refresh Tokens**: Long-lived (7 days default) with revocation support
- **Token Storage**: Store refresh tokens in HTTP-only cookies or secure storage
- **Token Rotation**: Refresh tokens are rotated on each refresh
- **Token Revocation**: Support for individual and bulk token revocation

### Account Lockout

- **Failed Attempt Tracking**: Tracks failed attempts per user
- **Configurable Threshold**: Default 5 failed attempts
- **Configurable Duration**: Default 15 minutes lockout
- **Automatic Reset**: Counter resets on successful login
- **Audit Logging**: All lockout events are logged

### Rate Limiting

- **Per-IP Limits**: 5 login attempts per minute per IP
- **Per-User Limits**: Additional rate limiting by user
- **Sensitive Rate Limiting**: Auth endpoints use stricter rate limits
- **Configurable**: TTL and limits are configurable via environment variables

### Login Attempt Tracking

- **Comprehensive Logging**: All login attempts are logged
- **Failure Reasons**: Detailed reasons for failed attempts
- **IP and User Agent**: Captures client information
- **Audit Trail**: Maintains security audit trail
- **Automatic Cleanup**: Old attempts are periodically cleaned up

## Database Schema

### Users Table

Added columns for account lockout:
- `failedLoginAttempts` (integer, default: 0)
- `lockedUntil` (timestamp, nullable)

### Refresh Tokens Table

- `id` (UUID, primary key)
- `userId` (UUID, foreign key)
- `token` (string, unique)
- `expiresAt` (timestamp)
- `revoked` (boolean, default: false)
- `revokedAt` (timestamp, nullable)
- `replacedByToken` (string, nullable)
- `ipAddress` (string)
- `userAgent` (string, nullable)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### Login Attempts Table

- `id` (UUID, primary key)
- `userId` (UUID, foreign key, nullable)
- `email` (string, nullable)
- `success` (boolean)
- `failureReason` (string, nullable)
- `ipAddress` (string)
- `userAgent` (string, nullable)
- `createdAt` (timestamp)

## Testing

### Unit Tests

Unit tests are provided for the `LoginAttemptService`:

```bash
npm test -- login-attempt.service.spec.ts
```

### Integration Tests

End-to-end tests cover all authentication endpoints:

```bash
npm run test:e2e -- auth-jwt.e2e-spec.ts
```

Test coverage includes:
- User registration
- Successful login
- Failed login attempts
- Account lockout
- Token refresh
- Token revocation
- Logout functionality

## Migration Guide

### From Legacy AuthService

The legacy `AuthService` is deprecated. Migrate to `EnhancedAuthService`:

**Old:**
```typescript
const result = await authService.login(loginDto);
```

**New:**
```typescript
const result = await enhancedAuthService.login(
  loginDto,
  ipAddress,
  userAgent,
);
```

### Database Migration

Run the following migration to add the new columns:

```bash
npm run migration:generate -- -d src/config/typeorm.config.ts src/migrations/AddAuthSecurityFields
npm run migration:run
```

## Best Practices

### For Developers

1. **Always use HTTPS** in production
2. **Store refresh tokens securely** (HTTP-only cookies recommended)
3. **Implement proper error handling** for authentication failures
4. **Log security events** for monitoring and auditing
5. **Use environment variables** for sensitive configuration
6. **Rotate JWT secrets** periodically in production
7. **Monitor login attempts** for suspicious activity

### For Users

1. **Use strong passwords** with mixed characters
2. **Enable 2FA** when available
3. **Report suspicious activity** immediately
4. **Use different passwords** for different services
5. **Log out from shared devices** after use

## Troubleshooting

### Common Issues

**Account Locked**
- Wait for the lockout period to expire
- Contact administrator if lockout persists
- Check for suspicious activity on the account

**Invalid Refresh Token**
- Token may have expired
- Token may have been revoked
- Try logging in again to get a new token

**Rate Limit Exceeded**
- Wait for the rate limit window to expire
- Check for automated scripts or bots
- Contact administrator if legitimate traffic is blocked

## Support

For issues or questions about the authentication module:
- Check the documentation first
- Review the test files for examples
- Contact the development team
- Open an issue on the project repository
