---
id: ADD-CRYPTO
title: Crypto Domain Architecture Design Document
status: Phase 1 Complete
version: 1.0.0
owner: '@owner'
last_updated: '2026-03-12'
parent: platform-core-add.md
---

# Crypto Domain Architecture Design Document

**Domain**: Cryptocurrency Trading & Security Analysis
**FRD Reference**: [crypto-domain-frd.md](../02-requirements/crypto-domain-frd.md)
**Platform ADD**: [platform-core-add.md](platform-core-add.md) (shared infrastructure)

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-03-12 | Initial as-built — Phase 1 complete (Sprints 6-7) |

---

## 1. Domain Boundary

The crypto domain owns all trading, security analysis, and portfolio management concerns. It depends on — but does not modify — platform-core services.

### 1.1 Owned by Crypto Domain

| Component | Location |
|-----------|----------|
| Database tables | `monitored_wallets`, `trade_signals`, `trade_executions`, `security_reports`, `portfolio_states` |
| Store adapters | `TradeSignalStore`, `TradeExecutionStore`, `SecurityReportStore` (+ `WalletStore` schema-ready) |
| Workflows | `crypto-paper-trade`, `crypto-security-scan` |
| RBAC | `trader`, `trader-readonly`, `risk-manager` roles; 16 crypto permissions |
| Notification templates | `crypto-trade-alert`, `crypto-signal-approval` |
| Inngest events | `crypto/signal.created`, `crypto/security.scan.requested` |

### 1.2 Consumed from Platform Core

| Service | Usage |
|---------|-------|
| LLM Gateway | Trade signal analysis (`gpt-4o`) |
| HITL Gateway | Paper trade approval requests |
| Audit Service | Trade execution + security scan audit trails |
| Notification Service | Approver notifications (fire-and-forget) |
| MCP Layer | External tool calls (`crypto-scanner`) |
| File Storage | Not currently used (Phase 2: report exports) |

---

## 2. Database Architecture

### 2.1 Entity-Relationship Summary

```
monitored_wallets (L2 chains)
         |
    [signal generation]
         |
    trade_signals ──────── trade_executions
    (pending/approved)      (paper/live, open/closed)
         |
    security_reports ──── portfolio_states
    (cached 1hr)           (daily snapshots)
```

### 2.2 Table Definitions

#### monitored_wallets

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `address` | varchar(100) | NOT NULL |
| `chain` | varchar(20) | NOT NULL — `base` \| `arbitrum` \| `optimism` |
| `label` | varchar(100) | nullable |
| `threshold_usd` | numeric(12,2) | default `10000` |
| `is_enabled` | boolean | default `true` |
| `created_at` | timestamp(tz) | default `now()` |
| `updated_at` | timestamp(tz) | default `now()` |

#### trade_signals

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `token` | varchar(50) | NOT NULL |
| `direction` | varchar(10) | NOT NULL — `long` \| `short` |
| `entry_zone` | numeric(18,8) | nullable |
| `stop_loss` | numeric(18,8) | nullable |
| `take_profit` | numeric(18,8) | nullable |
| `reasoning` | text | nullable — LLM-generated analysis |
| `confidence_score` | numeric(5,2) | nullable — 0.00-100.00 |
| `status` | varchar(20) | NOT NULL — `pending` \| `approved` \| `rejected` \| `expired` \| `executed` |
| `expires_at` | timestamp(tz) | nullable |
| `created_at` | timestamp(tz) | default `now()` |

#### trade_executions

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `signal_id` | uuid | FK → `trade_signals.id` |
| `exchange` | varchar(50) | NOT NULL |
| `entry_price` | numeric(18,8) | nullable |
| `exit_price` | numeric(18,8) | nullable |
| `size_usd` | numeric(12,2) | nullable |
| `pnl_usd` | numeric(12,2) | nullable |
| `status` | varchar(20) | NOT NULL — `open` \| `closed` \| `canceled` |
| `is_paper` | boolean | NOT NULL, default `true` |
| `risk_data` | jsonb | nullable |
| `opened_at` | timestamp(tz) | default `now()` |
| `closed_at` | timestamp(tz) | nullable |

#### security_reports

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `token_address` | varchar(100) | NOT NULL |
| `chain` | varchar(20) | NOT NULL |
| `liquidity_usd` | numeric(14,2) | nullable |
| `is_honeypot` | boolean | NOT NULL, default `false` |
| `is_mintable` | boolean | NOT NULL, default `false` |
| `ownership_renounced` | boolean | default `false` |
| `risk_score` | integer | NOT NULL — 0-100 |
| `reasons` | jsonb | default `[]` |
| `status` | varchar(20) | NOT NULL, default `completed` |
| `scanned_at` | timestamp(tz) | default `now()` |
| `created_at` | timestamp(tz) | default `now()` |

#### portfolio_states

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `total_value_usd` | numeric(14,2) | nullable |
| `positions` | jsonb | nullable — `{ token, size, entryPrice, currentPrice }[]` |
| `daily_pnl_usd` | numeric(12,2) | nullable |
| `drawdown_pct` | numeric(5,2) | nullable |
| `snapshot_at` | timestamp(tz) | default `now()` |

---

## 3. Store Adapters

All stores follow the platform-core factory pattern: `createDrizzle*Store(db) → *Store`.

### 3.1 TradeSignalStore

```typescript
interface TradeSignalStore {
  create(signal: { token; direction; entryZone?; stopLoss?; takeProfit?;
    reasoning?; confidenceScore?; status; expiresAt? }): Promise<{ id: string }>;
  findPending(): Promise<TradeSignalRecord[]>;
  updateStatus(id: string, status: string): Promise<void>;
  findById(id: string): Promise<TradeSignalRecord | null>;
}
```

### 3.2 TradeExecutionStore

```typescript
interface TradeExecutionStore {
  create(execution: { signalId; exchange; entryPrice?; sizeUsd?;
    status; isPaper; riskData? }): Promise<{ id: string }>;
  findOpen(): Promise<TradeExecutionRecord[]>;
  close(id: string, exitPrice: string, pnlUsd: string): Promise<void>;
  findById(id: string): Promise<TradeExecutionRecord | null>;
}
```

### 3.3 SecurityReportStore

```typescript
interface SecurityReportStore {
  create(report: { tokenAddress; chain; liquidityUsd?; isHoneypot; isMintable;
    ownershipRenounced?; riskScore; reasons?; status? }): Promise<{ id: string }>;
  findByToken(tokenAddress: string, chain: string): Promise<SecurityReportRecord | null>;
  findRecent(tokenAddress: string, chain: string, withinMs: number): Promise<SecurityReportRecord | null>;
}
```

`findRecent()` enables 1-hour TTL caching — returns the most recent report if `scannedAt` is within `withinMs` of now.

### 3.4 Composition Root Wiring

```typescript
// apps/web/src/lib/services.ts
export const getCryptoTradeSignalStore = lazy(() =>
  createDrizzleTradeSignalStore(db()),
);
export const getCryptoExecutionStore = lazy(() =>
  createDrizzleTradeExecutionStore(db()),
);
export const getSecurityReportStore = lazy(() =>
  createDrizzleSecurityReportStore(db()),
);
```

---

## 4. Workflow Architecture

### 4.1 Paper Trading Workflow (S6-CRY-01)

**Trigger**: `crypto/signal.created`
**Retries**: 0 (manual retry via UI)

#### Pipeline

| Step | Type | Description |
|------|------|-------------|
| 1. `llm-analyze` | LLM Gateway | GPT-4o analyzes signal — token, direction, confidence |
| 2. `risk-check` | Validation | Position limits, R:R ratio, concurrent position cap |
| 3. `hitl-request` | HITL Gateway | Creates approval request (15min timeout) |
| 4. `notify-approver` | Notification | Email via `crypto-signal-approval` template (fire-and-forget) |
| 5. `wait-for-trade-decision` | Event Wait | `hitl/decision.recorded` — approve/reject/timeout |
| 6. `execute-paper` | Simulation | Slippage 0.5%, fees 0.1%, default $1000 size |
| 7. `audit-trail` | Audit | `crypto.trade.paper-executed` (fire-and-forget) |

#### Risk Configuration

```typescript
const RISK_LIMITS = {
  maxPositionPct: 0.03,       // 3% of portfolio per position
  maxConcurrentPositions: 5,
  minRewardRiskRatio: 2,      // minimum 1:2 R:R
} as const;
```

#### Result Type

```typescript
type PaperTradeResult =
  | { status: 'executed'; tradeId: string; entryPrice: string; signalId: string }
  | { status: 'rejected'; signalId: string; reason: string }
  | { status: 'expired'; signalId: string }
  | { status: 'risk-rejected'; signalId: string; reason: string }
  | { status: 'error'; step: string; error: string };
```

#### State Transition Diagram

```
crypto/signal.created
         |
    [llm-analyze]
         |
    [risk-check] ──(fail)──> RISK_REJECTED
         | (pass)
    [hitl-request] + [notify-approver]
         |
    [wait-for-decision]
         |---(timeout 15m)---> EXPIRED
         |---(rejected)------> REJECTED
         |---(approved)
         |
    [execute-paper]
         |---(success)---> [audit-trail] ---> EXECUTED
         |---(error)-----> ERROR
```

### 4.2 Security Scan Workflow (S7-CRY-01)

**Trigger**: `crypto/security.scan.requested`
**Retries**: 1

#### Pipeline

| Step | Type | Description |
|------|------|-------------|
| 1. `check-cache` | Store | `findRecent(token, chain, 3600000)` — 1hr TTL |
| 2. `liquidity-check` | MCP | `crypto-scanner.check-liquidity` — returns `liquidityUsd` |
| 3. `contract-scan` | MCP | `crypto-scanner.scan-contract` — honeypot, mintable, ownership |
| 4. `risk-scoring` | Compute | Score 0-100 + status determination + DB persist + audit |

#### Risk Scoring Formula

| Condition | Points |
|-----------|--------|
| Honeypot detected | +40 |
| Mintable token | +25 |
| Ownership NOT renounced | +15 |
| Liquidity < $50,000 | +20 |

**Status thresholds**: `dangerous` (>= 60), `warning` (30-59), `safe` (< 30)

#### MCP Failure Handling

Both MCP steps degrade gracefully on failure:
- `liquidity-check` failure: defaults to `liquidityUsd: 0` (worst case)
- `contract-scan` failure: defaults to `isHoneypot: true, isMintable: true` (worst case)

This ensures security scans never produce false-safe results on infrastructure failure.

#### Result Type

```typescript
type SecurityScanResult =
  | { status: 'cached'; report: SecurityReport }
  | { status: 'scanned'; report: SecurityReport }
  | { status: 'error'; step: string; error: string };
```

#### State Transition Diagram

```
crypto/security.scan.requested
         |
    [check-cache]
         |---(hit)---> CACHED
         |---(miss)
         |
    [liquidity-check] (MCP, defaults on fail)
         |
    [contract-scan] (MCP, defaults on fail)
         |
    [risk-scoring] ---> store + audit ---> SCANNED
```

---

## 5. RBAC Model

### 5.1 Roles

| Role | Scope | Description |
|------|-------|-------------|
| `trader` | Full trading | Create signals, execute trades, view portfolio |
| `trader-readonly` | View only | View signals, trades, portfolio — no execution |
| `risk-manager` | Oversight | View + pause trades, manage wallets |

### 5.2 Permissions Matrix

| Permission | trader | trader-readonly | risk-manager |
|------------|--------|-----------------|--------------|
| `crypto/signal.create` | x | | |
| `crypto/signal.view` | x | x | x |
| `crypto/trade.execute` | x | | |
| `crypto/trade.view` | x | x | x |
| `crypto/trade.pause` | | | x |
| `crypto/portfolio.view` | x | x | x |
| `crypto/wallet.view` | x | x | x |
| `crypto/wallet.manage` | | | x |

**Enforcement**: `checkPermission(permission)` middleware from platform-core RBAC — see [ADD §14.10](platform-core-add.md).

---

## 6. MCP Integrations

### 6.1 Registered Servers

| Server | Transport | Purpose | Status |
|--------|-----------|---------|--------|
| `dexscreener` | HTTP | DEX market data | Seeded |
| `crypto-scanner` | HTTP | Contract security analysis | Used by security-scan workflow |

### 6.2 Phase 2+ MCP Servers (from FRD)

| Server | Purpose |
|--------|---------|
| The Graph | Blockchain subgraph queries |
| Block Explorers | Etherscan/Arbiscan/Basescan APIs |
| CoinGecko | Price feeds + market data |
| GoPlus | Advanced security scanning |
| LunarCrush | Social sentiment analysis |

---

## 7. Notification Templates

| Slug | Domain | Variables | Usage |
|------|--------|-----------|-------|
| `crypto-trade-alert` | crypto | `token`, `direction`, `size` | Post-execution notification |
| `crypto-signal-approval` | crypto | `token`, `reasoning`, `confidenceScore` | HITL approval request |

---

## 8. Inngest Event Schema

```typescript
type CryptoEvents = {
  'crypto/signal.created': {
    data: {
      signalId: string;
      token: string;
      direction: string;
      confidenceScore: string;
    };
  };
  'crypto/security.scan.requested': {
    data: {
      tokenAddress: string;
      chain: string;
      requestedBy: string;
    };
  };
};
```

---

## 9. Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Paper-only in Phase 1 | Risk mitigation — validate signal quality before live execution |
| 15-min HITL timeout | Crypto signals are time-sensitive; expired signals lose value |
| MCP worst-case defaults | Security scans must never produce false-safe results |
| 1-hour cache TTL | Balances freshness with API rate limits on external scanners |
| 3% position cap | Standard risk management — prevents concentration risk |
| 1:2 minimum R:R | Ensures positive expected value even at 50% win rate |
| Separate domain ADD | Platform ADD is 192KB; domain architecture evolves independently |

---

## 10. Phase 2 Pointers

| Item | Source | Description |
|------|--------|-------------|
| DuckDB analytics | FRD §5.1 | Backtesting + portfolio analytics with columnar storage |
| Advanced trading strategies | FRD §5.2 | Narrative scouting, breakout detection, portfolio rebalancing |
| Exchange integrations | FRD §5.3 | Live execution via CEX/DEX APIs |
| L1 chain support | FRD §5.4 | Ethereum, Solana, BNB, Polygon |
| Circuit breaker | FRD §4.3 | Daily loss limit enforcement at portfolio level |
| Multi-sig approvals | ADD §14 | High-value trade approval chains |

---

## 11. File Reference

| Artifact | Path |
|----------|------|
| FRD | `docs/02-requirements/crypto-domain-frd.md` |
| Database TSD | `docs/04-specs/crypto/database.md` |
| Workflow TSD | `docs/04-specs/crypto/workflow-engine.md` |
| MCP TSD | `docs/04-specs/crypto/mcp-servers.md` |
| API TSD | `docs/04-specs/crypto/api.md` |
| Schema | `packages/database/src/schema/crypto-domain.ts` |
| Store adapters | `packages/database/src/adapters/crypto-stores.ts` |
| Security report store | `packages/database/src/adapters/security-report-store.ts` |
| Seeds | `packages/database/src/seeds/crypto-seeds.ts` |
| Paper trade workflow | `apps/web/src/lib/workflows/crypto-paper-trade.ts` |
| Security scan workflow | `apps/web/src/lib/workflows/crypto-security-scan.ts` |
| Composition root | `apps/web/src/lib/services.ts` |
