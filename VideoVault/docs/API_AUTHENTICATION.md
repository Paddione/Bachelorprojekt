# VideoVault API Authentication

VideoVault uses JWT (JSON Web Tokens) for authentication. Most administrative operations require an `ADMIN` role.

## JWT Acquisition

To acquire a JWT, you can use the login endpoint.

### Login

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "username": "admin",
  "password": "your_password"
}
```

**Example (curl):**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your_password"}'
```

**Response:**
```json
{
  "ok": true,
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1...",
    "refreshToken": "..."
  },
  "user": {
    "userId": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "ADMIN"
  }
}
```

## Using the Access Token

Include the access token in the `Authorization` header as a Bearer token for protected requests.

**Example (curl):**
```bash
curl -X GET http://localhost:5000/api/errors \
  -H "Authorization: Bearer <your_access_token>"
```

## Refreshing Tokens

**Endpoint:** `POST /api/auth/refresh` (if supported by the auth service)

In local development with the embedded auth service, tokens are typically sent as HTTP-only cookies if the request is made from a browser with `credentials: 'include'`.
