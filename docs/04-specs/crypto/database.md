---
id: TSD-CRYPTO-DATABASE
title: Crypto Trading Database Schema
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-02'
parent: ../../03-architecture/platform-core-add.md
domain: crypto
---

# Crypto Trading Database Schema

**Crypto Domain – Trading Tables**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0.0 | 2026-02-02 | Document Review | Extracted from crypto temp files, aligned with Platform Core |

---

## 1. Overview

This document defines the PostgreSQL database schema for the **Crypto Trading Domain**. These tables extend the Platform Core database schema with trading-specific entities.

**Contents:**
- 8 crypto-specific tables
- Indexes and query optimization
- Kysely type definitions
- DuckDB analytics integration (Phase 2+)

> **Note:** Platform Core tables (users, authenticators, oauth_accounts, sessions, audit_logs, hitl_requests, llm_usage_logs, notification_templates) are defined in [../database.md](../database.md).

---

## 2. Crypto Trading Tables

### 2.1 Smart Money Transactions Table

**Purpose:** Store blockchain transactions from tracked smart money wallets.

**Implements:** FR-SMT-001 (Smart money wallet monitoring)

```sql
CREATE TABLE smart_money_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(255) NOT NULL,
  blockchain VARCHAR(50) NOT NULL,
  token_symbol VARCHAR(20),
  token_address VARCHAR(255),
  amount DECIMAL(38, 18),
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('buy', 'sell', 'transfer')),
  usd_value DECIMAL(18, 2),
  transaction_hash VARCHAR(255) UNIQUE NOT NULL,
  block_number BIGINT,
  timestamp TIMESTAMP NOT NULL,
  ai_reasoning TEXT,
  confidence_score INTEGER CHECK (confidence_score BETWEEN 1 AND 10),
  user_feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE smart_money_transactions IS 'Blockchain transactions from monitored smart money wallets';
COMMENT ON COLUMN smart_money_transactions.wallet_address IS 'EVM-compatible wallet address (0x format)';
COMMENT ON COLUMN smart_money_transactions.blockchain IS 'Phase 1: arbitrum, base, optimism (L2-first). See Appendix A for Phase 3+ chains.';
COMMENT ON COLUMN smart_money_transactions.direction IS 'Transaction type: buy, sell, or transfer';
COMMENT ON COLUMN smart_money_transactions.ai_reasoning IS 'LLM-generated explanation of transaction significance';
COMMENT ON COLUMN smart_money_transactions.confidence_score IS 'AI confidence in transaction importance (1-10)';
```

### 2.2 Narratives Table

**Purpose:** Store identified market narratives with strength scores.

**Implements:** FR-NAR-001 (Market narrative identification)

```sql
CREATE TABLE narratives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  strength_score INTEGER CHECK (strength_score BETWEEN 1 AND 10),
  ai_reasoning TEXT,
  social_post_count INTEGER DEFAULT 0,
  first_detected_timestamp TIMESTAMP NOT NULL,
  last_updated_timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE narratives IS 'Identified market narratives from social media and on-chain data';
COMMENT ON COLUMN narratives.title IS 'Short narrative title (e.g., "GameFi Revival")';
COMMENT ON COLUMN narratives.keywords IS 'Array of related keywords for matching';
COMMENT ON COLUMN narratives.strength_score IS 'Narrative strength (1=emerging, 10=dominant)';
```

### 2.3 Social Posts Table

**Purpose:** Store social media posts linked to narratives.

**Implements:** FR-NAR-002 (Social media signal collection)

```sql
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  narrative_id UUID REFERENCES narratives(id) ON DELETE SET NULL,
  platform VARCHAR(50) NOT NULL,
  post_url TEXT UNIQUE NOT NULL,
  author_username VARCHAR(255),
  author_follower_count INTEGER,
  content TEXT NOT NULL,
  engagement_score INTEGER,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE social_posts IS 'Social posts related to identified narratives (on-chain social prioritized)';
COMMENT ON COLUMN social_posts.platform IS 'farcaster, lens (primary on-chain); telegram, discord, reddit (secondary)';
COMMENT ON COLUMN social_posts.post_url IS 'Direct link to post or on-chain cast/publication ID';
COMMENT ON COLUMN social_posts.engagement_score IS 'Likes + retweets + comments (platform-specific)';
```

### 2.4 Security Scans Table

**Purpose:** Store smart contract security scan results.

**Implements:** FR-SEC-001 (Smart contract security scanning)

```sql
CREATE TABLE security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_address VARCHAR(255) NOT NULL,
  blockchain VARCHAR(50) NOT NULL,
  scan_tool VARCHAR(100) NOT NULL,
  risk_level VARCHAR(20) CHECK (risk_level IN ('critical', 'high', 'medium', 'low', 'safe')),
  vulnerabilities JSONB,
  ai_analysis TEXT,
  scanned_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE security_scans IS 'Smart contract security scan results';
COMMENT ON COLUMN security_scans.scan_tool IS 'GoPlus, CertiK, Slither, etc.';
COMMENT ON COLUMN security_scans.risk_level IS 'Overall risk assessment';
COMMENT ON COLUMN security_scans.vulnerabilities IS 'JSON array of detected vulnerabilities';
COMMENT ON COLUMN security_scans.ai_analysis IS 'LLM interpretation of scan results';
```

### 2.5 Trade Signals Table

**Purpose:** Store generated trade signals awaiting user approval.

**Implements:** FR-SIG-001 (Trade signal generation), FR-HITL-001 (Human-in-the-loop approval)

```sql
CREATE TABLE trade_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_identifier VARCHAR(100) NOT NULL,
  token_symbol VARCHAR(20) NOT NULL,
  token_address VARCHAR(255),
  blockchain VARCHAR(50) NOT NULL,
  signal_type VARCHAR(20) CHECK (signal_type IN ('buy', 'sell')),
  entry_price DECIMAL(18, 8),
  stop_loss DECIMAL(18, 8),
  take_profit DECIMAL(18, 8),
  position_size_usd DECIMAL(18, 2),
  ai_reasoning TEXT NOT NULL,
  confidence_score INTEGER CHECK (confidence_score BETWEEN 1 AND 10),
  status VARCHAR(50) DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'expired', 'executed')),
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  created_timestamp TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE trade_signals IS 'Trade signals generated by AI workflows awaiting approval';
COMMENT ON COLUMN trade_signals.workflow_identifier IS 'smart-money-tracking, narrative-scouting, breakout-trading, etc.';
COMMENT ON COLUMN trade_signals.status IS 'Signal lifecycle state';
COMMENT ON COLUMN trade_signals.ai_reasoning IS 'LLM explanation of trade rationale';
```

### 2.6 Trades Table

**Purpose:** Store executed trades with P&L tracking.

**Implements:** FR-TRD-001 (Trade execution and tracking)

```sql
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES trade_signals(id) ON DELETE SET NULL,
  token_symbol VARCHAR(20) NOT NULL,
  token_address VARCHAR(255),
  blockchain VARCHAR(50) NOT NULL,
  trade_type VARCHAR(20) CHECK (trade_type IN ('buy', 'sell')),
  entry_price DECIMAL(18, 8) NOT NULL,
  exit_price DECIMAL(18, 8),
  position_size_usd DECIMAL(18, 2) NOT NULL,
  p_l_usd DECIMAL(18, 2),
  p_l_percentage DECIMAL(8, 4),
  opened_timestamp TIMESTAMP DEFAULT NOW(),
  closed_timestamp TIMESTAMP,
  status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'closed', 'stopped_out', 'target_hit')),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE trades IS 'Executed trades with entry, exit, and P&L data';
COMMENT ON COLUMN trades.signal_id IS 'Originating trade signal (NULL if manual trade)';
COMMENT ON COLUMN trades.p_l_usd IS 'Profit/loss in USD (NULL if trade still open)';
COMMENT ON COLUMN trades.status IS 'Trade lifecycle state';
```

### 2.7 Agent Runs Table

**Purpose:** Audit trail for all LangGraph workflow executions.

**Implements:** FR-AUDIT-001 (Workflow execution logging)

```sql
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  workflow_identifier VARCHAR(100) NOT NULL,
  execution_status VARCHAR(50) CHECK (execution_status IN ('running', 'completed', 'failed', 'paused_for_approval')),
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  approval_request_id UUID REFERENCES trade_signals(id) ON DELETE SET NULL,
  started_timestamp TIMESTAMP DEFAULT NOW(),
  completed_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE agent_runs IS 'Audit trail for LangGraph workflow executions';
COMMENT ON COLUMN agent_runs.workflow_identifier IS 'smart-money-tracking, narrative-scouting, etc.';
COMMENT ON COLUMN agent_runs.input_data IS 'JSON snapshot of workflow input state';
COMMENT ON COLUMN agent_runs.output_data IS 'JSON snapshot of workflow output state';
```

### 2.8 Wallet Watchlist Table

**Purpose:** Store user's monitored smart money wallets.

```sql
CREATE TABLE wallet_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(255) NOT NULL,
  label VARCHAR(100),
  blockchain VARCHAR(50) NOT NULL,
  min_transaction_usd DECIMAL(18, 2) DEFAULT 10000,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, wallet_address, blockchain)
);

COMMENT ON TABLE wallet_watchlist IS 'User-configured smart money wallets to monitor';
COMMENT ON COLUMN wallet_watchlist.label IS 'User-friendly label (e.g., "Whale Wallet A")';
COMMENT ON COLUMN wallet_watchlist.min_transaction_usd IS 'Minimum USD value to trigger alert';
```

---

## 3. Indexes and Query Optimization

**Performance Requirement:** All queries must return within 100ms for 95th percentile (NFR-PERF-001).

### 3.1 Smart Money Transactions Indexes

```sql
CREATE INDEX idx_smt_wallet_address ON smart_money_transactions(wallet_address);
CREATE INDEX idx_smt_timestamp ON smart_money_transactions(timestamp DESC);
CREATE INDEX idx_smt_wallet_timestamp ON smart_money_transactions(wallet_address, timestamp DESC);
CREATE INDEX idx_smt_blockchain_token ON smart_money_transactions(blockchain, token_symbol);
```

### 3.2 Narratives Indexes

```sql
CREATE INDEX idx_narratives_strength ON narratives(strength_score DESC);
CREATE INDEX idx_narratives_updated ON narratives(last_updated_timestamp DESC);
CREATE INDEX idx_narratives_keywords ON narratives USING GIN(keywords);
```

### 3.3 Social Posts Indexes

```sql
CREATE INDEX idx_posts_timestamp ON social_posts(timestamp DESC);
CREATE INDEX idx_posts_narrative ON social_posts(narrative_id, timestamp DESC);
CREATE INDEX idx_posts_platform ON social_posts(platform);
```

### 3.4 Security Scans Indexes

```sql
CREATE INDEX idx_scans_contract ON security_scans(contract_address);
CREATE INDEX idx_scans_timestamp ON security_scans(scanned_timestamp DESC);
CREATE INDEX idx_scans_risk ON security_scans(risk_level) WHERE risk_level IN ('critical', 'high');
```

### 3.5 Trade Signals Indexes

```sql
CREATE INDEX idx_signals_user_status ON trade_signals(user_id, status);
CREATE INDEX idx_signals_created ON trade_signals(created_timestamp DESC);
CREATE INDEX idx_signals_workflow ON trade_signals(workflow_identifier);
CREATE INDEX idx_signals_status ON trade_signals(status);
```

### 3.6 Trades Indexes

```sql
CREATE INDEX idx_trades_user_opened ON trades(user_id, opened_timestamp DESC);
CREATE INDEX idx_trades_pnl ON trades(p_l_usd DESC) WHERE status = 'closed';
CREATE INDEX idx_trades_status ON trades(status) WHERE status = 'open';
```

### 3.7 Agent Runs Indexes

```sql
CREATE INDEX idx_runs_workflow ON agent_runs(workflow_identifier, created_at DESC);
CREATE INDEX idx_runs_approval ON agent_runs(approval_request_id) WHERE approval_request_id IS NOT NULL;
CREATE INDEX idx_runs_status ON agent_runs(execution_status) WHERE execution_status IN ('running', 'paused_for_approval');
```

---

## 4. Kysely Type Definitions

```typescript
import { Generated, Selectable, Insertable, Updateable } from 'kysely';

export interface SmartMoneyTransactionsTable {
  id: Generated<string>;
  wallet_address: string;
  blockchain: string;
  token_symbol: string | null;
  token_address: string | null;
  amount: string | null;
  direction: 'buy' | 'sell' | 'transfer';
  usd_value: string | null;
  transaction_hash: string;
  block_number: string | null;
  timestamp: Date;
  ai_reasoning: string | null;
  confidence_score: number | null;
  user_feedback: string | null;
  created_at: Generated<Date>;
}

export interface NarrativesTable {
  id: Generated<string>;
  title: string;
  description: string;
  keywords: string[];
  strength_score: number | null;
  ai_reasoning: string | null;
  social_post_count: number;
  first_detected_timestamp: Date;
  last_updated_timestamp: Generated<Date>;
  created_at: Generated<Date>;
}

export interface SocialPostsTable {
  id: Generated<string>;
  narrative_id: string | null;
  platform: string;
  post_url: string;
  author_username: string | null;
  author_follower_count: number | null;
  content: string;
  engagement_score: number | null;
  timestamp: Date;
  created_at: Generated<Date>;
}

export interface SecurityScansTable {
  id: Generated<string>;
  contract_address: string;
  blockchain: string;
  scan_tool: string;
  risk_level: 'critical' | 'high' | 'medium' | 'low' | 'safe' | null;
  vulnerabilities: Record<string, unknown> | null;
  ai_analysis: string | null;
  scanned_timestamp: Date;
  created_at: Generated<Date>;
}

export interface TradeSignalsTable {
  id: Generated<string>;
  user_id: string;
  workflow_identifier: string;
  token_symbol: string;
  token_address: string | null;
  blockchain: string;
  signal_type: 'buy' | 'sell';
  entry_price: string | null;
  stop_loss: string | null;
  take_profit: string | null;
  position_size_usd: string | null;
  ai_reasoning: string;
  confidence_score: number | null;
  status: 'pending_approval' | 'approved' | 'rejected' | 'expired' | 'executed';
  approved_at: Date | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  created_timestamp: Generated<Date>;
}

export interface TradesTable {
  id: Generated<string>;
  user_id: string;
  signal_id: string | null;
  token_symbol: string;
  token_address: string | null;
  blockchain: string;
  trade_type: 'buy' | 'sell';
  entry_price: string;
  exit_price: string | null;
  position_size_usd: string;
  p_l_usd: string | null;
  p_l_percentage: string | null;
  opened_timestamp: Generated<Date>;
  closed_timestamp: Date | null;
  status: 'open' | 'closed' | 'stopped_out' | 'target_hit';
  created_at: Generated<Date>;
}

export interface AgentRunsTable {
  id: Generated<string>;
  user_id: string | null;
  workflow_identifier: string;
  execution_status: 'running' | 'completed' | 'failed' | 'paused_for_approval';
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  approval_request_id: string | null;
  started_timestamp: Generated<Date>;
  completed_timestamp: Date | null;
  created_at: Generated<Date>;
}

export interface WalletWatchlistTable {
  id: Generated<string>;
  user_id: string;
  wallet_address: string;
  label: string | null;
  blockchain: string;
  min_transaction_usd: string;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// Crypto domain database extension
export interface CryptoDomainDatabase {
  smart_money_transactions: SmartMoneyTransactionsTable;
  narratives: NarrativesTable;
  social_posts: SocialPostsTable;
  security_scans: SecurityScansTable;
  trade_signals: TradeSignalsTable;
  trades: TradesTable;
  agent_runs: AgentRunsTable;
  wallet_watchlist: WalletWatchlistTable;
}
```

---

## 5. DuckDB Analytics Storage (Phase 2+)

> **Phase Note:** DuckDB analytics infrastructure is planned for Phase 2. This section documents the target design for traceability.
>
> **Phase 1 Analytics:** Standard PostgreSQL queries and views will handle basic reporting needs. High-performance OLAP (DuckDB) is deferred to Phase 2 when backtesting and advanced analytics become priority.

For backtesting and historical analysis, the crypto domain uses DuckDB as an embedded OLAP database.

### 5.1 Analytics Schema

```sql
-- DuckDB schema for crypto analytics
-- File: analytics.duckdb

-- Historical candle data (OHLCV)
CREATE TABLE candles (
  symbol VARCHAR NOT NULL,
  exchange VARCHAR NOT NULL,
  timeframe VARCHAR NOT NULL,  -- '1m', '5m', '1h', '1d'
  timestamp TIMESTAMP NOT NULL,
  open DOUBLE NOT NULL,
  high DOUBLE NOT NULL,
  low DOUBLE NOT NULL,
  close DOUBLE NOT NULL,
  volume DOUBLE NOT NULL,
  PRIMARY KEY (symbol, exchange, timeframe, timestamp)
);

-- Backtest results
CREATE TABLE backtest_results (
  id VARCHAR PRIMARY KEY,
  strategy_name VARCHAR NOT NULL,
  symbol VARCHAR NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  initial_capital DOUBLE NOT NULL,
  final_capital DOUBLE NOT NULL,
  total_return DOUBLE NOT NULL,
  sharpe_ratio DOUBLE NOT NULL,
  max_drawdown DOUBLE NOT NULL,
  win_rate DOUBLE NOT NULL,
  total_trades INTEGER NOT NULL,
  profitable_trades INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual backtest trades
CREATE TABLE backtest_trades (
  id VARCHAR PRIMARY KEY,
  backtest_id VARCHAR NOT NULL REFERENCES backtest_results(id),
  entry_date TIMESTAMP NOT NULL,
  exit_date TIMESTAMP NOT NULL,
  entry_price DOUBLE NOT NULL,
  exit_price DOUBLE NOT NULL,
  quantity DOUBLE NOT NULL,
  pnl DOUBLE NOT NULL,
  pnl_percent DOUBLE NOT NULL,
  side VARCHAR NOT NULL  -- 'long' or 'short'
);
```

### 5.2 Storage Strategy

- **Hot data** (recent 30 days): Keep in DuckDB tables for fast queries
- **Cold data** (historical): Export to Parquet files on disk/object storage
- **Query cold data**: Use DuckDB's `read_parquet()` for ad-hoc historical analysis

---

## 6. Data Retention

| Table | Retention | Notes |
|-------|-----------|-------|
| smart_money_transactions | 2 years | Archive older to cold storage |
| narratives | 1 year | Keep for trend analysis |
| social_posts | 7 days | High volume, short relevance |
| security_scans | 1 year | Keep for audit trail |
| trade_signals | 7 years | Financial compliance |
| trades | 7 years | Financial compliance |
| agent_runs | 1 year | Operational logs |
| candles (DuckDB) | Indefinite | Archive to Parquet yearly |

---

## Appendix A: Phase 3+ Future Scope - Additional Blockchains

> **Note:** The following blockchains are planned for Phase 3+ and are NOT supported in Phase 1.

### A.1 L1 Chains (Phase 3+)

| Chain | Network ID | Notes |
|-------|------------|-------|
| Ethereum | mainnet | High gas costs, large whale activity |
| Solana | solana | Non-EVM, requires separate adapter |
| BNB Smart Chain | bsc | High volume, lower security standards |
| Polygon | polygon | Scaling solution, moderate gas |

### A.2 Additional L2 Chains (Phase 3+)

| Chain | Network ID | Notes |
|-------|------------|-------|
| zkSync Era | zksync | ZK rollup |
| Linea | linea | Consensys L2 |
| Scroll | scroll | ZK rollup |
| Mantle | mantle | Optimistic rollup |

### A.3 Migration Path

When adding Phase 3+ chains:
1. Add chain identifier to `blockchain` column CHECK constraint
2. Deploy chain-specific MCP server integration
3. Update wallet monitoring to include new RPC endpoints
4. Verify security scanner (GoPlus) coverage for the chain

```sql
-- Example migration for Phase 3 (Ethereum mainnet)
ALTER TABLE smart_money_transactions
DROP CONSTRAINT smart_money_transactions_blockchain_check,
ADD CONSTRAINT smart_money_transactions_blockchain_check
CHECK (blockchain IN ('arbitrum', 'base', 'optimism', 'ethereum', 'solana', 'bsc', 'polygon'));
```

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Smart Money Data Model | crypto-domain-frd.md | FR-CRYPTO-SMT-001 to 003 |
| Narrative Data Model | crypto-domain-frd.md | FR-CRYPTO-NS-001 to 002 |
| Security Scan Data Model | crypto-domain-frd.md | FR-CRYPTO-SEC-001 |
| Trade Data Model | crypto-domain-frd.md | FR-CRYPTO-TRD-001 to 004 |
| Risk Management Data | crypto-domain-frd.md | FR-CRYPTO-RISK-001 to 003 |
| Agent Run Audit | platform-core-frd.md | FR-CORE-AUD-001 |
| Database Schema Conventions | database.md | All sections |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| API Endpoints | crypto/api.md | All endpoints |
| Workflow Persistence | crypto/workflow-engine.md | State management |
