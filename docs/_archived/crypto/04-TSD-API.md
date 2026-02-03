# TSD - API Specifications

# Crypto Trading AI Agent Ecosystem

**Module**: API Specifications
**Version**: 2.0
**Last Updated**: January 15, 2026
**Status**: Complete
**References**: BRD v2.3, FRD v4.0, ADD v2.1

[← Back to TSD Root](./04-TSD-Root.md)

---

## Overview

This module defines all REST API endpoints, WebSocket protocol, request/response schemas, and error handling for the Crypto Trading AI Agent Ecosystem.

**Contents:**

- 6.1: API Architecture and Conventions
- 6.2: Authentication Endpoints (8 endpoints - WebAuthn + OAuth)
- 6.3: Smart Money Endpoints (3 endpoints)
- 6.4: Narrative Endpoints (3 endpoints)
- 6.5: Security Endpoints (3 endpoints)
- 6.6: Trade Signal Endpoints (4 endpoints)
- 6.7: Trade Endpoints (4 endpoints)
- 6.8: Agent Run Endpoints (2 endpoints)
- 6.9: LLM Usage Endpoints (2 endpoints)
- 6.10: WebSocket Protocol (5 event types)
- 6.11: Error Response Format

**Total**: 29 REST endpoints + WebSocket protocol

---

## 6.1 API Architecture and Conventions

### 6.1.1 Base URL

```
Development:  http://localhost:3000/api/v1
Production:   https://api.crypto-trading-ai.com/v1
```

### 6.1.2 Request/Response Format

- **Content-Type**: `application/json`
- **Character Encoding**: UTF-8
- **Date Format**: ISO 8601 (`2025-10-20T14:30:00.000Z`)

### 6.1.3 Authentication

All authenticated endpoints require JWT bearer token:

```http
Authorization: Bearer <access_token>
```

### 6.1.4 Validation with Zod

All request/response schemas use Zod for runtime type validation:

```typescript
import { z } from "zod";

// Example schema
const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Type inference
type CreateUserRequest = z.infer<typeof CreateUserSchema>;
```

### 6.1.5 Standard Response Envelope

**Success Response:**

```typescript
interface SuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string; // ISO 8601
}
```

**Error Response:**

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}
```

---

## 6.2 Authentication Endpoints (Passwordless)

> **Architecture Note:** This system uses passwordless authentication exclusively via WebAuthn/Passkeys and OAuth. No passwords or TOTP codes are stored or transmitted.

### 6.2.1 POST /auth/webauthn/register/challenge

**Purpose:** Initiate WebAuthn registration - get credential creation options

**Request Schema:**

```typescript
const WebAuthnRegisterChallengeRequestSchema = z.object({
  email: z.string().email().max(255),
  displayName: z.string().min(1).max(64).optional(),
});

type WebAuthnRegisterChallengeRequest = z.infer<typeof WebAuthnRegisterChallengeRequestSchema>;
```

**Request Example:**

```json
{
  "email": "user@example.com",
  "displayName": "John Doe"
}
```

**Response Schema:**

```typescript
const WebAuthnRegisterChallengeResponseSchema = z.object({
  challengeId: z.string().uuid(),
  publicKeyCredentialCreationOptions: z.object({
    challenge: z.string(), // base64url encoded
    rp: z.object({
      name: z.string(),
      id: z.string(),
    }),
    user: z.object({
      id: z.string(), // base64url encoded
      name: z.string(),
      displayName: z.string(),
    }),
    pubKeyCredParams: z.array(z.object({
      type: z.literal("public-key"),
      alg: z.number(), // COSE algorithm identifier
    })),
    timeout: z.number(),
    attestation: z.enum(["none", "indirect", "direct"]),
    authenticatorSelection: z.object({
      authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
      residentKey: z.enum(["required", "preferred", "discouraged"]),
      userVerification: z.enum(["required", "preferred", "discouraged"]),
    }),
  }),
  expiresAt: z.string().datetime(),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "challengeId": "550e8400-e29b-41d4-a716-446655440000",
    "publicKeyCredentialCreationOptions": {
      "challenge": "dGVzdC1jaGFsbGVuZ2UtZGF0YQ",
      "rp": {
        "name": "Crypto Trading AI",
        "id": "crypto-trading-ai.com"
      },
      "user": {
        "id": "dXNlci1pZC0xMjM0NTY",
        "name": "user@example.com",
        "displayName": "John Doe"
      },
      "pubKeyCredParams": [
        { "type": "public-key", "alg": -7 },
        { "type": "public-key", "alg": -257 }
      ],
      "timeout": 60000,
      "attestation": "none",
      "authenticatorSelection": {
        "residentKey": "preferred",
        "userVerification": "required"
      }
    },
    "expiresAt": "2026-01-15T14:35:00.000Z"
  },
  "timestamp": "2026-01-15T14:30:00.500Z"
}
```

**Error Codes:**

- `EMAIL_ALREADY_EXISTS` (409)
- `VALIDATION_ERROR` (400)

---

### 6.2.2 POST /auth/webauthn/register/verify

**Purpose:** Complete WebAuthn registration - verify attestation and create user

**Request Schema:**

```typescript
const WebAuthnRegisterVerifyRequestSchema = z.object({
  challengeId: z.string().uuid(),
  credential: z.object({
    id: z.string(), // base64url encoded credential ID
    rawId: z.string(), // base64url encoded
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: z.string(), // base64url encoded
      attestationObject: z.string(), // base64url encoded
    }),
    authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
  }),
  deviceName: z.string().max(64).optional(), // e.g., "MacBook Pro TouchID"
});
```

**Response Schema:**

```typescript
const WebAuthnRegisterVerifyResponseSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(), // seconds
  createdAt: z.string().datetime(),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "accessToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "createdAt": "2026-01-15T14:30:00.000Z"
  },
  "timestamp": "2026-01-15T14:30:00.500Z"
}
```

**Error Codes:**

- `INVALID_CHALLENGE` (400) - Challenge expired or not found
- `ATTESTATION_VERIFICATION_FAILED` (400) - Invalid credential
- `EMAIL_ALREADY_EXISTS` (409)

---

### 6.2.3 POST /auth/webauthn/login/challenge

**Purpose:** Initiate WebAuthn login - get credential assertion options

**Request Schema:**

```typescript
const WebAuthnLoginChallengeRequestSchema = z.object({
  email: z.string().email().optional(), // Optional for discoverable credentials
});
```

**Response Schema:**

```typescript
const WebAuthnLoginChallengeResponseSchema = z.object({
  challengeId: z.string().uuid(),
  publicKeyCredentialRequestOptions: z.object({
    challenge: z.string(), // base64url encoded
    timeout: z.number(),
    rpId: z.string(),
    allowCredentials: z.array(z.object({
      type: z.literal("public-key"),
      id: z.string(), // base64url encoded credential ID
      transports: z.array(z.enum(["usb", "nfc", "ble", "internal", "hybrid"])).optional(),
    })).optional(), // Empty for discoverable credentials
    userVerification: z.enum(["required", "preferred", "discouraged"]),
  }),
  expiresAt: z.string().datetime(),
});
```

**Error Codes:**

- `USER_NOT_FOUND` (404) - No user with this email
- `NO_CREDENTIALS` (400) - User has no registered passkeys

---

### 6.2.4 POST /auth/webauthn/login/verify

**Purpose:** Complete WebAuthn login - verify assertion and issue tokens

**Request Schema:**

```typescript
const WebAuthnLoginVerifyRequestSchema = z.object({
  challengeId: z.string().uuid(),
  credential: z.object({
    id: z.string(), // base64url encoded credential ID
    rawId: z.string(), // base64url encoded
    type: z.literal("public-key"),
    response: z.object({
      clientDataJSON: z.string(), // base64url encoded
      authenticatorData: z.string(), // base64url encoded
      signature: z.string(), // base64url encoded
      userHandle: z.string().optional(), // base64url encoded user ID
    }),
  }),
});
```

**Response Schema:**

```typescript
const WebAuthnLoginVerifyResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(), // seconds
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    authenticatorCount: z.number(), // Number of registered passkeys
  }),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "authenticatorCount": 2
    }
  },
  "timestamp": "2026-01-15T14:30:00.500Z"
}
```

**Error Codes:**

- `INVALID_CHALLENGE` (400) - Challenge expired or not found
- `ASSERTION_VERIFICATION_FAILED` (401) - Invalid signature
- `ACCOUNT_SUSPENDED` (403)

---

### 6.2.5 GET /auth/oauth/:provider

**Purpose:** Initiate OAuth flow - redirect to provider

**Path Parameters:**

- `provider`: `google` | `apple`

**Query Parameters:**

```typescript
const OAuthInitQuerySchema = z.object({
  redirect_uri: z.string().url().optional(), // Override default callback
  state: z.string().optional(), // Client-provided state for CSRF protection
});
```

**Response:** HTTP 302 redirect to OAuth provider authorization URL

---

### 6.2.6 POST /auth/oauth/:provider/callback

**Purpose:** Complete OAuth flow - exchange code for tokens

**Request Schema:**

```typescript
const OAuthCallbackRequestSchema = z.object({
  code: z.string(), // Authorization code from provider
  state: z.string().optional(),
});
```

**Response Schema:**

```typescript
const OAuthCallbackResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    isNewUser: z.boolean(), // True if account was just created
    provider: z.enum(["google", "apple"]),
  }),
});
```

**Error Codes:**

- `INVALID_OAUTH_CODE` (400)
- `OAUTH_PROVIDER_ERROR` (502)
- `EMAIL_ALREADY_EXISTS` (409) - Email linked to different auth method

---

### 6.2.7 POST /auth/refresh

**Purpose:** Refresh access token using refresh token

**Request Schema:**

```typescript
const RefreshRequestSchema = z.object({
  refreshToken: z.string(),
});
```

**Response Schema:**

```typescript
const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});
```

**Error Codes:**

- `INVALID_REFRESH_TOKEN` (401)
- `SESSION_EXPIRED` (401)

---

### 6.2.8 POST /auth/logout

**Purpose:** Invalidate session and tokens

**Authentication:** Required

**Request Body:** None (session identified from bearer token)

**Response Example:**

```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

## 6.3 Smart Money Endpoints

### 6.3.1 GET /smart-money/transactions

**Purpose:** Retrieve smart money transaction history

**Authentication:** Required

**Query Parameters:**

```typescript
const SmartMoneyQuerySchema = z.object({
  walletAddress: z.string().optional(),
  blockchain: z.enum(["arbitrum", "base", "optimism", "polygon", "ethereum", "solana", "bsc"]).optional(), // L2-first
  tokenSymbol: z.string().optional(),
  direction: z.enum(["buy", "sell", "transfer"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z
    .enum(["timestamp", "usd_value", "confidence_score"])
    .default("timestamp"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
```

**Example Request:**

```http
GET /api/v1/smart-money/transactions?walletAddress=0x1234...&limit=20&sortBy=usd_value&sortOrder=desc
Authorization: Bearer <token>
```

**Response Schema:**

```typescript
const SmartMoneyTransactionSchema = z.object({
  id: z.number(),
  walletAddress: z.string(),
  blockchain: z.string(),
  tokenSymbol: z.string().nullable(),
  tokenAddress: z.string().nullable(),
  amount: z.string(), // Decimal as string
  direction: z.enum(["buy", "sell", "transfer"]),
  usdValue: z.string().nullable(),
  transactionHash: z.string(),
  blockNumber: z.number().nullable(),
  timestamp: z.string().datetime(),
  aiReasoning: z.string().nullable(),
  confidenceScore: z.number().int().min(1).max(10).nullable(),
  userFeedback: z.string().nullable(),
  createdAt: z.string().datetime(),
});

const SmartMoneyListResponseSchema = z.object({
  transactions: z.array(SmartMoneyTransactionSchema),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": 1,
        "walletAddress": "0x1234567890abcdef",
        "blockchain": "ethereum",
        "tokenSymbol": "PEPE",
        "tokenAddress": "0xabcdef1234567890",
        "amount": "1000000.5",
        "direction": "buy",
        "usdValue": "50000.00",
        "transactionHash": "0xhash123",
        "blockNumber": 18500000,
        "timestamp": "2025-10-20T10:00:00.000Z",
        "aiReasoning": "Large accumulation by whale wallet with 85% win rate",
        "confidenceScore": 9,
        "userFeedback": null,
        "createdAt": "2025-10-20T10:05:00.000Z"
      }
    ],
    "pagination": {
      "total": 250,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

### 6.3.2 GET /smart-money/transactions/:id

**Purpose:** Get single transaction by ID

**Authentication:** Required

**Response Schema:** `SmartMoneyTransactionSchema`

**Error Codes:**

- `TRANSACTION_NOT_FOUND` (404)

---

### 6.3.3 POST /smart-money/transactions/:id/feedback

**Purpose:** Submit user feedback on transaction analysis

**Authentication:** Required

**Request Schema:**

```typescript
const TransactionFeedbackSchema = z.object({
  feedback: z.string().min(1).max(500),
  rating: z.number().int().min(1).max(5).optional(),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "message": "Feedback submitted successfully"
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

## 6.4 Narrative Endpoints

### 6.4.1 GET /narratives

**Purpose:** Retrieve trending crypto narratives

**Authentication:** Required

**Query Parameters:**

```typescript
const NarrativeQuerySchema = z.object({
  category: z.string().optional(),
  minStrength: z.number().int().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
  sortBy: z
    .enum(["strength_score", "last_updated_timestamp"])
    .default("strength_score"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
```

**Response Schema:**

```typescript
const NarrativeSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  strengthScore: z.number().int().min(1).max(100),
  socialMentionCount: z.number().int(),
  associatedTokens: z.array(z.string()),
  lastUpdatedTimestamp: z.string().datetime(),
  createdAt: z.string().datetime(),
});

const NarrativeListResponseSchema = z.object({
  narratives: z.array(NarrativeSchema),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "narratives": [
      {
        "id": 5,
        "title": "AI Agent Economy",
        "description": "Autonomous AI agents transacting on-chain",
        "category": "AI",
        "strengthScore": 92,
        "socialMentionCount": 15847,
        "associatedTokens": ["AGIX", "FET", "RNDR"],
        "lastUpdatedTimestamp": "2025-10-20T14:00:00.000Z",
        "createdAt": "2025-10-15T08:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 15,
      "limit": 20,
      "offset": 0,
      "hasMore": false
    }
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

### 6.4.2 GET /narratives/:id

**Purpose:** Get single narrative by ID

**Authentication:** Required

**Response Schema:** `NarrativeSchema`

---

### 6.4.3 GET /narratives/:id/social-posts

**Purpose:** Get social media posts related to narrative

**Authentication:** Required

**Query Parameters:**

```typescript
const SocialPostQuerySchema = z.object({
  platform: z.enum(["farcaster", "lens", "reddit", "telegram"]).optional(), // On-chain social first
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
```

**Response Schema:**

```typescript
const SocialPostSchema = z.object({
  id: z.number(),
  narrativeId: z.number(),
  platform: z.enum(["farcaster", "lens", "reddit", "telegram"]), // On-chain social first
  postId: z.string(),
  author: z.string(),
  content: z.string(),
  timestamp: z.string().datetime(),
  engagementScore: z.number().int(),
  sentimentScore: z.number().min(-1).max(1),
  createdAt: z.string().datetime(),
});

const SocialPostListResponseSchema = z.object({
  posts: z.array(SocialPostSchema),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});
```

---

## 6.5 Security Endpoints

### 6.5.1 GET /security/scans

**Purpose:** Retrieve smart contract security scan results

**Authentication:** Required

**Query Parameters:**

```typescript
const SecurityScanQuerySchema = z.object({
  contractAddress: z.string().optional(),
  riskLevel: z.enum(["critical", "high", "medium", "low", "safe"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z
    .enum(["scanned_timestamp", "risk_score"])
    .default("scanned_timestamp"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
```

**Response Schema:**

```typescript
const SecurityScanSchema = z.object({
  id: z.number(),
  contractAddress: z.string(),
  blockchain: z.string(),
  riskScore: z.number().int().min(0).max(100),
  riskLevel: z.enum(["critical", "high", "medium", "low", "safe"]),
  findings: z.object({
    honeypot: z.boolean(),
    mintable: z.boolean(),
    proxy: z.boolean(),
    renounced: z.boolean(),
    verified: z.boolean(),
  }),
  detailedReport: z.record(z.unknown()),
  scannedTimestamp: z.string().datetime(),
  createdAt: z.string().datetime(),
});

const SecurityScanListResponseSchema = z.object({
  scans: z.array(SecurityScanSchema),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "scans": [
      {
        "id": 10,
        "contractAddress": "0xabcd1234",
        "blockchain": "ethereum",
        "riskScore": 15,
        "riskLevel": "low",
        "findings": {
          "honeypot": false,
          "mintable": true,
          "proxy": false,
          "renounced": true,
          "verified": true
        },
        "detailedReport": {
          "ownershipRenounced": true,
          "liquidityLocked": true,
          "maxTransactionLimit": null
        },
        "scannedTimestamp": "2025-10-20T14:15:00.000Z",
        "createdAt": "2025-10-20T14:15:30.000Z"
      }
    ],
    "pagination": {
      "total": 120,
      "limit": 50,
      "offset": 0,
      "hasMore": true
    }
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

### 6.5.2 GET /security/scans/:id

**Purpose:** Get single security scan by ID

**Authentication:** Required

**Response Schema:** `SecurityScanSchema`

---

### 6.5.3 POST /security/scans

**Purpose:** Request new contract security scan

**Authentication:** Required

**Request Schema:**

```typescript
const RequestScanSchema = z.object({
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  blockchain: z.enum(["arbitrum", "base", "optimism", "polygon", "ethereum", "solana", "bsc"]), // L2-first
});
```

**Response Schema:**

```typescript
const ScanRequestResponseSchema = z.object({
  scanId: z.number(),
  status: z.literal("queued"),
  estimatedCompletionTime: z.string().datetime(),
});
```

---

## 6.6 Trade Signal Endpoints

### 6.6.1 GET /trade-signals

**Purpose:** Retrieve trade signals for user

**Authentication:** Required

**Query Parameters:**

```typescript
const TradeSignalQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "expired"]).optional(),
  signalType: z.enum(["long", "short"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z
    .enum(["created_timestamp", "confidence_score"])
    .default("created_timestamp"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
```

**Response Schema:**

```typescript
const TradeSignalSchema = z.object({
  id: z.number(),
  userId: z.number(),
  tokenSymbol: z.string(),
  tokenAddress: z.string(),
  signalType: z.enum(["long", "short"]),
  entryPriceUsd: z.string(),
  stopLossPriceUsd: z.string().nullable(),
  takeProfitPriceUsd: z.string().nullable(),
  confidenceScore: z.number().int().min(1).max(10),
  reasoning: z.string(),
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  approvalRequestId: z.string().nullable(),
  createdTimestamp: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

const TradeSignalListResponseSchema = z.object({
  signals: z.array(TradeSignalSchema),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "signals": [
      {
        "id": 42,
        "userId": 10,
        "tokenSymbol": "ETH",
        "tokenAddress": "0x...",
        "signalType": "long",
        "entryPriceUsd": "2500.00",
        "stopLossPriceUsd": "2350.00",
        "takeProfitPriceUsd": "2800.00",
        "confidenceScore": 8,
        "reasoning": "Breakout from consolidation zone with strong volume",
        "status": "pending",
        "approvalRequestId": "req_abc123",
        "createdTimestamp": "2025-10-20T14:00:00.000Z",
        "expiresAt": "2025-10-21T14:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 5,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

### 6.6.2 GET /trade-signals/:id

**Purpose:** Get single trade signal by ID

**Authentication:** Required

**Response Schema:** `TradeSignalSchema`

---

### 6.6.3 POST /trade-signals/:id/approve

**Purpose:** Approve trade signal (HITL)

**Authentication:** Required

**Request Schema:**

```typescript
const ApproveSignalSchema = z.object({
  reason: z.string().max(500).optional(),
  adjustedEntryPrice: z.string().optional(),
  adjustedStopLoss: z.string().optional(),
  adjustedTakeProfit: z.string().optional(),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "signalId": 42,
    "status": "approved",
    "tradeId": 101
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

### 6.6.4 POST /trade-signals/:id/reject

**Purpose:** Reject trade signal (HITL)

**Authentication:** Required

**Request Schema:**

```typescript
const RejectSignalSchema = z.object({
  reason: z.string().min(1).max(500),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "signalId": 42,
    "status": "rejected"
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

## 6.7 Trade Endpoints

### 6.7.1 GET /trades

**Purpose:** Retrieve user's trade history

**Authentication:** Required

**Query Parameters:**

```typescript
const TradeQuerySchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
  tokenSymbol: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(["opened_timestamp", "p_l_usd"]).default("opened_timestamp"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
```

**Response Schema:**

```typescript
const TradeSchema = z.object({
  id: z.number(),
  userId: z.number(),
  tradeSignalId: z.number(),
  tokenSymbol: z.string(),
  tokenAddress: z.string(),
  tradeType: z.enum(["long", "short"]),
  entryPriceUsd: z.string(),
  exitPriceUsd: z.string().nullable(),
  stopLossPriceUsd: z.string().nullable(),
  takeProfitPriceUsd: z.string().nullable(),
  positionSizeUsd: z.string(),
  status: z.enum(["open", "closed"]),
  pAndLUsd: z.string().nullable(),
  pAndLPercentage: z.string().nullable(),
  openedTimestamp: z.string().datetime(),
  closedTimestamp: z.string().datetime().nullable(),
});

const TradeListResponseSchema = z.object({
  trades: z.array(TradeSchema),
  summary: z.object({
    totalTrades: z.number(),
    openTrades: z.number(),
    closedTrades: z.number(),
    totalPnL: z.string(),
    winRate: z.number(), // Percentage
  }),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "trades": [
      {
        "id": 101,
        "userId": 10,
        "tradeSignalId": 42,
        "tokenSymbol": "ETH",
        "tokenAddress": "0x...",
        "tradeType": "long",
        "entryPriceUsd": "2500.00",
        "exitPriceUsd": "2750.00",
        "stopLossPriceUsd": "2350.00",
        "takeProfitPriceUsd": "2800.00",
        "positionSizeUsd": "1000.00",
        "status": "closed",
        "pAndLUsd": "100.00",
        "pAndLPercentage": "10.00",
        "openedTimestamp": "2025-10-20T14:00:00.000Z",
        "closedTimestamp": "2025-10-20T16:00:00.000Z"
      }
    ],
    "summary": {
      "totalTrades": 25,
      "openTrades": 3,
      "closedTrades": 22,
      "totalPnL": "1250.50",
      "winRate": 68.2
    },
    "pagination": {
      "total": 25,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

### 6.7.2 GET /trades/:id

**Purpose:** Get single trade by ID

**Authentication:** Required

**Response Schema:** `TradeSchema`

---

### 6.7.3 POST /trades/:id/close

**Purpose:** Manually close an open trade

**Authentication:** Required

**Request Schema:**

```typescript
const CloseTradeSchema = z.object({
  exitPrice: z.string().optional(), // If not provided, use current market price
  reason: z.string().max(500).optional(),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "tradeId": 101,
    "status": "closed",
    "exitPriceUsd": "2750.00",
    "pAndLUsd": "100.00",
    "pAndLPercentage": "10.00"
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

### 6.7.4 GET /trades/stats

**Purpose:** Get user trading statistics and performance metrics

**Authentication:** Required

**Query Parameters:**

```typescript
const TradeStatsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
```

**Response Schema:**

```typescript
const TradeStatsResponseSchema = z.object({
  totalTrades: z.number(),
  openTrades: z.number(),
  closedTrades: z.number(),
  winningTrades: z.number(),
  losingTrades: z.number(),
  winRate: z.number(),
  totalPnL: z.string(),
  averagePnL: z.string(),
  largestWin: z.string(),
  largestLoss: z.string(),
  sharpeRatio: z.number().nullable(),
  maxDrawdown: z.string().nullable(),
});
```

---

## 6.8 Agent Run Endpoints

### 6.8.1 GET /agent-runs

**Purpose:** Retrieve agent execution history

**Authentication:** Required

**Query Parameters:**

```typescript
const AgentRunQuerySchema = z.object({
  workflowIdentifier: z
    .enum([
      "smart-money-tracking",
      "narrative-scouting",
      "security-detection",
      "backtesting",
      "breakout-trading",
      "portfolio-management",
    ])
    .optional(),
  status: z.enum(["running", "completed", "failed"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
```

**Response Schema:**

```typescript
const AgentRunSchema = z.object({
  id: z.number(),
  userId: z.number(),
  workflowIdentifier: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  durationMs: z.number().nullable(),
  approvalRequestId: z.string().nullable(),
  outputData: z.record(z.unknown()).nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
});

const AgentRunListResponseSchema = z.object({
  runs: z.array(AgentRunSchema),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});
```

---

### 6.8.2 GET /agent-runs/:id

**Purpose:** Get single agent run by ID

**Authentication:** Required

**Response Schema:** `AgentRunSchema`

---

## 6.9 LLM Usage Endpoints

### 6.9.1 GET /llm-usage

**Purpose:** Retrieve LLM usage statistics and cost tracking

**Authentication:** Required

**Query Parameters:**

```typescript
const LLMUsageQuerySchema = z.object({
  provider: z.enum(["openai", "anthropic", "google"]).optional(),
  workflowIdentifier: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
```

**Response Schema:**

```typescript
const LLMUsageSchema = z.object({
  id: z.number(),
  userId: z.number(),
  provider: z.enum(["openai", "anthropic", "google"]),
  model: z.string(),
  workflowIdentifier: z.string().nullable(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  estimatedCostUsd: z.string(),
  durationMs: z.number(),
  createdAt: z.string().datetime(),
});

const LLMUsageListResponseSchema = z.object({
  usage: z.array(LLMUsageSchema),
  summary: z.object({
    totalCalls: z.number(),
    totalTokens: z.number(),
    totalCostUsd: z.string(),
    costByProvider: z.record(z.string()),
  }),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "usage": [
      {
        "id": 500,
        "userId": 10,
        "provider": "openai",
        "model": "gpt-4-turbo",
        "workflowIdentifier": "smart-money-tracking",
        "promptTokens": 1200,
        "completionTokens": 300,
        "totalTokens": 1500,
        "estimatedCostUsd": "0.021",
        "durationMs": 1250,
        "createdAt": "2025-10-20T14:00:00.000Z"
      }
    ],
    "summary": {
      "totalCalls": 250,
      "totalTokens": 375000,
      "totalCostUsd": "5.25",
      "costByProvider": {
        "openai": "3.50",
        "anthropic": "1.25",
        "google": "0.50"
      }
    },
    "pagination": {
      "total": 250,
      "limit": 50,
      "offset": 0,
      "hasMore": true
    }
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

### 6.9.2 GET /llm-usage/budget

**Purpose:** Get current LLM budget status

**Authentication:** Required

**Response Schema:**

```typescript
const BudgetStatusSchema = z.object({
  budgetUsd: z.string(),
  spendUsd: z.string(),
  remainingUsd: z.string(),
  percentUsed: z.number(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
```

**Response Example:**

```json
{
  "success": true,
  "data": {
    "budgetUsd": "400.00",
    "spendUsd": "125.50",
    "remainingUsd": "274.50",
    "percentUsed": 31.4,
    "periodStart": "2025-10-01T00:00:00.000Z",
    "periodEnd": "2025-10-31T23:59:59.999Z"
  },
  "timestamp": "2025-10-20T14:30:00.500Z"
}
```

---

## 6.10 WebSocket Protocol

**Connection URL:**

```
Development:  ws://localhost:3000/ws
Production:   wss://api.crypto-trading-ai.com/ws
```

**Authentication:**

> **Security Note:** Authentication uses message-based flow instead of query parameters to prevent token exposure in logs.

```typescript
// 1. Client connects without token in URL
const ws = new WebSocket("wss://api.crypto-trading-ai.com/ws");

// 2. After connection opens, send auth message
ws.onopen = () => {
  ws.send(JSON.stringify({
    action: "authenticate",
    token: "<access_token>"
  }));
};

// 3. Server responds with auth result
// Success: { "type": "auth_success", "userId": "...", "timestamp": "..." }
// Failure: { "type": "auth_error", "code": "INVALID_TOKEN", "message": "..." }

// 4. Server ignores all other messages until authenticated
```

### 6.10.1 Event Types

**1. smart_money_alert**

Emitted when new smart money transaction detected.

```typescript
interface SmartMoneyAlertEvent {
  type: "smart_money_alert";
  data: {
    walletAddress: string;
    blockchain: string;
    tokenSymbol: string;
    direction: "buy" | "sell" | "transfer";
    usdValue: string;
    confidenceScore: number;
    reasoning: string;
  };
  timestamp: string;
}
```

**Example:**

```json
{
  "type": "smart_money_alert",
  "data": {
    "walletAddress": "0x1234...",
    "blockchain": "ethereum",
    "tokenSymbol": "PEPE",
    "direction": "buy",
    "usdValue": "50000.00",
    "confidenceScore": 9,
    "reasoning": "Whale accumulation detected"
  },
  "timestamp": "2025-10-20T14:30:00.000Z"
}
```

---

**2. narrative_update**

Emitted when narrative strength score changes significantly.

```typescript
interface NarrativeUpdateEvent {
  type: "narrative_update";
  data: {
    narrativeId: number;
    title: string;
    oldStrength: number;
    newStrength: number;
    changePercent: number;
  };
  timestamp: string;
}
```

---

**3. trade_signal**

Emitted when new trade signal requires approval.

```typescript
interface TradeSignalEvent {
  type: "trade_signal";
  data: {
    signalId: number;
    tokenSymbol: string;
    signalType: "long" | "short";
    entryPriceUsd: string;
    confidenceScore: number;
    reasoning: string;
    approvalRequestId: string;
    expiresAt: string;
  };
  timestamp: string;
}
```

---

**4. trade_update**

Emitted when trade status changes (opened, closed, stop-loss hit, etc.).

```typescript
interface TradeUpdateEvent {
  type: "trade_update";
  data: {
    tradeId: number;
    status: "open" | "closed";
    tokenSymbol: string;
    currentPnL: string;
    currentPnLPercentage: string;
    reason?: string; // e.g., "Stop loss hit", "Take profit reached"
  };
  timestamp: string;
}
```

---

**5. security_alert**

Emitted when high-risk contract detected.

```typescript
interface SecurityAlertEvent {
  type: "security_alert";
  data: {
    contractAddress: string;
    blockchain: string;
    riskLevel: "critical" | "high";
    riskScore: number;
    findings: {
      honeypot: boolean;
      mintable: boolean;
      renounced: boolean;
    };
  };
  timestamp: string;
}
```

---

### 6.10.2 Client Subscription

Clients can subscribe to specific event types:

```typescript
// Subscribe to specific events
ws.send(
  JSON.stringify({
    action: "subscribe",
    events: ["smart_money_alert", "trade_signal", "trade_update"],
  })
);

// Unsubscribe
ws.send(
  JSON.stringify({
    action: "unsubscribe",
    events: ["smart_money_alert"],
  })
);
```

---

## 6.11 Error Response Format

All API errors follow this standardized format:

```typescript
interface APIError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}
```

### 6.11.1 Standard Error Codes

| HTTP Status | Error Code              | Description                         |
| ----------- | ----------------------- | ----------------------------------- |
| 400         | `VALIDATION_ERROR`      | Request validation failed           |
| 400         | `INVALID_CHALLENGE`     | WebAuthn challenge expired/invalid  |
| 400         | `ATTESTATION_VERIFICATION_FAILED` | WebAuthn credential verification failed |
| 401         | `UNAUTHORIZED`          | Missing or invalid authentication   |
| 401         | `ASSERTION_VERIFICATION_FAILED` | WebAuthn signature verification failed |
| 401         | `INVALID_TOKEN`         | Expired or malformed JWT            |
| 401         | `SESSION_EXPIRED`       | Session no longer valid             |
| 403         | `FORBIDDEN`             | User lacks permission               |
| 403         | `ACCOUNT_SUSPENDED`     | Account disabled                    |
| 404         | `NOT_FOUND`             | Resource not found                  |
| 404         | `USER_NOT_FOUND`        | No user with this email             |
| 409         | `CONFLICT`              | Resource already exists             |
| 409         | `EMAIL_ALREADY_EXISTS`  | Email taken                         |
| 429         | `RATE_LIMIT_EXCEEDED`   | Too many requests                   |
| 500         | `INTERNAL_SERVER_ERROR` | Unexpected server error             |
| 502         | `OAUTH_PROVIDER_ERROR`  | OAuth provider returned error       |
| 503         | `SERVICE_UNAVAILABLE`   | External service down               |

### 6.11.2 Validation Error Example

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "email": "Invalid email format",
      "challengeId": "Invalid UUID format"
    }
  },
  "timestamp": "2026-01-15T14:30:00.500Z"
}
```

### 6.11.3 Rate Limiting

Rate limits apply per user:

- **Authenticated endpoints**: 1000 requests/hour
- **Unauthenticated endpoints**: 100 requests/hour

Headers included in all responses:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 1634745600
```

---

## Implementation Notes

### Middleware Stack

All API routes use this middleware stack:

```typescript
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(rateLimiter);
app.use(requestLogger);
app.use(authMiddleware); // JWT verification
app.use(validationMiddleware); // Zod schemas
```

### Example Route Handler

```typescript
import { Request, Response, NextFunction } from "express";

// Route with Zod validation and Result pattern
app.get(
  "/api/v1/smart-money/transactions",
  validateQuery(SmartMoneyQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.id; // From auth middleware
    const query = req.query as z.infer<typeof SmartMoneyQuerySchema>;

    const result = await smartMoneyService.getTransactions(userId, query);

    if (!result.success) {
      return next(result.error); // Error handler middleware
    }

    res.json({
      success: true,
      data: result.value,
      timestamp: new Date().toISOString(),
    });
  }
);
```

---

## Next Steps

1. Implement API route handlers for all 29 endpoints
2. Create Zod validation middleware
3. Implement WebAuthn credential management service
4. Implement OAuth provider integrations (Google, Apple)
5. Implement WebSocket server with message-based auth
6. Add API documentation with Swagger/OpenAPI
7. Create Postman collection for testing

---

**Related Modules:**

- [TSD-Services.md](./04-TSD-Services.md) - Service layer used by API
- [TSD-Authentication.md](./04-TSD-Authentication.md) - WebAuthn/OAuth implementation details
- [TSD-Database.md](./04-TSD-Database.md) - Database schemas
- [TSD-DevOps.md](./04-TSD-DevOps.md) - API deployment configuration
- [TSD-Dev-Environment.md](./04-TSD-Dev-Environment.md) - TypeScript configuration

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-20 | Initial | Initial API specification |
| 2.0 | 2026-01-15 | Multi-model Review | Complete rewrite of Section 6.2 for passwordless auth (WebAuthn + OAuth), updated blockchain enums for L2-first strategy, replaced Twitter with Farcaster/Lens in social enums, improved WebSocket auth security, updated LLM budget examples |
