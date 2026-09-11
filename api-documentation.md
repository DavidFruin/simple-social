# Simple Social API Documentation

## Base URL
```
https://dev.davidfruin.com/api.php
```

## Request Format
All requests are HTTP POST with `application/x-www-form-urlencoded` body:

```
Content-Type: application/x-www-form-urlencoded
```

### Example
```json
{
  "action": "login",
  "email": "user@example.com",
  "password": "secret&password"
}
```

---

## Response Format
All responses are JSON.

### Success Response
```json
{
  "valid": true,
  // ... other fields
}
```

### Error Response
```json
{
  "valid": false,
  "message": "Error message"
}
```
Or:
```json
{
  "valid": false,
  "error": "Error message"
}
```

### HTTP Status Codes
| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request |
| 401 | Unauthorized |
| 404 | Not found |
| 500 | Server error |

---

## Authentication

### Public Endpoints (no auth required)
- login
- logout
- sendOTP
- verifyOTP
- resetPassword
- sendRegisterOTP
- verifyRegisterOTP
- finishRegister

### Protected Endpoints (auth required)
All other endpoints require a valid JWT in the Authorization header.

### JWT Authentication
Include JWT in the `Authorization` header:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
- JWT is returned in the JSON response from login
- Use `Bearer` scheme
- Expires in 24 hours
- JWT is invalidated in the database on logout

---

## API Endpoints

### 1. login
Authenticate a user.

**Request:**
```json
{
  "action": "login",
  "email": "user@example.com",
  "password": "secret&password"
}
```

**Response (success):**
```json
{
  "valid": true,
  "message": "Login successful",
  "userId": 26,
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Notes:**
- JWT is returned in the JSON response
- Store the JWT and include it in the `Cookie` header for subsequent requests:
```http
Cookie: jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
- JWT expires in 24 hours
- On logout, JWT is invalidated in the database

---

### 2. logout
Log out the current user and invalidate JWT in database.

**Request:**
```json
{
  "action": "logout"
}
```

**Response:**
```json
{
  "valid": true,
  "message": "Logged out"
}
```

**Notes:**
- JWT is invalidated in the database (cannot be reused)

---

### 3. getMyInfo
Get current user's info. Requires auth.

**Request:**
```json
{
  "action": "getMyInfo"
}
```

**Response (success):**
```json
{
  "valid": true,
  "id": 26,
  "userId": 26,
  "email": "user@example.com",
  "created_at": "2026-01-01 12:00:00"
}
```

**Response (error):**
```json
{
  "valid": false,
  "error": "Unauthorized"
}
```

---

### 4. getMyPosts
Get current user's posts. Requires auth.

**Request:**
```json
{
  "action": "getMyPosts",
  "offset": 0,
  "limit": 25
}
```

**Response (success):**
```json
{
  "valid": true,
  "posts": [
    {
      "id": "26.1776877398",
      "text": "Post content",
      "timestamp": "2026-04-22 17:03:18",
      "likes": [],
      "userEmail": "user@example.com"
    }
  ],
  "hasMore": false,
  "totalCount": 2
}
```

**Notes:**
- Posts are sorted by timestamp descending (newest first)
- Post ID format: `userId.timestamp`

---

### 5. post
Create a new post. Requires auth.

**Request:**
```json
{
  "action": "post",
  "postText": "Hello world!"
}
```

**Response (success):**
```json
{
  "valid": true,
  "postId": "26.1776877398"
}
```

**Response (error):**
```json
{
  "valid": false,
  "message": "Post text required"
}
```
or:
```json
{
  "valid": false,
  "message": "You are trying to post illegal characters"
}
```

**Notes:**
- Only allows: ` !"#$'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~ÁÉÍÓÚÜÑáéíóúüñ¿¡«»`
- Post ID is `userId.timestamp`

---

### 6. getUsers
Get all users except current user. Requires auth.

**Request:**
```json
{
  "action": "getUsers"
}
```

**Response (success):**
```json
{
  "valid": true,
  "users": [
    {"id": 1, "email": "user1@example.com", "created_at": "2026-01-01"},
    {"id": 2, "email": "user2@example.com", "created_at": "2026-01-02"}
  ]
}
```

---

### 7. followUser
Follow a user. Requires auth.

**Request:**
```json
{
  "action": "followUser",
  "userId": 1
}
```

**Response (success):**
```json
{
  "valid": true,
  "following": true
}
```

**Response (error):**
```json
{
  "valid": false,
  "message": "Invalid user ID"
}
```

---

### 8. unfollowUser
Unfollow a user. Requires auth.

**Request:**
```json
{
  "action": "unfollowUser",
  "userId": 1
}
```

**Response (success):**
```json
{
  "valid": true,
  "following": false
}
```

---

### 9. isFollowing
Check if following a user. Requires auth.

**Request:**
```json
{
  "action": "isFollowing",
  "userId": 1
}
```

**Response (success):**
```json
{
  "valid": true,
  "following": true
}
```

---

### 10. getMyFollows
Get users that current user follows. Requires auth.

**Request:**
```json
{
  "action": "getMyFollows"
}
```

**Response (success):**
```json
{
  "valid": true,
  "follows": [
    {"id": 1, "email": "user1@example.com", "timestamp": "2026-01-01 12:00:00"}
  ]
}
```

---

### 11. getMyFollowers
Get current user's followers. Requires auth.

**Request:**
```json
{
  "action": "getMyFollowers"
}
```

**Response (success):**
```json
{
  "valid": true,
  "followers": [
    {"id": 1, "email": "user1@example.com", "timestamp": "2026-01-01 12:00:00"}
  ]
}
```

---

### 12. getUserInfo
Get a user's info. Requires auth.

**Request:**
```json
{
  "action": "getUserInfo",
  "userId": 1
}
```

**Response (success):**
```json
{
  "valid": true,
  "email": "user@example.com",
  "created_at": "2026-01-01 12:00:00"
}
```

---

### 13. getUserPosts
Get a user's posts. Requires auth.

**Request:**
```json
{
  "action": "getUserPosts",
  "userId": 1,
  "offset": 0,
  "limit": 25
}
```

**Response (success):**
```json
{
  "valid": true,
  "posts": [...],
  "hasMore": false,
  "totalCount": 1
}
```

---

### 14. likePost
Like a post. Requires auth.

**Request:**
```json
{
  "action": "likePost",
  "postId": "1.1776877398"
}
```

**Response (success):**
```json
{
  "valid": true,
  "liked": true
}
```

**Notes:**
- Cannot like your own post

---

### 15. unlikePost
Unlike a post. Requires auth.

**Request:**
```json
{
  "action": "unlikePost",
  "postId": "1.1776877398"
}
```

**Response (success):**
```json
{
  "valid": true,
  "liked": false
}
```

---

### 16. getPostLikes
Get likes on a post. Requires auth.

**Request:**
```json
{
  "action": "getPostLikes",
  "postId": "1.1776877398"
}
```

**Response (success):**
```json
{
  "valid": true,
  "likes": [
    {"userId": 1, "timestamp": "2026-01-01 12:00:00"}
  ]
}
```

---

### 17. deletePost
Delete a post. Requires auth.

**Request:**
```json
{
  "action": "deletePost",
  "postId": "26.1776877398"
}
```

**Response (success):**
```json
{
  "valid": true,
  "deleted": true
}
```

**Notes:**
- Can only delete your own posts

---

### 18. createComment
Create a comment on a post. Requires auth.

**Request:**
```json
{
  "action": "createComment",
  "postId": "1.1776877398",
  "text": "Great post!"
}
```

**Response (success):**
```json
{
  "valid": true,
  "commentId": 1
}
```

**Notes:**
- Same character restrictions as posts

---

### 19. getPostComments
Get comments on a post. Requires auth.

**Request:**
```json
{
  "action": "getPostComments",
  "postId": "1.1776877398",
  "offset": 0,
  "limit": 25
}
```

**Response (success):**
```json
{
  "valid": true,
  "comments": [
    {
      "id": 1,
      "post_id": "26.1776877398",
      "user_id": 1,
      "text": "Comment text",
      "created_at": "2026-01-01 12:00:00",
      "user_email": "user@example.com"
    }
  ],
  "hasMore": false,
  "totalCount": 1
}
```

---

### 20. deleteComment
Delete a comment. Requires auth.

**Request:**
```json
{
  "action": "deleteComment",
  "commentId": 1
}
```

**Response (success):**
```json
{
  "valid": true,
  "deleted": true
}
```

**Notes:**
- Can only delete your own comments

---

### 21. getPostCommentCounts
Get comment counts for multiple posts. Requires auth.

**Request:**
```json
{
  "action": "getPostCommentCounts",
  "postIds": "[\"26.1776877398\", \"1.1776877398\"]"
}
```

**Response (success):**
```json
{
  "valid": true,
  "counts": {
    "26.1776877398": 5,
    "1.1776877398": 2
  }
}
```

---

### 22. getUserEmails
Get emails for multiple users. Requires auth.

**Request:**
```json
{
  "action": "getUserEmails",
  "userIds": "[1, 2, 3]"
}
```

**Response (success):**
```json
{
  "valid": true,
  "emails": {
    "1": "user1@example.com",
    "2": "user2@example.com"
  }
}
```

---

### 23. fetchFollowedPosts
Get posts from followed users. Requires auth.

**Request:**
```json
{
  "action": "fetchFollowedPosts",
  "offset": 0,
  "limit": 25
}
```

**Response (success):**
```json
{
  "valid": true,
  "posts": [
    {
      "id": "123.1700000000",
      "text": "Post content",
      "timestamp": "2026-01-01 12:00:00",
      "likes": [...],
      "userID": 123,
      "userEmail": "user@example.com"
    }
  ],
  "hasMore": false,
  "totalCount": 1
}
```

**Notes:**
- Includes current user's own posts

---

### 24. getNotifications
Get notifications. Requires auth.

**Request:**
```json
{
  "action": "getNotifications",
  "offset": 0
}
```

**Response (success):**
```json
{
  "valid": true,
  "notifications": [
    {
      "id": 1,
      "recipient_id": 26,
      "actor_id": 1,
      "actor_email": "user@example.com",
      "type": "like",
      "post_id": "1.1700000000",
      "created_at": "2026-01-01 12:00:00"
    }
  ]
}
```

**Notification types:**
- `follow` - User followed you
- `unfollow` - User unfollowed you
- `like` - User liked your post
- `unlike` - User unliked your post
- `comment` - User commented on your post

---

### 25. deleteAccount
Delete current user's account. Requires auth.

**Request:**
```json
{
  "action": "deleteAccount",
  "password": "current_password"
}
```

**Response (success):**
```json
{
  "valid": true,
  "message": "Account deleted successfully"
}
```

---

## Password Reset Endpoints

### 26. sendOTP
Send OTP for password reset.

**Request:**
```json
{
  "action": "sendOTP",
  "email": "user@example.com"
}
```

**Response (success):**
```json
{
  "valid": true,
  "message": "OTP sent to your email. Check inbox/spam."
}
```

---

### 27. verifyOTP
Verify OTP for password reset.

**Request:**
```json
{
  "action": "verifyOTP",
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response (success):**
```json
{
  "valid": true,
  "message": "OTP verified! Set your new password."
}
```

---

### 28. resetPassword
Reset password after OTP verification.

**Request:**
```json
{
  "action": "resetPassword",
  "email": "user@example.com",
  "password": "NewPass123!",
  "confirm": "NewPass123!"
}
```

**Response (success):**
```json
{
  "valid": true,
  "message": "Password reset successful! Please log in."
}
```

---

## Registration Endpoints

### 29. sendRegisterOTP
Send OTP for registration.

**Request:**
```json
{
  "action": "sendRegisterOTP",
  "email": "newuser@example.com"
}
```

**Response (success):**
```json
{
  "valid": true,
  "message": "OTP sent to your email. Check inbox/spam."
}
```

---

### 30. verifyRegisterOTP
Verify OTP for registration.

**Request:**
```json
{
  "action": "verifyRegisterOTP",
  "email": "newuser@example.com",
  "otp": "123456"
}
```

**Response (success):**
```json
{
  "valid": true,
  "message": "OTP verified! Set your password."
}
```

---

### 31. finishRegister
Complete registration.

**Request:**
```json
{
  "action": "finishRegister",
  "email": "newuser@example.com",
  "password": "NewUser123!",
  "confirm": "NewUser123!"
}
```

**Password requirements:**
- 8-25 characters
- Must contain: lowercase, uppercase, number, symbol

**Response (success):**
```json
{
  "valid": true,
  "message": "Account created successfully!"
}
```

---

## Data Formats

### Post ID
Format: `userId.timestamp`
Example: `26.1776877398`

### Timestamps
Format: `YYYY-MM-DD HH:MM:SS`
Example: `2026-04-22 17:03:18`

### Allowed Characters
Posts and comments must only contain:
```
 !"#$'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~ÁÉÍÓÚÜÑáéíóúüñ¿¡«»
```

### Password Requirements
- 8-25 characters
- Must contain: lowercase, uppercase, number, symbol

---

## Example Usage

### Node.js
```javascript
const https = require('https');

function post(action, data, cookie) {
  return new Promise((resolve) => {
    const postData = Object.assign({ action }, data);
    const body = Object.keys(postData).map(k => k + '=' + encodeURIComponent(postData[k])).join('&');
    const options = { hostname: 'dev.davidfruin.com', path: '/api.php', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length } };
    if (cookie) options.headers['Cookie'] = cookie;
    let jwt = null;
    const req = https.request(options, res => {
      let d = '';
      if (res.headers['set-cookie']) {
        res.headers['set-cookie'].forEach(c => {
          if (c.startsWith('jwt=')) jwt = c.match(/jwt=([^;]+)/)[1];
        });
      }
      res.on('data', c => d += c);
      res.on('end', () => resolve({ data: JSON.parse(d), jwt }));
    });
    req.write(body); req.end();
  });
}

// Login
const { data, jwt } = await post('login', { email: 'user@example.com', password: 'password&特殊' });
console.log(data);

// Get posts with auth
const { data: posts } = await post('getMyPosts', { offset: 0, limit: 10 }, 'jwt=' + jwt);
console.log(posts);
```

### cURL
```bash
# Login
curl -s -X POST https://dev.davidfruin.com/api.php \
  -d "action=login" \
  -d "email=user@example.com" \
  -d "password=password" -c cookies.txt

# Get posts
curl -s -X POST https://dev.davidfruin.com/api.php \
  -d "action=getMyPosts" \
  -b cookies.txt
```

---

## Troubleshooting

### "attempt to write a readonly database"
Database file permissions need to be fixed:
```bash
chmod 666 userdata.db
```

### "Invalid email or password"
- Wrong credentials, or
- Password contains `&` and server doesn't have the parsing fix

### "Unauthorized"
- JWT cookie not sent or expired
- JWT token is invalid or tampered with