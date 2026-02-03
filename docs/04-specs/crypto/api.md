---
id: TSD-CRYPTO-API
title: Crypto Trading API Specifications
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-02'
parent: ../../03-architecture/platform-core-add.md
domain: crypto
---

# Crypto Trading API Specifications

**Crypto Domain – REST API & WebSocket**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0.0 | 2026-02-02 | Document Review | Extracted from crypto temp files, aligned with Platform Core |

---

## 1. Overview

This document defines the REST API endpoints and WebSocket protocol for the **Crypto Trading Domain**. These endpoints extend the Platform Core API with trading-specific functionality.

**Contents:**
- 21 crypto-specific REST endpoints
- 5 WebSocket event types
- Request/response schemas (Zod)
- Error codes

> **Note:** Platform Core API endpoints (authentication, HITL gateway, notifications) are defined in [../api.md](../api.md).

---

## 2. API Architecture

### 2.1 Base URL

```
Development:  http://localhost:3000/api/v1
Production:   https://api.aptivo-trading.com/v1
```

### 2.2 Authentication

All endpoints require JWT bearer token (see Platform Core authentication):

```http
Authorization: Bearer <access_token>
```

### 2.3 Standard Response Envelope

```typescript
// success response
interface SuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string; // ISO 8601
}

// error response (RFC 7807)
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

## 3. Smart Money Endpoints

### 3.1 GET /smart-money/transactions

**Purpose:** Retrieve smart money transaction history

**Query Parameters:**

```typescript
const SmartMoneyQuerySchema = z.object({
  walletAddress: z.string().optional(),
  // Phase 1: L2-only. See database.md Appendix A for Phase 3+ chains.
  blockchain: z.enum(['arbitrum', 'base', 'optimism']).optional(),
  tokenSymbol: z.string().optional(),
  direction: z.enum(['buy', 'sell', 'transfer']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['timestamp', 'usd_value', 'confidence_score']).default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

**Response:**

```typescript
const SmartMoneyTransactionSchema = z.object({
  id: z.number(),
  walletAddress: z.string(),
  blockchain: z.string(), // Phase 1: returns L2 chains only (arbitrum, base, optimism)
  tokenSymbol: z.string().nullable(),
  tokenAddress: z.string().nullable(),
  amount: z.string(),
  direction: z.enum(['buy', 'sell', 'transfer']),
  usdValue: z.string().nullable(),
  transactionHash: z.string(),
  blockNumber: z.number().nullable(),
  timestamp: z.string().datetime(),
  aiReasoning: z.string().nullable(),
  confidenceScore: z.number().int().min(1).max(10).nullable(),
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

### 3.2 GET /smart-money/transactions/:id

**Purpose:** Get single transaction by ID

### 3.3 POST /smart-money/transactions/:id/feedback

**Purpose:** Submit user feedback on transaction analysis

**Request:**

```typescript
const TransactionFeedbackSchema = z.object({
  feedback: z.string().min(1).max(500),
  rating: z.number().int().min(1).max(5).optional(),
});
```

---

## 4. Narrative Endpoints

### 4.1 GET /narratives

**Purpose:** Retrieve trending crypto narratives

**Query Parameters:**

```typescript
const NarrativeQuerySchema = z.object({
  category: z.string().optional(),
  minStrength: z.number().int().min(1).max(10).optional(),
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['strength_score', 'last_updated_timestamp']).default('strength_score'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

**Response:**

```typescript
const NarrativeSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
  strengthScore: z.number().int().min(1).max(10),
  socialPostCount: z.number().int(),
  lastUpdatedTimestamp: z.string().datetime(),
  createdAt: z.string().datetime(),
});
```

### 4.2 GET /narratives/:id

**Purpose:** Get single narrative by ID

### 4.3 GET /narratives/:id/social-posts

**Purpose:** Get social media posts related to narrative

**Query Parameters:**

```typescript
const SocialPostQuerySchema = z.object({
  platform: z.enum(['farcaster', 'lens', 'reddit', 'telegram', 'discord']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
```

---

## 5. Security Endpoints

### 5.1 GET /security/scans

**Purpose:** Retrieve smart contract security scan results

**Query Parameters:**

```typescript
const SecurityScanQuerySchema = z.object({
  contractAddress: z.string().optional(),
  riskLevel: z.enum(['critical', 'high', 'medium', 'low', 'safe']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['scanned_timestamp', 'risk_level']).default('scanned_timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

**Response:**

```typescript
const SecurityScanSchema = z.object({
  id: z.number(),
  contractAddress: z.string(),
  blockchain: z.string(), // Phase 1: returns L2 chains only (arbitrum, base, optimism)
  scanTool: z.string(),
  riskLevel: z.enum(['critical', 'high', 'medium', 'low', 'safe']),
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
```

### 5.2 GET /security/scans/:id

**Purpose:** Get single security scan by ID

### 5.3 POST /security/scans

**Purpose:** Request new contract security scan

**Request:**

```typescript
const RequestScanSchema = z.object({
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  // Phase 1: L2-only. See database.md Appendix A for Phase 3+ chains.
  blockchain: z.enum(['arbitrum', 'base', 'optimism']),
});
```

**Response:**

```typescript
const ScanRequestResponseSchema = z.object({
  scanId: z.number(),
  status: z.literal('queued'),
  estimatedCompletionTime: z.string().datetime(),
});
```

---

## 6. Trade Signal Endpoints

### 6.1 GET /trade-signals

**Purpose:** Retrieve trade signals for user

**Query Parameters:**

```typescript
const TradeSignalQuerySchema = z.object({
  status: z.enum(['pending_approval', 'approved', 'rejected', 'expired', 'executed']).optional(),
  signalType: z.enum(['buy', 'sell']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['created_timestamp', 'confidence_score']).default('created_timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

**Response:**

```typescript
const TradeSignalSchema = z.object({
  id: z.number(),
  userId: z.number(),
  workflowIdentifier: z.string(),
  tokenSymbol: z.string(),
  tokenAddress: z.string().nullable(),
  blockchain: z.string(), // Phase 1: returns L2 chains only (arbitrum, base, optimism)
  signalType: z.enum(['buy', 'sell']),
  entryPrice: z.string().nullable(),
  stopLoss: z.string().nullable(),
  takeProfit: z.string().nullable(),
  positionSizeUsd: z.string().nullable(),
  aiReasoning: z.string(),
  confidenceScore: z.number().int().min(1).max(10),
  status: z.enum(['pending_approval', 'approved', 'rejected', 'expired', 'executed']),
  createdTimestamp: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
```

### 6.2 GET /trade-signals/:id

**Purpose:** Get single trade signal by ID

### 6.3 POST /trade-signals/:id/approve

**Purpose:** Approve trade signal (HITL)

**Request:**

```typescript
const ApproveSignalSchema = z.object({
  reason: z.string().max(500).optional(),
  adjustedEntryPrice: z.string().optional(),
  adjustedStopLoss: z.string().optional(),
  adjustedTakeProfit: z.string().optional(),
});
```

### 6.4 POST /trade-signals/:id/reject

**Purpose:** Reject trade signal (HITL)

**Request:**

```typescript
const RejectSignalSchema = z.object({
  reason: z.string().min(1).max(500),
});
```

---

## 7. Trade Endpoints

### 7.1 GET /trades

**Purpose:** Retrieve user's trade history

**Query Parameters:**

```typescript
const TradeQuerySchema = z.object({
  status: z.enum(['open', 'closed', 'stopped_out', 'target_hit']).optional(),
  tokenSymbol: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  sortBy: z.enum(['opened_timestamp', 'p_l_usd']).default('opened_timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

**Response:**

```typescript
const TradeSchema = z.object({
  id: z.number(),
  userId: z.number(),
  signalId: z.number().nullable(),
  tokenSymbol: z.string(),
  tokenAddress: z.string().nullable(),
  blockchain: z.string(), // Phase 1: returns L2 chains only (arbitrum, base, optimism)
  tradeType: z.enum(['buy', 'sell']),
  entryPrice: z.string(),
  exitPrice: z.string().nullable(),
  positionSizeUsd: z.string(),
  status: z.enum(['open', 'closed', 'stopped_out', 'target_hit']),
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
    winRate: z.number(),
  }),
  pagination: z.object({
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
    hasMore: z.boolean(),
  }),
});
```

### 7.2 GET /trades/:id

**Purpose:** Get single trade by ID

### 7.3 POST /trades/:id/close

**Purpose:** Manually close an open trade

**Request:**

```typescript
const CloseTradeSchema = z.object({
  exitPrice: z.string().optional(),
  reason: z.string().max(500).optional(),
});
```

### 7.4 GET /trades/stats

**Purpose:** Get user trading statistics

**Query Parameters:**

```typescript
const TradeStatsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});
```

**Response:**

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

## 8. Agent Run Endpoints

### 8.1 GET /agent-runs

**Purpose:** Retrieve agent execution history

**Query Parameters:**

```typescript
const AgentRunQuerySchema = z.object({
  workflowIdentifier: z.enum([
    'smart-money-tracking',
    'narrative-scouting',
    'security-detection',
    'backtesting',
    'breakout-trading',
    'portfolio-management',
  ]).optional(),
  status: z.enum(['running', 'completed', 'failed', 'paused_for_approval']).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});
```

**Response:**

```typescript
const AgentRunSchema = z.object({
  id: z.number(),
  userId: z.number().nullable(),
  workflowIdentifier: z.string(),
  executionStatus: z.enum(['running', 'completed', 'failed', 'paused_for_approval']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  durationMs: z.number().nullable(),
  approvalRequestId: z.number().nullable(),
  outputData: z.record(z.unknown()).nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
});
```

### 8.2 GET /agent-runs/:id

**Purpose:** Get single agent run by ID

---

## 9. Wallet Watchlist Endpoints

### 9.1 GET /watchlist

**Purpose:** Get user's monitored wallets

### 9.2 POST /watchlist

**Purpose:** Add wallet to watchlist

**Request:**

```typescript
const AddWatchlistSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  // Phase 1: L2-only. See database.md Appendix A for Phase 3+ chains.
  blockchain: z.enum(['arbitrum', 'base', 'optimism']),
  label: z.string().max(100).optional(),
  minTransactionUsd: z.number().min(0).default(10000),
});
```

### 9.3 DELETE /watchlist/:id

**Purpose:** Remove wallet from watchlist

---

## 10. WebSocket Protocol

**Connection URL:**

```
Development:  ws://localhost:3000/ws
Production:   wss://api.aptivo-trading.com/ws
```

### 10.1 Authentication

Authentication uses message-based flow (tokens not in URL):

```typescript
// 1. Client connects
const ws = new WebSocket('wss://api.aptivo-trading.com/ws');

// 2. After open, send auth
ws.onopen = () => {
  ws.send(JSON.stringify({
    action: 'authenticate',
    token: '<access_token>'
  }));
};

// 3. Server responds
// Success: { "type": "auth_success", "userId": "...", "timestamp": "..." }
// Failure: { "type": "auth_error", "code": "INVALID_TOKEN", "message": "..." }
```

### 10.2 Event Types

**1. smart_money_alert**

```typescript
interface SmartMoneyAlertEvent {
  type: 'smart_money_alert';
  data: {
    walletAddress: string;
    blockchain: string;
    tokenSymbol: string;
    direction: 'buy' | 'sell' | 'transfer';
    usdValue: string;
    confidenceScore: number;
    reasoning: string;
  };
  timestamp: string;
}
```

**2. narrative_update**

```typescript
interface NarrativeUpdateEvent {
  type: 'narrative_update';
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

**3. trade_signal**

```typescript
interface TradeSignalEvent {
  type: 'trade_signal';
  data: {
    signalId: number;
    tokenSymbol: string;
    signalType: 'buy' | 'sell';
    entryPriceUsd: string;
    confidenceScore: number;
    reasoning: string;
    expiresAt: string;
  };
  timestamp: string;
}
```

**4. trade_update**

```typescript
interface TradeUpdateEvent {
  type: 'trade_update';
  data: {
    tradeId: number;
    status: 'open' | 'closed' | 'stopped_out' | 'target_hit';
    tokenSymbol: string;
    currentPnL: string;
    currentPnLPercentage: string;
    reason?: string;
  };
  timestamp: string;
}
```

**5. security_alert**

```typescript
interface SecurityAlertEvent {
  type: 'security_alert';
  data: {
    contractAddress: string;
    blockchain: string;
    riskLevel: 'critical' | 'high';
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

### 10.3 Subscription

```typescript
// subscribe to events
ws.send(JSON.stringify({
  action: 'subscribe',
  events: ['smart_money_alert', 'trade_signal', 'trade_update'],
}));

// unsubscribe
ws.send(JSON.stringify({
  action: 'unsubscribe',
  events: ['smart_money_alert'],
}));
```

---

## 11. Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Request validation failed |
| 400 | `INVALID_BLOCKCHAIN` | Unsupported blockchain |
| 400 | `INVALID_CONTRACT_ADDRESS` | Malformed contract address |
| 401 | `UNAUTHORIZED` | Missing or invalid authentication |
| 403 | `SIGNAL_EXPIRED` | Trade signal has expired |
| 403 | `TRADE_ALREADY_CLOSED` | Cannot close already-closed trade |
| 404 | `TRANSACTION_NOT_FOUND` | Smart money transaction not found |
| 404 | `NARRATIVE_NOT_FOUND` | Narrative not found |
| 404 | `SIGNAL_NOT_FOUND` | Trade signal not found |
| 404 | `TRADE_NOT_FOUND` | Trade not found |
| 404 | `SCAN_NOT_FOUND` | Security scan not found |
| 409 | `WALLET_ALREADY_WATCHED` | Wallet already in watchlist |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 503 | `BLOCKCHAIN_UNAVAILABLE` | Blockchain RPC unavailable |

---

## 12. Rate Limiting

| Endpoint Category | Limit |
|-------------------|-------|
| Read endpoints | 1000 requests/hour |
| Write endpoints | 100 requests/hour |
| Security scan requests | 10 requests/hour |
| WebSocket connections | 5 per user |

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Smart Money Tracking API | crypto-domain-frd.md | FR-CRYPTO-SMT-001 to 003 |
| Narrative Scouting API | crypto-domain-frd.md | FR-CRYPTO-NS-001 to 002 |
| Security Detection API | crypto-domain-frd.md | FR-CRYPTO-SEC-001 |
| Trade Execution API | crypto-domain-frd.md | FR-CRYPTO-TRD-001 to 004 |
| Risk Management API | crypto-domain-frd.md | FR-CRYPTO-RISK-001 to 003 |
| API Standards | api.md | All sections |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| WebSocket Events | 05-guidelines/05a-Coding-Guidelines.md | Real-time patterns |
