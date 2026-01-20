---
id: SPEC-MKJP625C
title: Authentication Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
---
# Authentication Specification

**Parent:** [04-Technical-Specifications.md](index.md)

---

## 1. Identity Architecture

### 1.1 Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **Identity Provider (IdP)** | User authentication, MFA, federation, user directory |
| **Auth.js (NextAuth)** | Frontend session management, OIDC client flows |
| **API Gateway** | JWT validation, request routing |
| **Application** | Authorization (RBAC), permission enforcement |

### 1.2 Reference Implementation

**Supported IdPs:** Keycloak or Authentik (OIDC-compliant)

The IdP selection is a deployment-time decision. Both support:
- OIDC/OAuth 2.0
- SAML 2.0 (for enterprise SSO)
- User federation (LDAP, Active Directory)
- MFA (TOTP, WebAuthn)
- Self-service password reset

---

## 2. OIDC Integration

### 2.1 Auth.js Configuration

```typescript
// lib/auth.ts
import NextAuth from 'next-auth';
import { JWT } from 'next-auth/jwt';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    {
      id: 'aptivo-idp',
      name: 'Aptivo',
      type: 'oidc',
      issuer: process.env.AUTH_ISSUER, // e.g., https://auth.aptivo.com/realms/aptivo
      clientId: process.env.AUTH_CLIENT_ID,
      clientSecret: process.env.AUTH_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'openid profile email roles',
        },
      },
    },
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // on initial sign in, extract claims from IdP
      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.sub = profile.sub;
        token.roles = profile.roles || [];
        token.groups = profile.groups || [];
      }

      // refresh token if expired
      if (Date.now() >= (token.expiresAt as number) * 1000) {
        return refreshAccessToken(token);
      }

      return token;
    },
    async session({ session, token }) {
      // expose token data to client session
      session.user.id = token.sub as string;
      session.user.roles = token.roles as string[];
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
});

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const response = await fetch(`${process.env.AUTH_ISSUER}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AUTH_CLIENT_ID!,
        client_secret: process.env.AUTH_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken as string,
      }),
    });

    const tokens = await response.json();

    if (!response.ok) throw tokens;

    return {
      ...token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? token.refreshToken,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    };
  } catch (error) {
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}
```

### 2.2 Required OIDC Scopes

| Scope | Purpose | Claims |
|-------|---------|--------|
| `openid` | OIDC compliance | `sub` |
| `profile` | User profile | `name`, `preferred_username`, `picture` |
| `email` | Email address | `email`, `email_verified` |
| `roles` | Application roles | `roles` (custom claim) |

---

## 3. JWT Structure

### 3.1 Access Token Claims

```typescript
interface AccessTokenClaims {
  // standard claims
  iss: string;          // issuer URL
  sub: string;          // user ID (UUID)
  aud: string;          // client ID
  exp: number;          // expiration timestamp
  iat: number;          // issued at timestamp
  jti: string;          // unique token ID

  // identity claims
  email: string;
  email_verified: boolean;
  name: string;
  preferred_username: string;

  // authorization claims (custom)
  roles: string[];      // application roles
  groups: string[];     // IdP groups (for federation)
  permissions?: string[]; // optional fine-grained permissions
}
```

### 3.2 Token Lifetimes

| Token Type | Lifetime | Notes |
|------------|----------|-------|
| Access Token | 15 minutes | Short-lived for security |
| Refresh Token | 8 hours | Session duration |
| ID Token | 15 minutes | Same as access token |

### 3.3 JWT Validation

```typescript
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.AUTH_ISSUER}/protocol/openid-connect/certs`)
);

interface JWTValidationResult {
  valid: boolean;
  claims?: AccessTokenClaims;
  error?: string;
}

async function validateJWT(token: string): Promise<JWTValidationResult> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.AUTH_ISSUER,
      audience: process.env.AUTH_CLIENT_ID,
    });

    return { valid: true, claims: payload as AccessTokenClaims };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}
```

---

## 4. Role-Based Access Control (RBAC)

### 4.1 Role Definitions

Per FRD v2.0.0 Section 5.1:

| Role | Description | Key Permissions |
|------|-------------|-----------------|
| `system_admin` | Full system access | All permissions |
| `recruiter` | Primary candidate management | Create/edit candidates, schedule interviews, generate contracts |
| `recruiting_coordinator` | Support operations | View candidates, schedule interviews |
| `interviewer` | Interview feedback | View assigned candidates, submit feedback |
| `hiring_manager` | Approval authority | Approve offers, approve contracts |
| `client_user` | External client access | View assigned candidates, view reports |

### 4.2 Permission Mapping

```typescript
const ROLE_PERMISSIONS: Record<string, string[]> = {
  system_admin: ['*'], // all permissions

  recruiter: [
    'candidate:create',
    'candidate:read',
    'candidate:update',
    'candidate:delete',
    'interview:create',
    'interview:read',
    'interview:update',
    'contract:create',
    'contract:read',
    'contract:send',
    'workflow:trigger',
  ],

  recruiting_coordinator: [
    'candidate:read',
    'interview:create',
    'interview:read',
    'interview:update',
  ],

  interviewer: [
    'candidate:read:assigned',
    'interview:read:assigned',
    'interview:feedback:submit',
  ],

  hiring_manager: [
    'candidate:read',
    'interview:read',
    'contract:read',
    'contract:approve',
    'offer:approve',
  ],

  client_user: [
    'candidate:read:client',
    'report:read:client',
  ],
};
```

### 4.3 Authorization Middleware

```typescript
import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

type Permission = string;

export function requirePermission(...permissions: Permission[]) {
  return async function middleware(req: NextRequest) {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json(
        {
          type: '/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
          detail: 'Authentication required',
        },
        { status: 401 }
      );
    }

    const userPermissions = getUserPermissions(session.user.roles);
    const hasPermission = permissions.some(
      (p) => userPermissions.includes('*') || userPermissions.includes(p)
    );

    if (!hasPermission) {
      return NextResponse.json(
        {
          type: '/errors/forbidden',
          title: 'Forbidden',
          status: 403,
          detail: `Insufficient permissions. Required: ${permissions.join(' or ')}`,
        },
        { status: 403 }
      );
    }

    return null; // allow request to proceed
  };
}

function getUserPermissions(roles: string[]): string[] {
  return roles.flatMap((role) => ROLE_PERMISSIONS[role] || []);
}
```

---

## 5. Zero Trust Implementation

### 5.1 Principles Applied

| Principle | Implementation |
|-----------|---------------|
| **Never Trust** | Every API request validates JWT |
| **Always Verify** | RBAC check on every protected route |
| **Least Privilege** | Roles grant minimum necessary permissions |
| **Assume Breach** | Short token lifetimes, audit logging |

### 5.2 Request Authentication Flow

```
┌─────────┐    ┌─────────────┐    ┌───────────┐    ┌─────────────┐
│  Client │───►│ API Gateway │───►│ Auth.js   │───►│ Application │
└─────────┘    └─────────────┘    └───────────┘    └─────────────┘
     │               │                  │                 │
     │  1. Request   │                  │                 │
     │  + JWT        │                  │                 │
     │───────────────►                  │                 │
     │               │                  │                 │
     │               │ 2. Validate JWT  │                 │
     │               │ (JWKS lookup)    │                 │
     │               │──────────────────►                 │
     │               │                  │                 │
     │               │                  │ 3. Check RBAC   │
     │               │                  │─────────────────►
     │               │                  │                 │
     │               │                  │ 4. Process      │
     │               │                  │    Request      │
     │◄──────────────────────────────────────────────────│
     │               5. Response                         │
```

### 5.3 Service-to-Service Authentication

For internal service communication, use mutual TLS (mTLS) or service tokens:

```typescript
// service token validation
interface ServiceToken {
  iss: 'aptivo-internal';
  sub: string;  // service name
  aud: string;  // target service
  exp: number;
  permissions: string[];
}

const validateServiceToken = async (token: string): Promise<ServiceToken | null> => {
  try {
    const { payload } = await jwtVerify(token, INTERNAL_JWKS, {
      issuer: 'aptivo-internal',
    });
    return payload as ServiceToken;
  } catch {
    return null;
  }
};
```

---

## 6. Multi-Factor Authentication

### 6.1 MFA Requirements

| User Type | MFA Requirement |
|-----------|-----------------|
| System Admin | Required |
| Recruiter | Required |
| Hiring Manager | Required |
| Other roles | Encouraged |

### 6.2 Supported MFA Methods

| Method | Priority | Notes |
|--------|----------|-------|
| **WebAuthn (FIDO2)** | Primary | Hardware keys, biometrics |
| **TOTP** | Secondary | Authenticator apps |
| **SMS OTP** | Fallback | Less secure, discouraged |

### 6.3 IdP MFA Configuration

MFA policies are configured in the IdP (Keycloak/Authentik). The application checks the `acr` (Authentication Context Class Reference) claim:

```typescript
// verify strong authentication was used
const requireStrongAuth = (claims: AccessTokenClaims) => {
  const strongAcrValues = ['urn:mace:incommon:iap:silver', 'mfa'];
  return claims.acr && strongAcrValues.includes(claims.acr);
};
```

---

## 7. Session Management

### 7.1 Session Storage

Sessions are stored server-side (Redis) with Auth.js JWT strategy:

```typescript
// session data structure
interface Session {
  user: {
    id: string;
    email: string;
    name: string;
    roles: string[];
  };
  accessToken: string;
  expiresAt: number;
}
```

### 7.2 Session Invalidation

| Event | Action |
|-------|--------|
| Logout | Clear session, revoke refresh token |
| Password change | Invalidate all sessions |
| Role change | Force re-authentication |
| Security incident | Admin can invalidate all user sessions |

### 7.3 Concurrent Session Limit

| Role | Max Sessions |
|------|--------------|
| System Admin | 1 |
| Other roles | 3 |

---

## 8. Audit Logging

### 8.1 Authentication Events

All authentication events are logged:

| Event | Severity | Data Logged |
|-------|----------|-------------|
| Login success | INFO | User ID, IP, user agent, timestamp |
| Login failure | WARN | Email attempt, IP, reason, timestamp |
| Logout | INFO | User ID, session duration |
| Token refresh | DEBUG | User ID, token age |
| MFA challenge | INFO | User ID, method, success/failure |
| Password reset | INFO | User ID, IP, timestamp |

### 8.2 Log Format

```typescript
interface AuthAuditLog {
  timestamp: string;
  event: string;
  userId?: string;
  email?: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}
```
