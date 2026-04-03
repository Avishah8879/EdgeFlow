# Tiphub Authentication System - Complete Setup Guide

> **Last Updated:** November 2025
> **System Status:** ✅ Production-ready and fully tested
> **Documentation Type:** Setup, Configuration, and Troubleshooting Guide

## Table of Contents

- [Overview](#overview)
- [Quick Start (5 Minutes)](#quick-start-5-minutes)
- [System Architecture](#system-architecture)
- [Detailed Setup Instructions](#detailed-setup-instructions)
  - [1. Environment Configuration](#1-environment-configuration)
  - [2. Database Migration](#2-database-migration)
  - [3. Server Startup](#3-server-startup)
  - [4. Testing Endpoints](#4-testing-endpoints)
- [Google OAuth Setup](#google-oauth-setup)
  - [Google Cloud Console Configuration](#google-cloud-console-configuration)
  - [Environment Variables](#environment-variables-for-oauth)
  - [OAuth Flow Walkthrough](#oauth-flow-walkthrough)
  - [Testing OAuth](#testing-oauth)
- [API Reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Security Features](#security-features)
- [Production Deployment](#production-deployment)

---

## Overview

Tiphub uses a **V2 authentication system** with the following features:

### 🔐 Core Features

- **Password Authentication**: Bcrypt hashing (cost factor 12) + JWT tokens
- **Google OAuth 2.0**: Seamless integration with Passport.js
- **Session Management**: Database-backed JWT with server-side revocation
- **Security**: Rate limiting, account lockout, audit logging
- **Account Linking**: Link Google accounts to existing password accounts

### 📊 Technical Stack

- **Database**: PostgreSQL (Tiphub_auth @ ***REMOVED***:5432)
- **Token System**: JWT (6h access + 7d refresh)
- **Password Hashing**: bcrypt (cost: 12)
- **OAuth Provider**: Google OAuth 2.0 via Passport.js
- **Rate Limiting**: Express rate limiter

### 🔄 Parallel V1 System

Legacy file-based authentication (SHA-256) is maintained for backward compatibility at `/auth/signup` and `/auth/login`. **Use V2 routes (`/auth/v2/*`) for all new features.**

---

## Quick Start (5 Minutes)

For experienced developers who want to get up and running quickly:

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output and paste as JWT_SECRET in .env

# 3. Configure database (use provided values or your own)
# Edit .env:
AUTH_DB_HOST=***REMOVED***
AUTH_DB_PORT=5432
AUTH_DB_NAME=Tiphub_auth
AUTH_DB_USER=postgres
AUTH_DB_PASSWORD=***REMOVED***

# 4. Run database migration
npm run db:migrate

# 5. Start server
npm run dev
```

**Verification:**
```bash
# Check auth database connection
# Server logs should show: "[AUTH_DB] Connection test successful"

# Test signup endpoint
curl -X POST http://localhost:5000/auth/v2/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"SecurePass123!","name":"Test User"}'

# Should return 201 with JWT tokens
```

**Common Gotchas:**
- ⚠️ JWT_SECRET must be at least 32 characters (use the generation command)
- ⚠️ Password must have 8+ chars, uppercase, lowercase, number, and special character
- ⚠️ Port 5000 must be available (kill existing process if needed)
- ⚠️ Google OAuth requires redirect URI in Google Cloud Console

---

## System Architecture

### Authentication Flow Diagram

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │
       │ 1. POST /auth/v2/signup or /auth/v2/login
       ↓
┌─────────────────────────────────────┐
│   Node.js Backend (Port 5000)       │
│  ┌──────────────────────────────┐   │
│  │  routes-auth-v2.ts           │   │
│  │  - Validates input           │   │
│  │  - Checks rate limits        │   │
│  └────────┬─────────────────────┘   │
│           │                          │
│           ↓                          │
│  ┌──────────────────────────────┐   │
│  │  password-bcrypt.ts          │   │
│  │  - Hash password (cost: 12)  │   │
│  │  - Verify password           │   │
│  └────────┬─────────────────────┘   │
│           │                          │
│           ↓                          │
│  ┌──────────────────────────────┐   │
│  │  store-v2.ts                 │   │
│  │  - Create/find user in DB    │   │
│  │  - Update login tracking     │   │
│  │  - Check account lockout     │   │
│  └────────┬─────────────────────┘   │
│           │                          │
│           ↓                          │
│  ┌──────────────────────────────┐   │
│  │  jwt.ts + session-jwt.ts     │   │
│  │  - Generate access token     │   │
│  │  - Generate refresh token    │   │
│  │  - Store session in DB       │   │
│  └────────┬─────────────────────┘   │
│           │                          │
└───────────┼──────────────────────────┘
            │
            │ 2. Return JWT tokens
            ↓
     ┌──────────────┐
     │  PostgreSQL  │
     │ Tiphub_auth  │
     │              │
     │ • users      │
     │ • sessions   │
     │ • auth_logs  │
     └──────────────┘
```

### Google OAuth Flow

```
1. User clicks "Sign in with Google"
   ↓
2. Frontend navigates to: /auth/google
   ↓
3. Backend redirects to: Google consent screen
   ↓
4. User grants permissions
   ↓
5. Google redirects to: /auth/google/callback?code=...
   ↓
6. Backend exchanges code for user profile
   ↓
7. Backend creates/links user in database
   ↓
8. Backend generates JWT session
   ↓
9. Backend redirects to: /auth/callback?token=...&refreshToken=...
   ↓
10. Frontend stores session in localStorage
    ↓
11. User is logged in ✅
```

### File Structure

```
server/
├── auth/
│   ├── password-bcrypt.ts      # Bcrypt password hashing (NEW)
│   ├── jwt.ts                  # JWT token generation/verification
│   ├── store-v2.ts             # Database user management (NEW)
│   ├── session-jwt.ts          # JWT + session database integration
│   └── oauth-google.ts         # Google OAuth Passport.js strategy
├── db/
│   ├── auth-connection.ts      # Tiphub_auth database pool
│   └── migrate.ts              # Migration runner
├── middleware/
│   ├── auth.ts                 # JWT verification middleware
│   └── rate-limit.ts           # Rate limiting
├── migrations/
│   └── 004_create_auth_tables.sql  # Database schema (4 tables)
├── routes-auth-v2.ts           # /auth/v2/* routes (NEW)
└── routes-oauth-google.ts      # Google OAuth routes

client/
└── src/
    ├── contexts/
    │   └── AuthContext.tsx     # React auth context (updated)
    └── lib/
        └── auth-fetch.ts       # Fetch interceptor with token refresh
```

### Database Tables

**1. `users`** - User accounts (password + OAuth)
- Fields: id, email, username, password_hash, google_id, provider, tier, is_active, email_verified, login tracking, account lockout
- 17 columns, 7 indexes
- Supports both password and OAuth users via `provider` field

**2. `sessions`** - JWT session tracking
- Fields: id, user_id, token_hash, refresh_token_hash, device_info, ip_address, issued_at, expires_at, revoked
- Enables server-side token revocation (logout)
- Multi-device session support

**3. `auth_logs`** - Security audit trail
- Fields: id, user_id, event_type, provider, ip_address, user_agent, success, failure_reason, metadata (JSONB)
- Complete audit trail for compliance
- Tracks: signup, login, logout, failed_login, account_locked, token_refresh

**4. `oauth_accounts`** - OAuth provider linking
- Fields: id, user_id, provider, provider_user_id, access_token, refresh_token, profile_data
- Supports multiple OAuth providers per user
- Account linking by email

---

## Detailed Setup Instructions

### 1. Environment Configuration

#### Step 1.1: Create Environment File

```bash
# Copy the example file
cp .env.example .env
```

#### Step 1.2: Configure Authentication Variables

Edit `.env` and add/update the following:

```bash
# ==========================================
# AUTHENTICATION DATABASE (V2) - REQUIRED
# ==========================================

# Auth Database Connection
AUTH_DB_HOST=***REMOVED***
AUTH_DB_PORT=5432
AUTH_DB_NAME=Tiphub_auth
AUTH_DB_USER=postgres
AUTH_DB_PASSWORD=***REMOVED***

# JWT Configuration
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=<your-generated-secret-here>
JWT_ACCESS_EXPIRY=6h
JWT_REFRESH_EXPIRY=7d

# Google OAuth (Optional - see Google OAuth Setup section)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback

# CORS Configuration
CORS_ORIGINS=http://localhost:5173,http://localhost:5000

# Frontend URLs
VITE_AUTH_BASE_URL=http://localhost:5000
VITE_GRADIO_BASE_URL=http://localhost:7860

# Legacy (V1 - Deprecated, kept for backward compatibility)
AUTH_SALT=tiphub-demo-salt
```

#### Step 1.3: Generate Secure JWT Secret

**IMPORTANT:** Never use a hardcoded JWT secret in production!

```bash
# Generate a cryptographically secure random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Example output: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

Copy the output and paste it as the value for `JWT_SECRET` in your `.env` file.

**Why 32 bytes?**
- 32 bytes = 256 bits of entropy
- Prevents brute force attacks on JWT signatures
- Industry standard for HMAC-SHA256

#### Step 1.4: Verify Environment Variables

```bash
# Check if variables are loaded (development)
echo $JWT_SECRET  # Should show your secret

# Or use Node.js
node -e "require('dotenv').config(); console.log(process.env.JWT_SECRET ? 'Set' : 'NOT SET')"
```

---

### 2. Database Migration

The authentication system requires 4 database tables. The migration creates them automatically.

#### Step 2.1: Verify Database Access

```bash
# Test connection to auth database
psql -h ***REMOVED*** -U postgres -d Tiphub_auth -c "SELECT NOW();"

# If successful, you'll see current timestamp
```

If connection fails:
- Check if database server is reachable
- Verify credentials in `.env`
- Check firewall allows port 5432

#### Step 2.2: Run Migration

```bash
# Using npm script (recommended)
npm run db:migrate

# Or directly with tsx
npx tsx server/db/migrate.ts
```

**Expected Output:**
```
[MIGRATE] Loaded environment from: .env
[MIGRATE] Testing auth database connection...
[MIGRATE] ✓ Auth database connected successfully
[MIGRATE] Running migration: 004_create_auth_tables.sql
[MIGRATE] Migration 004_create_auth_tables.sql completed successfully
[MIGRATE] ✓ All migrations completed
```

#### Step 2.3: Verify Migration Success

```bash
# Connect to database
psql -h ***REMOVED*** -U postgres -d Tiphub_auth

# List tables
\dt

# Should show:
#  users
#  sessions
#  auth_logs
#  oauth_accounts
#  migration_history

# Check migration history
SELECT * FROM migration_history ORDER BY executed_at DESC;

# Exit psql
\q
```

#### What Gets Created

**Tables:**
- `users` - 17 columns, 7 indexes
- `sessions` - 14 columns, 6 indexes
- `auth_logs` - 9 columns, 6 indexes
- `oauth_accounts` - 10 columns, 3 indexes
- `migration_history` - Tracks applied migrations

**Views:**
- `active_sessions` - Monitor currently active user sessions
- `recent_auth_events` - Last 1000 auth events
- `user_stats` - User count by provider and tier

**Indexes:** 24 total for optimal query performance

#### Troubleshooting Migration

**Issue: "Migration already applied"**
```sql
-- Check migration history
SELECT * FROM migration_history WHERE migration_name = '004_create_auth_tables.sql';

-- If exists, skip (already applied)
-- If you need to rerun: DELETE FROM migration_history WHERE id = <id>;
```

**Issue: "Table already exists"**
```sql
-- Drop all auth tables (⚠️ DESTROYS DATA)
DROP TABLE IF EXISTS oauth_accounts, auth_logs, sessions, users, migration_history CASCADE;

-- Then rerun migration
npm run db:migrate
```

---

### 3. Server Startup

#### Step 3.1: Install Dependencies

```bash
# Install all packages (if not already done)
npm install

# Verify auth packages are installed
npm list bcrypt jsonwebtoken pg passport passport-google-oauth20
```

All required packages are already in `package.json`:
- `bcrypt` (v6.0.0) - Password hashing
- `jsonwebtoken` (v9.0.2) - JWT tokens
- `pg` (v8.16.3) - PostgreSQL client
- `passport` (v0.7.0) - Authentication framework
- `passport-google-oauth20` (v2.0.0) - Google OAuth strategy
- `express-rate-limit` (v8.2.1) - Rate limiting

#### Step 3.2: Start Development Server

```bash
# Start Node.js backend (port 5000)
npm run dev
```

**Expected Console Output:**
```
[ENV] Loaded environment from: .env
[AUTH_DB] Testing connection to Tiphub_auth database...
[AUTH_DB] ✓ Connection test successful
[OAUTH_GOOGLE] ✓ Google OAuth configured
[OAUTH_GOOGLE] Client ID: 123456789...
[OAUTH_GOOGLE] Callback URL: http://localhost:5000/auth/google/callback
[AUTH] V2 authentication routes mounted at /auth/v2/*
[AUTH] Google OAuth routes mounted at /auth/google
[SERVER] Node backend listening on port 5000
```

#### Step 3.3: Start Python Backend (Optional)

If you're using the full Tiphub application:

```bash
# In a separate terminal
npm run dev:python
# Or: uvicorn main:app --reload --port 7860
```

#### Step 3.4: Verify Server is Running

```bash
# Check if Node backend is responding
curl http://localhost:5000/health
# Should return: {"status":"ok"}

# Check if auth routes are mounted
curl http://localhost:5000/auth/google/status
# Should return: {"available":true/false,"provider":"google",...}
```

---

### 4. Testing Endpoints

Test all authentication endpoints to ensure everything works.

#### Test 4.1: Signup (Create New Account)

**Valid Signup:**
```bash
curl -X POST http://localhost:5000/auth/v2/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "SecurePass123!",
    "name": "Test User",
    "tier": "basic"
  }'
```

**Expected Response (201 Created):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "issuedAt": "2025-11-26T10:00:00.000Z",
  "expiresAt": "2025-11-26T16:00:00.000Z",
  "user": {
    "id": "uuid-here",
    "email": "test@example.com",
    "username": "testuser",
    "name": "Test User",
    "avatarUrl": null,
    "provider": "password",
    "tier": "basic",
    "emailVerified": false,
    "createdAt": "2025-11-26T10:00:00.000Z"
  }
}
```

**Verify in Database:**
```sql
-- Connect to database
psql -h ***REMOVED*** -U postgres -d Tiphub_auth

-- Check user was created
SELECT id, email, username, provider, tier FROM users WHERE email = 'test@example.com';

-- Check session was created
SELECT user_id, issued_at, expires_at, revoked FROM sessions
WHERE user_id = (SELECT id FROM users WHERE email = 'test@example.com');

-- Check auth log
SELECT event_type, success, provider FROM auth_logs
WHERE user_id = (SELECT id FROM users WHERE email = 'test@example.com')
ORDER BY created_at DESC LIMIT 1;
```

**Test Invalid Inputs:**

```bash
# Invalid email format
curl -X POST http://localhost:5000/auth/v2/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid-email","username":"test","password":"SecurePass123!"}'
# Expected: 400 - "Invalid email format"

# Weak password
curl -X POST http://localhost:5000/auth/v2/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test2@example.com","username":"test2","password":"weak"}'
# Expected: 400 - "Password must be at least 8 characters long"

# Duplicate email
curl -X POST http://localhost:5000/auth/v2/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser2","password":"SecurePass123!"}'
# Expected: 409 - "An account with this email already exists"
```

**Password Requirements:**
- ✅ Minimum 8 characters
- ✅ At least one uppercase letter (A-Z)
- ✅ At least one lowercase letter (a-z)
- ✅ At least one number (0-9)
- ✅ At least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)

#### Test 4.2: Login (Existing Account)

**Login with Email:**
```bash
curl -X POST http://localhost:5000/auth/v2/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "test@example.com",
    "password": "SecurePass123!"
  }'
```

**Login with Username:**
```bash
curl -X POST http://localhost:5000/auth/v2/login \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "testuser",
    "password": "SecurePass123!"
  }'
```

**Expected Response (200 OK):**
Same format as signup response with new tokens.

**Verify Login Tracking:**
```sql
SELECT
  email,
  login_count,
  last_login_at,
  failed_login_attempts
FROM users
WHERE email = 'test@example.com';

-- login_count should increment
-- last_login_at should be recent
-- failed_login_attempts should be 0
```

#### Test 4.3: Get Current User

```bash
# Save token from login response
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Get user profile
curl -X GET http://localhost:5000/auth/v2/me \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "id": "uuid-here",
  "email": "test@example.com",
  "username": "testuser",
  "name": "Test User",
  "avatarUrl": null,
  "provider": "password",
  "tier": "basic",
  "emailVerified": false,
  "lastLoginAt": "2025-11-26T10:00:00.000Z",
  "loginCount": 2,
  "createdAt": "2025-11-26T10:00:00.000Z"
}
```

#### Test 4.4: Token Refresh

```bash
# Save refresh token from login response
REFRESH_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Refresh access token
curl -X POST http://localhost:5000/auth/v2/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}"
```

**Expected Response (200 OK):**
New token pair (both access and refresh tokens are rotated).

#### Test 4.5: Logout

```bash
# Logout (revokes session)
curl -X POST http://localhost:5000/auth/v2/logout \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

**Verify Session Revoked:**
```sql
-- Check session is marked as revoked
SELECT revoked, revoked_at, revocation_reason
FROM sessions
WHERE token_hash = '<SHA256 hash of token>';

-- Should show: revoked=true, revoked_at=NOW(), revocation_reason='logout'
```

**Test Using Revoked Token:**
```bash
# Try to use the same token after logout
curl -X GET http://localhost:5000/auth/v2/me \
  -H "Authorization: Bearer $TOKEN"

# Expected: 401 - "Session not found or has been revoked"
```

---

## Google OAuth Setup

Complete step-by-step guide for setting up Google OAuth authentication.

### Prerequisites

- Google account
- Access to [Google Cloud Console](https://console.cloud.google.com)
- Basic understanding of OAuth 2.0 flow

### Google Cloud Console Configuration

#### Step 1: Create Google Cloud Project

1. **Navigate to Google Cloud Console**
   - Go to https://console.cloud.google.com
   - Sign in with your Google account

2. **Create New Project**
   - Click the project selector dropdown (top-left, next to "Google Cloud")
   - Click "NEW PROJECT"
   - Project name: `Tiphub` (or your preferred name)
   - Organization: Leave blank (or select if applicable)
   - Click "CREATE"
   - Wait 1-2 minutes for project creation

3. **Select Your Project**
   - Click the project selector again
   - Select "Tiphub" from the list
   - Verify project name appears in top bar

#### Step 2: Enable Required APIs

1. **Navigate to APIs & Services**
   - From left menu: "APIs & Services" → "Library"
   - Or use search: "API Library"

2. **Enable Google+ API**
   - Search for "Google+ API"
   - Click on it
   - Click "ENABLE"
   - Wait for confirmation

3. **Enable OAuth 2.0 (Usually Auto-Enabled)**
   - OAuth 2.0 API is typically enabled automatically
   - No action needed

#### Step 3: Configure OAuth Consent Screen

**IMPORTANT:** You must configure the consent screen before creating credentials.

1. **Navigate to Consent Screen**
   - Left menu: "APIs & Services" → "OAuth consent screen"

2. **Choose User Type**
   - Select "**External**" (allows any Google account to sign in)
   - Click "CREATE"

3. **Configure App Information**

   **OAuth consent screen (Page 1 of 4):**
   - **App name:** `Tiphub`
   - **User support email:** `your-email@gmail.com`
   - **App logo:** (Optional) Upload Tiphub logo
   - **Application home page:** (Optional) `http://localhost:5000`
   - **Application privacy policy link:** (Optional) Leave blank for development
   - **Application terms of service link:** (Optional) Leave blank for development
   - **Authorized domains:** (Leave blank for localhost development)
   - **Developer contact information:** `your-email@gmail.com`
   - Click "SAVE AND CONTINUE"

4. **Add Scopes (Page 2 of 4)**
   - Click "ADD OR REMOVE SCOPES"
   - Search and select these scopes:
     - ✅ `.../auth/userinfo.email` - See your email address
     - ✅ `.../auth/userinfo.profile` - See your personal info (name, picture)
   - Click "UPDATE"
   - Click "SAVE AND CONTINUE"

5. **Add Test Users (Page 3 of 4)**
   - Click "ADD USERS"
   - Enter your Google account email(s)
   - This allows you to test OAuth before publishing the app
   - Click "ADD"
   - Click "SAVE AND CONTINUE"

6. **Summary (Page 4 of 4)**
   - Review all settings
   - Click "BACK TO DASHBOARD"

#### Step 4: Create OAuth 2.0 Credentials

1. **Navigate to Credentials**
   - Left menu: "APIs & Services" → "Credentials"

2. **Create Credentials**
   - Click "+ CREATE CREDENTIALS"
   - Select "OAuth client ID"

3. **Select Application Type**
   - Application type: **"Web application"**

4. **Configure OAuth Client**
   - **Name:** `Tiphub Web Client`

   **Authorized JavaScript origins:**
   ```
   http://localhost:5000
   http://localhost:5173
   ```

   **Authorized redirect URIs:**
   ```
   http://localhost:5000/auth/google/callback
   ```

   **For Production/Remote Testing (add these later):**
   ```
   https://your-domain.com/auth/google/callback
   https://your-ngrok-tunnel.ngrok-free.app/auth/google/callback
   ```

   **⚠️ IMPORTANT:** Redirect URI must exactly match your backend URL. No trailing slashes!

5. **Create Client**
   - Click "CREATE"

6. **Copy Credentials**
   - A dialog appears with your credentials
   - **Client ID:** `123456789012-abcdefghijklmnop.apps.googleusercontent.com`
   - **Client secret:** `GOCSPX-AbCdEfGhIjKlMnOpQrStUvWxYz`
   - Click "DOWNLOAD JSON" (optional, for backup)
   - Click "OK"

**✅ SAVE THESE CREDENTIALS!** You'll need them in the next step.

---

### Environment Variables for OAuth

#### Step 1: Add OAuth Credentials to .env

Edit your `.env` file and add the Google OAuth credentials:

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-AbCdEfGhIjKlMnOpQrStUvWxYz
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback
```

#### Step 2: Restart Server

```bash
# Stop the server (Ctrl+C)
# Restart to load new environment variables
npm run dev
```

#### Step 3: Verify OAuth Configuration

```bash
# Check OAuth status endpoint
curl http://localhost:5000/auth/google/status
```

**Expected Response (Configured):**
```json
{
  "available": true,
  "provider": "google",
  "message": "Google OAuth is configured and available"
}
```

**If Not Configured:**
```json
{
  "available": false,
  "provider": "google",
  "message": "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment."
}
```

**Check Server Logs:**
```
[OAUTH_GOOGLE] ✓ Google OAuth configured
[OAUTH_GOOGLE] Client ID: 123456789012...
[OAUTH_GOOGLE] Callback URL: http://localhost:5000/auth/google/callback
```

---

### OAuth Flow Walkthrough

#### Step-by-Step User Journey

**1. User Clicks "Sign in with Google"**
   - Frontend button navigates to: `/auth/google`

**2. Backend Initiates OAuth**
   - Server receives request at `/auth/google`
   - Redirects to Google consent screen

**3. Google Consent Screen**
   - URL: `https://accounts.google.com/o/oauth2/v2/auth?...`
   - User sees: "Tiphub wants to access your Google Account"
   - Requested permissions:
     - ✅ View your email address
     - ✅ View your basic profile info
   - User clicks "Allow"

**4. Google Redirects to Callback**
   - URL: `/auth/google/callback?code=4/0AbCdEfG...&state=xyz`
   - Backend receives authorization code

**5. Backend Exchanges Code for Profile**
   - Backend calls Google API with code
   - Receives user profile:
     - `id`: Google user ID
     - `email`: User's email
     - `name`: User's name
     - `picture`: Profile picture URL

**6. Backend Creates/Links User**
   - **New User:** Creates account with `provider='google'`
   - **Existing Email:** Links Google ID to existing account
   - **Already Linked:** Logs in existing user

**7. Backend Generates JWT Session**
   - Creates access token (6h expiry)
   - Creates refresh token (7d expiry)
   - Stores session in database

**8. Backend Redirects to Frontend**
   - URL: `/auth/callback?token=<JWT>&refreshToken=<JWT>&profile=<base64>`
   - Profile is base64-encoded user object

**9. Frontend Handles Callback**
   - Extracts tokens from URL
   - Decodes profile
   - Stores session in localStorage
   - Updates AuthContext
   - Redirects to dashboard

**10. User is Logged In ✅**
   - All API calls include `Authorization: Bearer <token>`
   - Token automatically refreshes on expiry

---

### Testing OAuth

#### Test 1: Manual Browser Flow

1. **Open Browser**
   ```
   http://localhost:5000/auth/google
   ```

2. **Select Google Account**
   - Choose your test account (must be in test users list)

3. **Grant Permissions**
   - Click "Allow"

4. **Verify Redirect**
   - You should be redirected to:
     ```
     http://localhost:5173/auth/callback?token=...&refreshToken=...&profile=...
     ```
   - Frontend should store session and redirect to dashboard

#### Test 2: Verify User Created

```sql
-- Check user in database
SELECT
  id,
  email,
  username,
  provider,
  google_id,
  email_verified,
  avatar_url
FROM users
WHERE email = 'your-test-email@gmail.com';

-- Should show:
-- provider = 'google'
-- google_id populated
-- email_verified = true (Google emails always verified)
-- avatar_url = Google profile picture
```

#### Test 3: Account Linking

**Scenario:** User has password account, then signs in with Google.

1. **Create Password Account First**
   ```bash
   curl -X POST http://localhost:5000/auth/v2/signup \
     -H "Content-Type: application/json" \
     -d '{
       "email": "your-test-email@gmail.com",
       "username": "testuser",
       "password": "SecurePass123!"
     }'
   ```

2. **Sign in with Google**
   - Use the same email
   - Backend automatically links accounts

3. **Verify Linking**
   ```sql
   SELECT
     email,
     username,
     provider,
     password_hash IS NOT NULL as has_password,
     google_id IS NOT NULL as has_google_id
   FROM users
   WHERE email = 'your-test-email@gmail.com';

   -- Should show:
   -- has_password = true
   -- has_google_id = true
   -- User can now sign in with either method!
   ```

---

## API Reference

Complete API endpoint documentation for V2 authentication.

### Password Authentication Endpoints

#### POST /auth/v2/signup

Create a new user account with email/password.

**Request:**
```http
POST /auth/v2/signup HTTP/1.1
Host: localhost:5000
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "username",
  "password": "SecurePass123!",
  "name": "User Name",  // Optional
  "tier": "basic"       // Optional: 'basic' or 'premium'
}
```

**Response (201 Created):**
```json
{
  "token": "eyJhbGci...",
  "refreshToken": "eyJhbGci...",
  "issuedAt": "2025-11-26T10:00:00.000Z",
  "expiresAt": "2025-11-26T16:00:00.000Z",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "username",
    "name": "User Name",
    "avatarUrl": null,
    "provider": "password",
    "tier": "basic",
    "emailVerified": false
  }
}
```

**Rate Limiting:** 3 signups per hour per IP

**Error Responses:**
- `400` - Invalid input (email format, weak password, username too short)
- `409` - Email or username already exists
- `429` - Rate limit exceeded

---

#### POST /auth/v2/login

Authenticate with email/username and password.

**Request:**
```http
POST /auth/v2/login HTTP/1.1
Host: localhost:5000
Content-Type: application/json

{
  "identifier": "user@example.com",  // Email or username
  "password": "SecurePass123!"
}
```

**Response (200 OK):**
Same format as signup response.

**Rate Limiting:** 5 attempts per 15 minutes per IP

**Error Responses:**
- `400` - Missing credentials
- `401` - Invalid credentials (4 attempts remaining)
- `423` - Account locked (5 failed attempts)
- `403` - Account deactivated
- `429` - Rate limit exceeded

**Account Lockout:**
- After 5 failed attempts, account is locked for 30 minutes
- `locked_until` field is set in database
- Error message: "Account locked due to multiple failed login attempts. Please try again in 30 minutes."

---

#### POST /auth/v2/logout

Revoke the current session.

**Request:**
```http
POST /auth/v2/logout HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGci...
```

**Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

**Effect:**
- Session marked as revoked in database
- Token cannot be used for further requests
- Auth log entry created

---

#### POST /auth/v2/refresh

Refresh access token using refresh token.

**Request:**
```http
POST /auth/v2/refresh HTTP/1.1
Host: localhost:5000
Content-Type: application/json

{
  "refreshToken": "eyJhbGci..."
}
```

**Response (200 OK):**
New token pair (both tokens are rotated).

**Rate Limiting:** 20 refreshes per hour per IP

**Error Responses:**
- `400` - Refresh token required
- `401` - Invalid or expired refresh token
- `403` - Account deactivated
- `429` - Rate limit exceeded

---

#### GET /auth/v2/me

Get current authenticated user profile.

**Request:**
```http
GET /auth/v2/me HTTP/1.1
Host: localhost:5000
Authorization: Bearer eyJhbGci...
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "username",
  "name": "User Name",
  "avatarUrl": "https://...",
  "provider": "password",
  "tier": "basic",
  "emailVerified": false,
  "lastLoginAt": "2025-11-26T10:00:00.000Z",
  "loginCount": 5,
  "createdAt": "2025-11-25T10:00:00.000Z"
}
```

**Error Responses:**
- `401` - Token missing, invalid, expired, or revoked

---

### Google OAuth Endpoints

#### GET /auth/google

Initiate Google OAuth flow.

**Request:**
```http
GET /auth/google HTTP/1.1
Host: localhost:5000
```

**Response:**
Redirects to Google consent screen.

---

#### GET /auth/google/callback

OAuth callback endpoint (handled by Google).

**Request:**
```http
GET /auth/google/callback?code=4/0AbCdE...&state=xyz HTTP/1.1
Host: localhost:5000
```

**Response:**
Redirects to frontend with tokens:
```
http://localhost:5173/auth/callback?token=...&refreshToken=...&profile=...
```

**Rate Limiting:** 10 callbacks per 5 minutes per IP

---

#### GET /auth/google/status

Check if Google OAuth is configured.

**Request:**
```http
GET /auth/google/status HTTP/1.1
Host: localhost:5000
```

**Response (200 OK):**
```json
{
  "available": true,
  "provider": "google",
  "message": "Google OAuth is configured and available"
}
```

---

## Troubleshooting

Common issues and solutions.

### Configuration Issues

#### Issue 1: "JWT_SECRET not set" Warning

**Symptom:**
```
[JWT] ⚠️  WARNING: Using default JWT secret. Set JWT_SECRET in environment!
```

**Cause:** JWT_SECRET environment variable is missing or empty.

**Solution:**
```bash
# Generate a secure secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
JWT_SECRET=<your-generated-secret>

# Restart server
npm run dev
```

---

#### Issue 2: Database Connection Failed

**Symptom:**
```
Error: connect ECONNREFUSED ***REMOVED***:5432
[AUTH_DB] ✗ Connection test failed
```

**Causes:**
1. Database server is down
2. Incorrect credentials
3. Firewall blocking port 5432
4. Wrong database name

**Solution:**
```bash
# Test connection manually
psql -h ***REMOVED*** -U postgres -d Tiphub_auth -c "SELECT NOW();"

# If fails, check:
# 1. Credentials in .env
# 2. Database exists: psql -h ***REMOVED*** -U postgres -l | grep Tiphub_auth
# 3. Firewall allows port 5432
# 4. Server is running: pg_isready -h ***REMOVED***
```

---

#### Issue 3: Google OAuth Not Configured

**Symptom:**
```json
{
  "available": false,
  "message": "Google OAuth is not configured..."
}
```

**Solution:**
1. Check `.env` has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
2. Verify credentials are correct (no quotes, spaces, or newlines)
3. Restart server: `npm run dev`
4. Check logs for OAuth configuration message

---

#### Issue 4: "redirect_uri_mismatch" Error

**Symptom:**
```
Error 400: redirect_uri_mismatch
The redirect URI in the request: http://localhost:5000/auth/google/callback does not match the ones authorized for the OAuth client.
```

**Cause:** Redirect URI not added to Google Cloud Console.

**Solution:**
1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
2. Click on your OAuth 2.0 Client ID
3. Scroll to "Authorized redirect URIs"
4. Click "+ ADD URI"
5. Enter exactly: `http://localhost:5000/auth/google/callback`
6. Click "SAVE"
7. Wait 30 seconds for changes to propagate
8. Try OAuth flow again

**Common Mistakes:**
- ❌ `http://localhost:5000/auth/google/callback/` (trailing slash)
- ❌ `https://localhost:5000/auth/google/callback` (https instead of http)
- ❌ `http://localhost:5001/auth/google/callback` (wrong port)
- ✅ `http://localhost:5000/auth/google/callback` (correct)

---

### Authentication Errors

#### Issue 5: Invalid Password

**Symptom:**
```json
{
  "message": "Invalid credentials. 4 attempts remaining before account lockout."
}
```

**Solution:**
- Check password is correct
- Check caps lock is off
- After 5 failed attempts, account locks for 30 minutes

**Unlock Account:**
```sql
-- Check if account is locked
SELECT email, locked_until, failed_login_attempts
FROM users WHERE email = 'user@example.com';

-- Unlock immediately (for testing)
UPDATE users
SET locked_until = NULL, failed_login_attempts = 0
WHERE email = 'user@example.com';
```

---

#### Issue 6: "Password must contain..." Validation Errors

**Symptom:**
```json
{
  "message": "Password must contain at least one uppercase letter"
}
```

**Password Requirements:**
- ✅ Minimum 8 characters
- ✅ At least one uppercase letter (A-Z)
- ✅ At least one lowercase letter (a-z)
- ✅ At least one number (0-9)
- ✅ At least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)

**Valid Examples:**
- `SecurePass123!`
- `MyPassword@2025`
- `TestPass#99abc`

**Invalid Examples:**
- `password` (no uppercase, no number, no special)
- `Password` (no number, no special)
- `Password1` (no special)
- `Pass!` (too short)

---

#### Issue 7: "Session not found or has been revoked"

**Symptom:**
```json
{
  "message": "Session not found or has been revoked",
  "code": "SESSION_REVOKED"
}
```

**Causes:**
1. Token was logged out (session revoked)
2. Session doesn't exist in database
3. Session expired

**Solution:**
1. Log in again to get new token
2. Check if logout was called
3. Verify session in database:
```sql
SELECT token_hash, revoked, expires_at
FROM sessions
WHERE user_id = '<user-id>'
ORDER BY issued_at DESC
LIMIT 5;
```

---

### Frontend Issues

#### Issue 8: Login Success but Still Shows "Not Authenticated"

**Symptoms:**
- Login returns 200 with tokens
- Frontend briefly shows logged in
- Reverts to logged out state

**Causes:**
1. Session not persisting to localStorage
2. AuthContext not updating
3. Token not being attached to requests

**Debug Steps:**
```javascript
// 1. Check localStorage (browser console)
localStorage.getItem('auth-session')
// Should return: {"token":"...","refreshToken":"...","user":{...}}

// 2. Check if token is in Authorization header
// Open DevTools > Network tab > any API call > Headers
// Should see: Authorization: Bearer <token>

// 3. Manually test token
const session = JSON.parse(localStorage.getItem('auth-session'));
fetch('http://localhost:5000/auth/v2/me', {
  headers: { 'Authorization': `Bearer ${session.token}` }
})
.then(r => r.json())
.then(console.log);
// Should return user data
```

**Solution:**
- Clear localStorage: `localStorage.clear()`
- Hard refresh: Ctrl+Shift+R
- Check AuthContext is properly wrapped around app
- Verify auth-fetch interceptor is initialized

---

## Security Features

Overview of security mechanisms in the V2 authentication system.

### 1. Password Security

**Bcrypt Hashing**
- Algorithm: bcrypt
- Cost factor: 12 (2^12 = 4096 iterations)
- Salt: Automatically generated per password
- Comparison: Timing-attack safe

**Why Bcrypt over SHA-256?**
- SHA-256 is too fast (designed for speed, not security)
- Bcrypt is intentionally slow (prevents brute force)
- Bcrypt has built-in salt (no separate salt management)
- Cost factor can increase as hardware improves

**Password Strength Validation**
- Minimum 8 characters (prevents weak passwords)
- Complexity requirements (uppercase, lowercase, number, special)
- Maximum 72 characters (bcrypt limit)

---

### 2. JWT Token Security

**Token Structure**
- Algorithm: HMAC-SHA256
- Access token expiry: 6 hours
- Refresh token expiry: 7 days
- Payload includes: userId, email, username, tier, provider

**Why 6h/7d Expiry?**
- 6h access: Balance between security and UX
- 7d refresh: User doesn't re-login every 6 hours
- Both tokens rotate on refresh (prevents token reuse)

**Server-Side Session Tracking**
- JWT tokens are stored in database (hashed)
- Enables logout (revoke session)
- Tracks device info and IP
- Multi-device support

**Token Storage**
- Frontend: localStorage (not cookies)
- Reason: Token-based auth, not session-based
- Trade-off: Vulnerable to XSS, but easier CORS

---

### 3. Rate Limiting

**Per-Endpoint Limits**
- Signup: 3 per hour per IP
- Login: 5 per 15 minutes per IP
- Token refresh: 20 per hour per IP
- OAuth callback: 10 per 5 minutes per IP
- API calls: 100 per 15 minutes per IP

**Why Rate Limiting?**
- Prevents brute force attacks
- Mitigates DDoS
- Reduces spam account creation

---

### 4. Account Protection

**Account Lockout**
- Threshold: 5 failed login attempts
- Lock duration: 30 minutes
- Tracked per user (not per IP)
- Unlocks automatically after 30 minutes

**IP and Device Tracking**
- Every auth event logs IP address
- Device info (User-Agent) stored
- Enables security monitoring
- Detects unusual activity

---

### 5. Audit Logging

**What's Logged**
- All auth events: signup, login, logout, failed_login, account_locked, token_refresh
- User ID, event type, provider, IP, user agent
- Success/failure, failure reason
- Metadata (JSONB for flexible logging)

**Query Examples**
```sql
-- View all failed login attempts
SELECT * FROM auth_logs
WHERE event_type = 'failed_login' AND success = false
ORDER BY created_at DESC LIMIT 20;

-- Detect suspicious activity (many failed logins from one IP)
SELECT ip_address, COUNT(*) as attempts
FROM auth_logs
WHERE event_type = 'failed_login' AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING COUNT(*) > 10;
```

---

### 6. OAuth Security

**Authorization Code Flow**
- Uses authorization code (not implicit flow)
- Code exchange on backend (client never sees tokens)
- State parameter for CSRF protection

**Account Linking**
- Links by email (with validation)
- User can sign in with either method
- Profile data synced from Google

---

## Production Deployment

Checklist for deploying to production.

### Pre-Deployment Checklist

- [ ] **Environment Variables**
  - [ ] `JWT_SECRET` is unique and secure (32+ bytes)
  - [ ] `AUTH_DB_PASSWORD` is strong
  - [ ] `GOOGLE_CLIENT_SECRET` is not committed to git
  - [ ] `.env.production` file created (not committed)

- [ ] **Database**
  - [ ] Migration executed: `npm run db:migrate`
  - [ ] Backup strategy configured
  - [ ] Connection pooling configured (max 20 connections)

- [ ] **Google OAuth**
  - [ ] Production credentials created (separate from dev)
  - [ ] Production redirect URIs added to Google Cloud Console
  - [ ] Consent screen published (or test users added)

- [ ] **CORS**
  - [ ] `CORS_ORIGINS` updated with production domain
  - [ ] No wildcard `*` in production

- [ ] **SSL/TLS**
  - [ ] HTTPS enforced (OAuth requires HTTPS)
  - [ ] Valid SSL certificate installed
  - [ ] HTTP→HTTPS redirect configured

- [ ] **Monitoring**
  - [ ] Application logs configured
  - [ ] Failed login alerting setup
  - [ ] Database connection monitoring
  - [ ] Rate limit breach detection

---

### Environment Configuration for Production

**Create `.env.production`:**
```bash
# NEVER commit this file to git!

# Node Environment
NODE_ENV=production

# Auth Database
AUTH_DB_HOST=your-production-db-host.com
AUTH_DB_PORT=5432
AUTH_DB_NAME=Tiphub_auth
AUTH_DB_USER=postgres
AUTH_DB_PASSWORD=<strong-production-password>

# JWT Configuration
JWT_SECRET=<generate-new-secret-for-production>
JWT_ACCESS_EXPIRY=6h
JWT_REFRESH_EXPIRY=7d

# Google OAuth (Production Credentials)
GOOGLE_CLIENT_ID=<production-client-id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<production-client-secret>
GOOGLE_CALLBACK_URL=https://yourdomain.com/auth/google/callback
GOOGLE_CALLBACK_URL_PROD=https://yourdomain.com/auth/google/callback

# CORS (Production Domain)
CORS_ORIGINS=https://yourdomain.com

# Frontend URLs
VITE_AUTH_BASE_URL=https://yourdomain.com
VITE_GRADIO_BASE_URL=https://api.yourdomain.com
```

---

### Deployment Steps

**1. Build Application**
```bash
# Build frontend
npm run build

# Verify build output
ls dist/public/
```

**2. Start Production Servers**
```bash
# Terminal 1: Node backend
NODE_ENV=production npm run start

# Terminal 2: Python backend (if used)
NODE_ENV=production uvicorn main:app --port 7860
```

**3. Verify Deployment**
```bash
# Check health endpoint
curl https://yourdomain.com/health

# Check OAuth status
curl https://yourdomain.com/auth/google/status

# Test signup
curl -X POST https://yourdomain.com/auth/v2/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"test","password":"SecurePass123!"}'
```

---

### Maintenance

**Session Cleanup (Recommended)**

Create a cron job to delete expired sessions:

```sql
-- Delete sessions expired more than 7 days ago
DELETE FROM sessions
WHERE expires_at < NOW() - INTERVAL '7 days';

-- Delete revoked sessions older than 30 days
DELETE FROM sessions
WHERE revoked = true AND revoked_at < NOW() - INTERVAL '30 days';
```

**Cron Job (Daily at 2 AM):**
```bash
# Add to crontab: crontab -e
0 2 * * * psql -h ***REMOVED*** -U postgres -d Tiphub_auth -c "DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL '7 days';"
```

---

## Additional Resources

- **Google Cloud Console:** https://console.cloud.google.com
- **OAuth 2.0 Playground:** https://developers.google.com/oauthplayground
- **JWT Decoder:** https://jwt.io
- **Bcrypt Calculator:** https://bcrypt-generator.com

---

## Summary

You now have a complete, production-ready authentication system with:

✅ **Password Authentication** - Secure bcrypt hashing with JWT tokens
✅ **Google OAuth** - Seamless sign-in with Google accounts
✅ **Session Management** - Database-backed with server-side revocation
✅ **Security Features** - Rate limiting, account lockout, audit logging
✅ **Account Linking** - Link multiple auth methods to one account

For questions or issues, refer to the [Troubleshooting](#troubleshooting) section or check server logs for detailed error messages.

---

**Last Updated:** November 2025
**Version:** 2.0 (V2 Authentication System)
**Status:** ✅ Production-ready
