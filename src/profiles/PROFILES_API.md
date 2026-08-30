# User Profiles Module Documentation

## Overview
The profiles module provides comprehensive CRUD operations for user profiles with secure avatar upload functionality, visibility controls, and permission management.

## API Contract

### Endpoints

| Method | Endpoint               | Description                                      | Authentication Required |
|--------|------------------------|--------------------------------------------------|--------------------------|
| POST   | /profiles              | Create a new user profile                         | No                       |
| GET    | /profiles/:id          | Retrieve a user profile by ID                    | Yes                      |
| PUT    | /profiles/:id          | Update an existing user profile                  | Yes (owner or admin)     |
| DELETE | /profiles/:id          | Delete a user profile                            | Yes (owner or admin)     |
| POST   | /profiles/:id/avatar   | Upload a profile avatar image                    | Yes (owner or admin)     |
| DELETE | /profiles/:id/avatar   | Remove a profile's avatar                        | Yes (owner or admin)     |

### Request/Response Examples

#### Create Profile (POST /profiles)
**Request Body:**
```json
{
  "displayName": "John Doe",
  "bio": "Software developer passionate about blockchain",
  "email": "john@example.com",
  "walletAddress": "0x123456789abcdef",
  "preferences": {
    "visibility": "public",
    "showEmail": false,
    "showBio": true,
    "showActivity": true
  }
}
```

**Response:**
```json
{
  "id": "a1b2c3d4-5678-90ef-ghij-klmnopqrstuv",
  "displayName": "John Doe",
  "email": "john@example.com",
  "avatar": null,
  "preferences": {
    "visibility": "public",
    "showEmail": false,
    "showBio": true,
    "showActivity": true
  },
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

#### Update Profile (PUT /profiles/:id)
**Request Body (only fields that need to be updated):**
```json
{
  "displayName": "John Updated",
  "bio": "Updated bio information",
  "preferences": {
    "visibility": "private"
  }
}
```

#### Upload Avatar (POST /profiles/:id/avatar)
Multipart form data with a single file field named "file".

**Allowed file types:** JPEG, PNG, WebP, GIF
**Maximum file size:** 5MB (configurable)

## Profile Visibility & Privacy

### Visibility Options
- `public`: Profile is visible to all authenticated users
- `private`: Profile is only visible to the owner and admins
- `followers_only`: Profile is visible to approved followers (follow functionality not included in this module)

### Privacy Controls
Users can configure which fields are visible:
- `showEmail`: Whether email is visible to others (only applies to public profiles)
- `showBio`: Whether biography is visible to others
- `showActivity`: Whether user activity is visible to others

## Permissions System

| Action                | Regular User | Admin |
|-----------------------|--------------|-------|
| View own profile      | ✅           | ✅    |
| View others' profiles | ✅ (subject to visibility) | ✅ |
| Update own profile    | ✅           | ✅    |
| Update others' profiles | ❌         | ✅    |
| Delete own profile    | ✅           | ✅    |
| Delete others' profiles | ❌         | ✅    |
| Upload own avatar     | ✅           | ✅    |
| Upload others' avatars | ❌          | ✅    |

## Storage Configuration

The module supports both local file storage and AWS S3 (for cloud/CDN integration). Configure via environment variables:

### Environment Variables

```env
# Storage Type Configuration
STORAGE_TYPE=local  # or "s3" for AWS S3

# Local Storage Configuration (when STORAGE_TYPE=local)
LOCAL_UPLOAD_DIR=uploads/avatars
APP_BASE_URL=http://localhost:3000

# AWS S3 Configuration (when STORAGE_TYPE=s3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_BUCKET_NAME=your-bucket-name

# File Validation Configuration
MAX_AVATAR_SIZE=5242880  # 5MB in bytes
```

### Local Storage Setup
1. The module automatically creates the upload directory if it doesn't exist
2. Files are served statically from the upload directory
3. Ensure your webserver is configured to serve these files correctly

### S3/CDN Setup
1. Create an AWS S3 bucket
2. Configure CORS to allow your domain to access the files
3. Set up a CloudFront (or other CDN) distribution for optimal performance
4. Configure the bucket policy to allow public read access for avatars:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-bucket-name/avatars/*"
    }
  ]
}
```

## Security Features

### File Upload Security
1. **MIME type validation**: Only accepts image file types
2. **Magic number verification**: Prevents file spoofing by checking file signatures
3. **Size restrictions**: Prevents large file uploads
4. **Secure file naming**: Uses UUIDs to prevent filename collisions and path traversal attacks
5. **Scan for malware**: Recommended to add additional malware scanning for production use

### Data Security
1. **Email protection**: Email is only exposed to authorized users based on privacy settings
2. **Permission enforcement**: All write operations are guarded by strict permission checks
3. **Input validation**: All profile fields are validated using class-validator
4. **SQL injection protection**: Uses TypeORM's parameterized queries

## Running Tests
```bash
# Run all profile module tests
npm test -- src/profiles/profiles.service.spec.ts
```

## Integration with App Module
Add the ProfilesModule to your app.module.ts imports:
```typescript
import { ProfilesModule } from './profiles/profiles.module';

@Module({
  imports: [
    // ... other modules
    ProfilesModule,
  ],
})
export class AppModule {}
```

## Serve Static Files (for Local Storage)
In your main.ts, add:
```typescript
app.useStaticAssets(join(__dirname, '..', 'uploads'), {
  prefix: '/uploads/',
});
```
This will serve uploaded avatar files at `/uploads/avatars/[filename]`.