# TSD - Authentication Implementation

# Crypto Trading AI Agent Ecosystem

**Module**: Authentication
**Version**: 2.1
**Last Updated**: January 2025
**Status**: Complete

[← Back to TSD Root](./04-TSD-Root.md)

---

## Overview

This module defines the implementation of passwordless authentication for the Crypto Trading AI Agent Ecosystem, implementing the architectural decisions from ADD v2.1 Section 8.3 and ADR-005.

**Authentication Methods:**

- **WebAuthn/Passkeys**: Primary authentication using FIDO2 hardware keys, platform authenticators (FaceID, TouchID, Windows Hello)
- **OAuth 2.0**: Social login with Google, Apple Sign-In
- **Session Management**: JWT-based sessions with refresh tokens using jose library

**Key Libraries:**

- **Auth.js** (formerly NextAuth.js): Authentication framework for Next.js
- **@simplewebauthn/server**: WebAuthn/Passkey server implementation
- **jose**: Zero-dependency JWT library using Web Crypto API
- **Postgres**: Session and user storage

**Security Features:**

- No passwords stored
- Multi-device support
- Device loss recovery via OAuth
- Rate limiting on authentication endpoints
- CSRF protection
- Secure session management

---

## 1. Database Schema

**File:** `packages/database/migrations/001_authentication.sql`

### 1.1 Users Table

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);
```

### 1.2 Authenticators Table (WebAuthn)

```sql
CREATE TABLE authenticators (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  credential_public_key BYTEA NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  credential_device_type VARCHAR(32) NOT NULL,
  credential_backed_up BOOLEAN NOT NULL DEFAULT false,
  transports TEXT[], -- 'usb', 'nfc', 'ble', 'internal', 'hybrid'
  name VARCHAR(255), -- user-provided name for device
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_authenticators_user_id ON authenticators(user_id);
CREATE INDEX idx_authenticators_credential_id ON authenticators(credential_id);
```

### 1.3 OAuth Accounts Table

```sql
CREATE TABLE oauth_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'google', 'apple'
  provider_account_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at BIGINT,
  token_type VARCHAR(50),
  scope TEXT,
  id_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);

CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider, provider_account_id);
```

### 1.4 Sessions Table

```sql
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  refresh_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_address INET
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_session_token ON sessions(session_token);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

### 1.5 WebAuthn Challenges Table (Temporary)

```sql
CREATE TABLE webauthn_challenges (
  id SERIAL PRIMARY KEY,
  challenge TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255), -- for registration flow
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_webauthn_challenges_challenge ON webauthn_challenges(challenge);
CREATE INDEX idx_webauthn_challenges_expires_at ON webauthn_challenges(expires_at);

-- cleanup expired challenges every hour
CREATE OR REPLACE FUNCTION cleanup_expired_challenges()
RETURNS void AS $$
BEGIN
  DELETE FROM webauthn_challenges WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

---

## 2. Auth.js Configuration

**File:** `apps/web/auth.ts`

### 2.1 Auth.js Setup

```typescript
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import CredentialsProvider from "next-auth/providers/credentials";
import { Pool } from "pg";
import type { Adapter } from "next-auth/adapters";
import { createPostgresAdapter } from "./auth-adapter";
import { verifyWebAuthnAssertion } from "./webauthn";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: createPostgresAdapter(pool),
  providers: [
    // OAuth Providers
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),

    AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!, // generated JWT
      authorization: {
        params: {
          scope: "name email",
        },
      },
    }),

    // WebAuthn Provider (using Credentials provider)
    CredentialsProvider({
      id: "webauthn",
      name: "WebAuthn",
      credentials: {
        assertion: { label: "Assertion", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.assertion) {
          return null;
        }

        try {
          const assertion = JSON.parse(credentials.assertion as string);
          const result = await verifyWebAuthnAssertion(pool, assertion);

          if (result.isErr()) {
            console.error("WebAuthn verification failed:", result.error);
            return null;
          }

          return result.value; // { id, email, name }
        } catch (error) {
          console.error("WebAuthn authorize error:", error);
          return null;
        }
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },

  callbacks: {
    async jwt({ token, user, account }) {
      // initial sign in
      if (user) {
        token.userId = user.id;
        token.email = user.email;
        token.name = user.name;
      }

      // oauth provider info
      if (account) {
        token.provider = account.provider;
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as number;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },

  events: {
    async signIn({ user, account }) {
      // update last sign-in timestamp
      await pool.query(
        "UPDATE users SET last_sign_in_at = NOW() WHERE id = $1",
        [user.id]
      );
    },
  },
});
```

### 2.2 Custom Postgres Adapter

**File:** `apps/web/auth-adapter.ts`

```typescript
import { Pool } from "pg";
import type { Adapter } from "next-auth/adapters";

export function createPostgresAdapter(pool: Pool): Adapter {
  return {
    async createUser(user) {
      const result = await pool.query(
        `INSERT INTO users (email, name, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING id, email, name, created_at as "createdAt"`,
        [user.email, user.name]
      );
      return result.rows[0];
    },

    async getUser(id) {
      const result = await pool.query(
        `SELECT id, email, name, created_at as "createdAt"
         FROM users WHERE id = $1`,
        [id]
      );
      return result.rows[0] || null;
    },

    async getUserByEmail(email) {
      const result = await pool.query(
        `SELECT id, email, name, created_at as "createdAt"
         FROM users WHERE email = $1`,
        [email]
      );
      return result.rows[0] || null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const result = await pool.query(
        `SELECT u.id, u.email, u.name, u.created_at as "createdAt"
         FROM users u
         INNER JOIN oauth_accounts oa ON u.id = oa.user_id
         WHERE oa.provider = $1 AND oa.provider_account_id = $2`,
        [provider, providerAccountId]
      );
      return result.rows[0] || null;
    },

    async updateUser(user) {
      const result = await pool.query(
        `UPDATE users
         SET email = $2, name = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING id, email, name, created_at as "createdAt"`,
        [user.id, user.email, user.name]
      );
      return result.rows[0];
    },

    async linkAccount(account) {
      await pool.query(
        `INSERT INTO oauth_accounts (
          user_id, provider, provider_account_id,
          access_token, refresh_token, expires_at,
          token_type, scope, id_token
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          account.userId,
          account.provider,
          account.providerAccountId,
          account.access_token,
          account.refresh_token,
          account.expires_at,
          account.token_type,
          account.scope,
          account.id_token,
        ]
      );
      return account;
    },

    async unlinkAccount({ provider, providerAccountId }) {
      await pool.query(
        `DELETE FROM oauth_accounts
         WHERE provider = $1 AND provider_account_id = $2`,
        [provider, providerAccountId]
      );
    },

    // sessions handled by JWT strategy
    async createSession() {
      throw new Error("createSession not implemented - using JWT strategy");
    },
    async getSessionAndUser() {
      throw new Error("getSessionAndUser not implemented - using JWT strategy");
    },
    async updateSession() {
      throw new Error("updateSession not implemented - using JWT strategy");
    },
    async deleteSession() {
      throw new Error("deleteSession not implemented - using JWT strategy");
    },
  };
}
```

---

## 3. WebAuthn/Passkey Implementation

### 3.1 WebAuthn Configuration

**File:** `apps/web/lib/webauthn/config.ts`

```typescript
import type { GenerateRegistrationOptionsOpts, GenerateAuthenticationOptionsOpts } from '@simplewebauthn/server';

export const rpName = 'Crypto Trading AI Agent';
export const rpID = process.env.NEXT_PUBLIC_RP_ID || 'localhost';
export const origin = process.env.NEXT_PUBLIC_ORIGIN || 'http://localhost:3000';

export const registrationOptions: Partial<GenerateRegistrationOptionsOpts> = {
  rpName,
  rpID,
  attestationType: 'none',
  authenticatorSelection: {
    residentKey: 'preferred',
    userVerification: 'preferred',
    authenticatorAttachment: 'platform', // prefer platform authenticators
  },
  timeout: 60000, // 60 seconds
};

export const authenticationOptions: Partial<GenerateAuthenticationOptionsOpts> = {
  rpID,
  timeout: 60000,
  userVerification: 'preferred',
};
```

### 3.2 Registration Flow

**File:** `apps/web/lib/webauthn/registration.ts`

```typescript
import { Pool } from 'pg';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/types';
import { Result, ok, err } from '@satoshibits/functional';
import { rpName, rpID, origin, registrationOptions } from './config';

/**
 * Generate WebAuthn registration options for new user
 */
export async function generateWebAuthnRegistration(
  pool: Pool,
  email: string,
  name: string
): Promise<Result<PublicKeyCredentialCreationOptionsJSON, Error>> {
  try {
    // check if user already exists
    const userResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    let userId: number;

    if (userResult.rows.length === 0) {
      // create new user
      const newUser = await pool.query(
        'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
        [email, name]
      );
      userId = newUser.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }

    // get existing authenticators for this user
    const authenticators = await pool.query(
      `SELECT credential_id as "credentialID"
       FROM authenticators
       WHERE user_id = $1`,
      [userId]
    );

    const options = await generateRegistrationOptions({
      ...registrationOptions,
      userID: userId.toString(),
      userName: email,
      userDisplayName: name,
      excludeCredentials: authenticators.rows.map((auth) => ({
        id: auth.credentialID,
        type: 'public-key',
        transports: ['internal', 'hybrid'],
      })),
    });

    // store challenge temporarily (expires in 5 minutes)
    await pool.query(
      `INSERT INTO webauthn_challenges (challenge, user_id, email, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '5 minutes')`,
      [options.challenge, userId, email]
    );

    return ok(options);
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Registration options generation failed'));
  }
}

/**
 * Verify WebAuthn registration response
 */
export async function verifyWebAuthnRegistration(
  pool: Pool,
  response: RegistrationResponseJSON
): Promise<Result<{ userId: number; credentialId: string }, Error>> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // get challenge from database
    const challengeResult = await client.query(
      `SELECT challenge, user_id, email
       FROM webauthn_challenges
       WHERE challenge = $1 AND expires_at > NOW()`,
      [response.response.clientDataJSON]
    );

    if (challengeResult.rows.length === 0) {
      throw new Error('Challenge not found or expired');
    }

    const { challenge, user_id: userId, email } = challengeResult.rows[0];

    // verify registration response
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Registration verification failed');
    }

    const {
      credentialPublicKey,
      credentialID,
      counter,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    // store authenticator
    await client.query(
      `INSERT INTO authenticators (
        user_id, credential_id, credential_public_key,
        counter, credential_device_type, credential_backed_up,
        transports, created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        userId,
        Buffer.from(credentialID).toString('base64'),
        credentialPublicKey,
        counter,
        credentialDeviceType,
        credentialBackedUp,
        response.response.transports || [],
      ]
    );

    // delete used challenge
    await client.query(
      'DELETE FROM webauthn_challenges WHERE challenge = $1',
      [challenge]
    );

    await client.query('COMMIT');

    return ok({
      userId,
      credentialId: Buffer.from(credentialID).toString('base64'),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return err(error instanceof Error ? error : new Error('Registration verification failed'));
  } finally {
    client.release();
  }
}
```

### 3.3 Authentication Flow

**File:** `apps/web/lib/webauthn/authentication.ts`

```typescript
import { Pool } from 'pg';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  PublicKeyCredentialRequestOptionsJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';
import { Result, ok, err } from '@satoshibits/functional';
import { rpID, origin, authenticationOptions } from './config';

interface Authenticator {
  credentialId: string;
  credentialPublicKey: Buffer;
  counter: number;
  transports: AuthenticatorTransportFuture[];
}

/**
 * Generate WebAuthn authentication options
 */
export async function generateWebAuthnAuthentication(
  pool: Pool,
  email?: string
): Promise<Result<PublicKeyCredentialRequestOptionsJSON, Error>> {
  try {
    let allowCredentials: { id: string; type: 'public-key'; transports: AuthenticatorTransportFuture[] }[] = [];

    if (email) {
      // get user's authenticators
      const result = await pool.query(
        `SELECT a.credential_id, a.transports
         FROM authenticators a
         INNER JOIN users u ON a.user_id = u.id
         WHERE u.email = $1`,
        [email]
      );

      allowCredentials = result.rows.map((row) => ({
        id: row.credential_id,
        type: 'public-key' as const,
        transports: row.transports || [],
      }));
    }

    const options = await generateAuthenticationOptions({
      ...authenticationOptions,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
    });

    // store challenge (expires in 5 minutes)
    await pool.query(
      `INSERT INTO webauthn_challenges (challenge, email, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '5 minutes')`,
      [options.challenge, email || null]
    );

    return ok(options);
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Authentication options generation failed'));
  }
}

/**
 * Verify WebAuthn authentication response
 */
export async function verifyWebAuthnAssertion(
  pool: Pool,
  response: AuthenticationResponseJSON
): Promise<Result<{ id: number; email: string; name: string }, Error>> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // get challenge
    const challengeResult = await client.query(
      `SELECT challenge
       FROM webauthn_challenges
       WHERE challenge = $1 AND expires_at > NOW()`,
      [response.response.clientDataJSON]
    );

    if (challengeResult.rows.length === 0) {
      throw new Error('Challenge not found or expired');
    }

    const { challenge } = challengeResult.rows[0];

    // get authenticator
    const credentialId = Buffer.from(response.id, 'base64').toString('base64');
    const authResult = await client.query(
      `SELECT a.*, u.id as user_id, u.email, u.name
       FROM authenticators a
       INNER JOIN users u ON a.user_id = u.id
       WHERE a.credential_id = $1`,
      [credentialId]
    );

    if (authResult.rows.length === 0) {
      throw new Error('Authenticator not found');
    }

    const authenticator = authResult.rows[0];

    // verify authentication response
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      authenticator: {
        credentialID: Buffer.from(authenticator.credential_id, 'base64'),
        credentialPublicKey: authenticator.credential_public_key,
        counter: authenticator.counter,
        transports: authenticator.transports,
      },
    });

    if (!verification.verified) {
      throw new Error('Authentication verification failed');
    }

    // update authenticator counter
    await client.query(
      `UPDATE authenticators
       SET counter = $1, last_used_at = NOW()
       WHERE id = $2`,
      [verification.authenticationInfo.newCounter, authenticator.id]
    );

    // delete used challenge
    await client.query(
      'DELETE FROM webauthn_challenges WHERE challenge = $1',
      [challenge]
    );

    await client.query('COMMIT');

    return ok({
      id: authenticator.user_id,
      email: authenticator.email,
      name: authenticator.name,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return err(error instanceof Error ? error : new Error('Authentication verification failed'));
  } finally {
    client.release();
  }
}
```

---

## 4. Session Management with jose

### 4.1 JWT Token Generation

**File:** `packages/auth/src/jwt.ts`

```typescript
import { SignJWT, jwtVerify } from 'jose';
import { Result, ok, err } from '@satoshibits/functional';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'replace-with-32-byte-secret'
);
const JWT_ALGORITHM = 'HS256';

export interface SessionPayload {
  userId: number;
  email: string;
  name: string;
}

/**
 * Generate access token (15 minutes)
 */
export async function generateAccessToken(
  payload: SessionPayload
): Promise<Result<string, Error>> {
  try {
    const token = await new SignJWT({
      userId: payload.userId,
      email: payload.email,
      name: payload.name,
    })
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime('15m')
      .setIssuer('crypto-trading-ai')
      .setAudience('crypto-trading-ai-web')
      .sign(JWT_SECRET);

    return ok(token);
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Access token generation failed'));
  }
}

/**
 * Generate refresh token (30 days)
 */
export async function generateRefreshToken(
  payload: SessionPayload
): Promise<Result<string, Error>> {
  try {
    const token = await new SignJWT({
      userId: payload.userId,
    })
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      .setIssuedAt()
      .setExpirationTime('30d')
      .setIssuer('crypto-trading-ai')
      .setAudience('crypto-trading-ai-refresh')
      .sign(JWT_SECRET);

    return ok(token);
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Refresh token generation failed'));
  }
}

/**
 * Verify access token
 */
export async function verifyAccessToken(
  token: string
): Promise<Result<SessionPayload, Error>> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'crypto-trading-ai',
      audience: 'crypto-trading-ai-web',
    });

    return ok({
      userId: payload.userId as number,
      email: payload.email as string,
      name: payload.name as string,
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Access token verification failed'));
  }
}

/**
 * Verify refresh token
 */
export async function verifyRefreshToken(
  token: string
): Promise<Result<{ userId: number }, Error>> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'crypto-trading-ai',
      audience: 'crypto-trading-ai-refresh',
    });

    return ok({ userId: payload.userId as number });
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Refresh token verification failed'));
  }
}
```

### 4.2 Session Service

**File:** `packages/auth/src/session.ts`

```typescript
import { Pool } from 'pg';
import { Result, ok, err } from '@satoshibits/functional';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  type SessionPayload,
} from './jwt';
import { randomBytes } from 'crypto';

/**
 * Create new session
 */
export async function createSession(
  pool: Pool,
  user: SessionPayload,
  userAgent?: string,
  ipAddress?: string
): Promise<Result<{ accessToken: string; refreshToken: string }, Error>> {
  try {
    // generate tokens
    const accessTokenResult = await generateAccessToken(user);
    if (accessTokenResult.isErr()) {
      return err(accessTokenResult.error);
    }

    const refreshTokenResult = await generateRefreshToken(user);
    if (refreshTokenResult.isErr()) {
      return err(refreshTokenResult.error);
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const refreshToken = refreshTokenResult.value;

    // store session in database
    await pool.query(
      `INSERT INTO sessions (
        user_id, session_token, refresh_token,
        expires_at, user_agent, ip_address
       )
       VALUES ($1, $2, $3, NOW() + INTERVAL '30 days', $4, $5)`,
      [user.userId, sessionToken, refreshToken, userAgent, ipAddress]
    );

    return ok({
      accessToken: accessTokenResult.value,
      refreshToken,
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Session creation failed'));
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshSession(
  pool: Pool,
  refreshToken: string
): Promise<Result<{ accessToken: string }, Error>> {
  try {
    // verify refresh token
    const verifyResult = await verifyRefreshToken(refreshToken);
    if (verifyResult.isErr()) {
      return err(verifyResult.error);
    }

    const { userId } = verifyResult.value;

    // check if session exists and is not expired
    const sessionResult = await pool.query(
      `SELECT s.*, u.email, u.name
       FROM sessions s
       INNER JOIN users u ON s.user_id = u.id
       WHERE s.refresh_token = $1 AND s.expires_at > NOW()`,
      [refreshToken]
    );

    if (sessionResult.rows.length === 0) {
      return err(new Error('Session not found or expired'));
    }

    const session = sessionResult.rows[0];

    // generate new access token
    const accessTokenResult = await generateAccessToken({
      userId: session.user_id,
      email: session.email,
      name: session.name,
    });

    if (accessTokenResult.isErr()) {
      return err(accessTokenResult.error);
    }

    // update last_active_at
    await pool.query(
      'UPDATE sessions SET last_active_at = NOW() WHERE id = $1',
      [session.id]
    );

    return ok({ accessToken: accessTokenResult.value });
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Session refresh failed'));
  }
}

/**
 * Revoke session
 */
export async function revokeSession(
  pool: Pool,
  refreshToken: string
): Promise<Result<void, Error>> {
  try {
    await pool.query(
      'DELETE FROM sessions WHERE refresh_token = $1',
      [refreshToken]
    );
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Session revocation failed'));
  }
}

/**
 * Cleanup expired sessions (run periodically)
 */
export async function cleanupExpiredSessions(
  pool: Pool
): Promise<Result<number, Error>> {
  try {
    const result = await pool.query(
      'DELETE FROM sessions WHERE expires_at < NOW() RETURNING id'
    );
    return ok(result.rowCount || 0);
  } catch (error) {
    return err(error instanceof Error ? error : new Error('Session cleanup failed'));
  }
}
```

---

## 5. API Routes

### 5.1 WebAuthn Registration Endpoints

**File:** `apps/web/app/api/auth/webauthn/register/options/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { generateWebAuthnRegistration } from '@/lib/webauthn/registration';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, name } = schema.parse(body);

    const result = await generateWebAuthnRegistration(pool, email, name);

    if (result.isErr()) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(result.value);
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
```

**File:** `apps/web/app/api/auth/webauthn/register/verify/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { verifyWebAuthnRegistration } from '@/lib/webauthn/registration';
import { createSession } from '@/packages/auth/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await verifyWebAuthnRegistration(pool, body);

    if (result.isErr()) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 }
      );
    }

    // get user info
    const userResult = await pool.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [result.value.userId]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const user = userResult.rows[0];

    // create session
    const sessionResult = await createSession(
      pool,
      { userId: user.id, email: user.email, name: user.name },
      request.headers.get('user-agent') || undefined,
      request.headers.get('x-forwarded-for') || undefined
    );

    if (sessionResult.isErr()) {
      return NextResponse.json(
        { error: sessionResult.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      accessToken: sessionResult.value.accessToken,
      refreshToken: sessionResult.value.refreshToken,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
```

### 5.2 WebAuthn Authentication Endpoints

**File:** `apps/web/app/api/auth/webauthn/login/options/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { generateWebAuthnAuthentication } from '@/lib/webauthn/authentication';

const schema = z.object({
  email: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = schema.parse(body);

    const result = await generateWebAuthnAuthentication(pool, email);

    if (result.isErr()) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(result.value);
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
```

**File:** `apps/web/app/api/auth/webauthn/login/verify/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { verifyWebAuthnAssertion } from '@/lib/webauthn/authentication';
import { createSession } from '@/packages/auth/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await verifyWebAuthnAssertion(pool, body);

    if (result.isErr()) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 400 }
      );
    }

    const user = result.value;

    // create session
    const sessionResult = await createSession(
      pool,
      { userId: user.id, email: user.email, name: user.name },
      request.headers.get('user-agent') || undefined,
      request.headers.get('x-forwarded-for') || undefined
    );

    if (sessionResult.isErr()) {
      return NextResponse.json(
        { error: sessionResult.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      accessToken: sessionResult.value.accessToken,
      refreshToken: sessionResult.value.refreshToken,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
```

### 5.3 Session Refresh Endpoint

**File:** `apps/web/app/api/auth/refresh/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { refreshSession } from '@/packages/auth/session';

const schema = z.object({
  refreshToken: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refreshToken } = schema.parse(body);

    const result = await refreshSession(pool, refreshToken);

    if (result.isErr()) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      accessToken: result.value.accessToken,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
}
```

---

## 6. Client-Side Integration

### 6.1 WebAuthn Client Utilities

**File:** `apps/web/lib/client/webauthn.ts`

```typescript
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';

/**
 * Register new WebAuthn credential
 */
export async function registerWebAuthn(
  email: string,
  name: string
): Promise<{ accessToken: string; refreshToken: string }> {
  // get registration options
  const optionsRes = await fetch('/api/auth/webauthn/register/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name }),
  });

  if (!optionsRes.ok) {
    const error = await optionsRes.json();
    throw new Error(error.error || 'Registration options failed');
  }

  const options: PublicKeyCredentialCreationOptionsJSON = await optionsRes.json();

  // start registration (browser prompts for biometrics/security key)
  const credential = await startRegistration(options);

  // verify registration
  const verifyRes = await fetch('/api/auth/webauthn/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credential),
  });

  if (!verifyRes.ok) {
    const error = await verifyRes.json();
    throw new Error(error.error || 'Registration verification failed');
  }

  const result = await verifyRes.json();
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  };
}

/**
 * Authenticate with WebAuthn
 */
export async function authenticateWebAuthn(
  email?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  // get authentication options
  const optionsRes = await fetch('/api/auth/webauthn/login/options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!optionsRes.ok) {
    const error = await optionsRes.json();
    throw new Error(error.error || 'Authentication options failed');
  }

  const options: PublicKeyCredentialRequestOptionsJSON = await optionsRes.json();

  // start authentication (browser prompts for biometrics/security key)
  const assertion = await startAuthentication(options);

  // verify authentication
  const verifyRes = await fetch('/api/auth/webauthn/login/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(assertion),
  });

  if (!verifyRes.ok) {
    const error = await verifyRes.json();
    throw new Error(error.error || 'Authentication verification failed');
  }

  const result = await verifyRes.json();
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  };
}
```

### 6.2 Sign-In Page Component

**File:** `apps/web/app/auth/signin/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { registerWebAuthn, authenticateWebAuthn } from '@/lib/client/webauthn';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  const handleWebAuthnRegister = async () => {
    try {
      setError('');
      const { accessToken, refreshToken } = await registerWebAuthn(email, name);

      // store tokens
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  const handleWebAuthnLogin = async () => {
    try {
      setError('');
      const { accessToken, refreshToken } = await authenticateWebAuthn(email);

      // store tokens
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="text-3xl font-bold">Sign in to Crypto Trading AI</h2>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* OAuth Sign In */}
        <div className="space-y-3">
          <button
            onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
            className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white hover:bg-gray-50"
          >
            Continue with Google
          </button>

          <button
            onClick={() => signIn('apple', { callbackUrl: '/dashboard' })}
            className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-black text-white hover:bg-gray-900"
          >
            Continue with Apple
          </button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or use passkey</span>
          </div>
        </div>

        {/* WebAuthn/Passkey */}
        <div className="space-y-4">
          {isRegistering && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="you@example.com"
            />
          </div>

          {isRegistering ? (
            <button
              onClick={handleWebAuthnRegister}
              className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Create Passkey
            </button>
          ) : (
            <button
              onClick={handleWebAuthnLogin}
              className="w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Sign in with Passkey
            </button>
          )}

          <button
            onClick={() => setIsRegistering(!isRegistering)}
            className="w-full text-sm text-blue-600 hover:text-blue-500"
          >
            {isRegistering ? 'Already have a passkey? Sign in' : 'New user? Create a passkey'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 7. Installation Dependencies

All authentication services require these npm packages:

```bash
# Server dependencies
npm install --save \
  next-auth \
  @auth/pg-adapter \
  @simplewebauthn/server \
  @simplewebauthn/types \
  jose \
  pg \
  zod

# Client dependencies
npm install --save \
  @simplewebauthn/browser \
  next-auth

# Dev dependencies
npm install --save-dev \
  @types/pg
```

---

## 8. Environment Variables

**File:** `apps/web/.env.local`

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/trading_ai

# Auth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32

# JWT
JWT_SECRET=generate-with-openssl-rand-base64-32

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Apple OAuth
APPLE_CLIENT_ID=your-apple-client-id
APPLE_CLIENT_SECRET=your-generated-jwt

# WebAuthn
NEXT_PUBLIC_RP_ID=localhost
NEXT_PUBLIC_ORIGIN=http://localhost:3000
```

---

## 9. Security Considerations

### 9.1 Rate Limiting

**Implement rate limiting on authentication endpoints:**

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'), // 5 attempts per minute
});

// apply to /api/auth/* routes
export async function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const { success } = await ratelimit.limit(ip);

  if (!success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
  }

  return NextResponse.next();
}
```

### 9.2 CSRF Protection

Auth.js includes built-in CSRF protection for OAuth flows. For WebAuthn endpoints, use Next.js middleware or a CSRF token library.

### 9.3 Device Loss Recovery

**User loses device with passkey:**

1. User can sign in with OAuth (Google/Apple) if they linked their account
2. After OAuth sign-in, user can register a new passkey on their new device
3. User can manage and remove old authenticators from account settings

**File:** `apps/web/app/settings/authenticators/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';

interface Authenticator {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function AuthenticatorsPage() {
  const [authenticators, setAuthenticators] = useState<Authenticator[]>([]);

  useEffect(() => {
    fetchAuthenticators();
  }, []);

  const fetchAuthenticators = async () => {
    const res = await fetch('/api/user/authenticators');
    const data = await res.json();
    setAuthenticators(data);
  };

  const removeAuthenticator = async (id: number) => {
    await fetch(`/api/user/authenticators/${id}`, { method: 'DELETE' });
    fetchAuthenticators();
  };

  return (
    <div>
      <h1>Manage Passkeys</h1>
      <ul>
        {authenticators.map((auth) => (
          <li key={auth.id}>
            <span>{auth.name || 'Unnamed Device'}</span>
            <span>Last used: {auth.lastUsedAt || 'Never'}</span>
            <button onClick={() => removeAuthenticator(auth.id)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 10. Testing

### 10.1 Unit Tests

**File:** `packages/auth/__tests__/jwt.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { generateAccessToken, verifyAccessToken } from '../src/jwt';

describe('JWT', () => {
  it('should generate and verify access token', async () => {
    const payload = {
      userId: 1,
      email: 'test@example.com',
      name: 'Test User',
    };

    const tokenResult = await generateAccessToken(payload);
    expect(tokenResult.isOk()).toBe(true);

    if (tokenResult.isOk()) {
      const verifyResult = await verifyAccessToken(tokenResult.value);
      expect(verifyResult.isOk()).toBe(true);

      if (verifyResult.isOk()) {
        expect(verifyResult.value.userId).toBe(payload.userId);
        expect(verifyResult.value.email).toBe(payload.email);
      }
    }
  });
});
```

### 10.2 Integration Tests

Use Playwright for end-to-end WebAuthn testing with virtual authenticators:

```typescript
import { test, expect } from '@playwright/test';

test('WebAuthn registration flow', async ({ page, context }) => {
  // enable virtual authenticator
  const client = await context.newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });

  await page.goto('/auth/signin');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[placeholder="Your name"]', 'Test User');
  await page.click('button:has-text("Create Passkey")');

  // wait for registration to complete
  await expect(page).toHaveURL('/dashboard');
});
```

---

## Summary

This TSD defines the complete passwordless authentication implementation using:

- **Auth.js** for OAuth and session management
- **@simplewebauthn/server** for WebAuthn/Passkey implementation
- **jose** for JWT token generation and verification
- **Postgres** for user and session storage

The implementation provides:
- Multi-device support with WebAuthn
- Social login fallback (Google, Apple)
- Secure JWT-based sessions
- Device loss recovery
- Rate limiting and CSRF protection
