# TSD - Appendices
# Crypto Trading AI Agent Ecosystem

**Module**: Appendices
**Version**: 2.0
**Last Updated**: January 15, 2026
**Status**: Complete
**References**: BRD v2.3, FRD v4.0, ADD v2.1

[← Back to TSD Root](./04-TSD-Root.md)

---

## Overview

This module contains executable scripts, migration examples, and traceability matrices for the Crypto Trading AI Agent Ecosystem.

**Contents:**
- Appendix A: Complete Database Schema SQL Script
- Appendix B: Complete GitHub Actions Workflow
- Appendix C: Migration Scripts Examples
- Appendix D: Traceability Matrix (FRD → TSD Mapping)

---

## Appendix A: Complete Database Schema SQL Script

**File:** `schema.sql`

**Purpose:** Complete, executable PostgreSQL schema for provisioning production database.

**Usage:**
```bash
psql -U postgres -d crypto_trading_ai < schema.sql
```

```sql
-- ============================================
-- Crypto Trading AI Agent Ecosystem
-- Complete Database Schema
-- Version: 2.0
-- Last Updated: 2026-01-15
-- Aligned with TSD-Database.md v2.0
-- ============================================

-- Set timezone
SET timezone = 'UTC';

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search

-- ============================================
-- TABLE 1: Users (Passwordless Authentication)
-- ============================================

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  avatar_url TEXT,
  account_status VARCHAR(50) DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'deleted')),
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE users IS 'User accounts (passwordless - auth via WebAuthn/OAuth)';
COMMENT ON COLUMN users.account_status IS 'active, suspended, or deleted';

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(account_status);

-- ============================================
-- TABLE 1b: Authenticators (WebAuthn/Passkeys)
-- ============================================

CREATE TABLE authenticators (
  credential_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  credential_device_type VARCHAR(32) NOT NULL,
  credential_backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  transports TEXT[],
  aaguid TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

COMMENT ON TABLE authenticators IS 'WebAuthn/Passkey credentials for passwordless auth';
COMMENT ON COLUMN authenticators.counter IS 'Signature counter for replay protection';

-- Authenticators indexes
CREATE INDEX idx_authenticators_user ON authenticators(user_id);

-- ============================================
-- TABLE 1c: OAuth Accounts
-- ============================================

CREATE TABLE oauth_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_account_id VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);

COMMENT ON TABLE oauth_accounts IS 'OAuth provider links (Google, Apple)';

-- OAuth accounts indexes
CREATE INDEX idx_oauth_user ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_provider ON oauth_accounts(provider, provider_account_id);

-- ============================================
-- TABLE 2: User Sessions
-- ============================================

CREATE TABLE user_sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  device_info TEXT,
  ip_address INET,
  auth_method VARCHAR(20) NOT NULL CHECK (auth_method IN ('webauthn', 'oauth')),
  authenticator_id TEXT REFERENCES authenticators(credential_id),
  oauth_provider VARCHAR(50),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE user_sessions IS 'Active user sessions with JWT tokens';
COMMENT ON COLUMN user_sessions.auth_method IS 'Authentication method used (webauthn or oauth)';

-- User sessions indexes
CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON user_sessions(expires_at);

-- ============================================
-- TABLE 3: Smart Money Transactions
-- ============================================

CREATE TABLE smart_money_transactions (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(255) NOT NULL,
  blockchain VARCHAR(50) NOT NULL,
  token_symbol VARCHAR(20),
  token_address VARCHAR(255),
  amount DECIMAL(38, 18),
  direction VARCHAR(20) NOT NULL
    CHECK (direction IN ('buy', 'sell', 'transfer')),
  usd_value DECIMAL(18, 2),
  transaction_hash VARCHAR(255) UNIQUE NOT NULL,
  block_number BIGINT,
  timestamp TIMESTAMP NOT NULL,
  ai_reasoning TEXT,
  confidence_score INTEGER CHECK (confidence_score BETWEEN 1 AND 10),
  user_feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE smart_money_transactions IS 'Tracked transactions from smart money wallets';
COMMENT ON COLUMN smart_money_transactions.confidence_score IS 'AI confidence 1-10';

-- Smart Money Transactions indexes
CREATE INDEX idx_smt_wallet_address ON smart_money_transactions(wallet_address);
CREATE INDEX idx_smt_timestamp ON smart_money_transactions(timestamp DESC);
CREATE INDEX idx_smt_wallet_timestamp ON smart_money_transactions(wallet_address, timestamp DESC);
CREATE INDEX idx_smt_blockchain_token ON smart_money_transactions(blockchain, token_symbol);

-- ============================================
-- TABLE 4: Narratives
-- ============================================

CREATE TABLE narratives (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  strength_score INTEGER NOT NULL CHECK (strength_score BETWEEN 1 AND 100),
  social_mention_count INTEGER DEFAULT 0,
  associated_tokens TEXT[], -- Array of token symbols
  last_updated_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE narratives IS 'Trending crypto narratives tracked over time';
COMMENT ON COLUMN narratives.strength_score IS 'Narrative strength 1-100';

-- Narratives indexes
CREATE INDEX idx_narratives_strength ON narratives(strength_score DESC);
CREATE INDEX idx_narratives_updated ON narratives(last_updated_timestamp DESC);
CREATE INDEX idx_narratives_category ON narratives(category);

-- ============================================
-- TABLE 5: Social Posts
-- ============================================

CREATE TABLE social_posts (
  id SERIAL PRIMARY KEY,
  narrative_id INTEGER REFERENCES narratives(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL CHECK (platform IN ('farcaster', 'lens')),
  post_id VARCHAR(255) NOT NULL,
  author VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  engagement_score INTEGER DEFAULT 0,
  sentiment_score DECIMAL(3, 2) CHECK (sentiment_score BETWEEN -1 AND 1),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(platform, post_id)
);

COMMENT ON TABLE social_posts IS 'On-chain social posts (Farcaster via Neynar, Lens Protocol)';
COMMENT ON COLUMN social_posts.sentiment_score IS 'Sentiment -1 (negative) to +1 (positive)';

-- Social Posts indexes
CREATE INDEX idx_posts_narrative ON social_posts(narrative_id, timestamp DESC);
CREATE INDEX idx_posts_timestamp ON social_posts(timestamp DESC);
CREATE INDEX idx_posts_platform ON social_posts(platform);

-- ============================================
-- TABLE 6: Security Scans
-- ============================================

CREATE TABLE security_scans (
  id SERIAL PRIMARY KEY,
  contract_address VARCHAR(255) NOT NULL,
  blockchain VARCHAR(50) NOT NULL,
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level VARCHAR(50) NOT NULL
    CHECK (risk_level IN ('critical', 'high', 'medium', 'low', 'safe')),
  findings JSONB NOT NULL,
  detailed_report JSONB,
  scanned_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE security_scans IS 'Smart contract security scan results';
COMMENT ON COLUMN security_scans.risk_score IS 'Risk score 0-100 (higher = riskier)';

-- Security Scans indexes
CREATE INDEX idx_scans_contract ON security_scans(contract_address);
CREATE INDEX idx_scans_timestamp ON security_scans(scanned_timestamp DESC);
CREATE INDEX idx_scans_risk_level ON security_scans(risk_level);

-- ============================================
-- TABLE 7: Approval Requests
-- ============================================

CREATE TABLE approval_requests (
  id VARCHAR(255) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_identifier VARCHAR(100) NOT NULL,
  request_data JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'timed_out')),
  timeout_at TIMESTAMP NOT NULL,
  responded_at TIMESTAMP,
  response_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE approval_requests IS 'Human-in-the-loop approval queue';
COMMENT ON COLUMN approval_requests.timeout_at IS '24-hour timeout from creation';

-- Approval Requests indexes
CREATE INDEX idx_approval_user_status ON approval_requests(user_id, status);
CREATE INDEX idx_approval_workflow ON approval_requests(workflow_identifier);
CREATE INDEX idx_approval_timeout ON approval_requests(timeout_at);

-- ============================================
-- TABLE 8: Trade Signals
-- ============================================

CREATE TABLE trade_signals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_symbol VARCHAR(20) NOT NULL,
  token_address VARCHAR(255) NOT NULL,
  signal_type VARCHAR(20) NOT NULL CHECK (signal_type IN ('long', 'short')),
  entry_price_usd DECIMAL(18, 2) NOT NULL,
  stop_loss_price_usd DECIMAL(18, 2),
  take_profit_price_usd DECIMAL(18, 2),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 1 AND 10),
  reasoning TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  approval_request_id VARCHAR(255) REFERENCES approval_requests(id),
  created_timestamp TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

COMMENT ON TABLE trade_signals IS 'AI-generated trade signals requiring approval';

-- Trade Signals indexes
CREATE INDEX idx_signals_user_status ON trade_signals(user_id, status);
CREATE INDEX idx_signals_created ON trade_signals(created_timestamp DESC);
CREATE INDEX idx_signals_token ON trade_signals(token_symbol);
CREATE INDEX idx_signals_status ON trade_signals(status);

-- ============================================
-- TABLE 9: Trades
-- ============================================

CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_signal_id INTEGER REFERENCES trade_signals(id),
  token_symbol VARCHAR(20) NOT NULL,
  token_address VARCHAR(255) NOT NULL,
  trade_type VARCHAR(20) NOT NULL CHECK (trade_type IN ('long', 'short')),
  entry_price_usd DECIMAL(18, 2) NOT NULL,
  exit_price_usd DECIMAL(18, 2),
  stop_loss_price_usd DECIMAL(18, 2),
  take_profit_price_usd DECIMAL(18, 2),
  position_size_usd DECIMAL(18, 2) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('open', 'closed')),
  p_l_usd DECIMAL(18, 2),
  p_l_percentage DECIMAL(8, 2),
  opened_timestamp TIMESTAMP DEFAULT NOW(),
  closed_timestamp TIMESTAMP
);

COMMENT ON TABLE trades IS 'Executed trades with P&L tracking';

-- Trades indexes
CREATE INDEX idx_trades_user_opened ON trades(user_id, opened_timestamp DESC);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_pnl ON trades(p_l_usd DESC);

-- ============================================
-- TABLE 10: Agent Runs
-- ============================================

CREATE TABLE agent_runs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workflow_identifier VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  approval_request_id VARCHAR(255) REFERENCES approval_requests(id),
  output_data JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE agent_runs IS 'LangGraph workflow execution history';

-- Agent Runs indexes
CREATE INDEX idx_runs_user ON agent_runs(user_id);
CREATE INDEX idx_runs_workflow ON agent_runs(workflow_identifier, created_at DESC);
CREATE INDEX idx_runs_status ON agent_runs(status);

-- ============================================
-- TABLE 11: LLM Usage Logs
-- ============================================

CREATE TABLE llm_usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  provider VARCHAR(50) NOT NULL CHECK (provider IN ('openai', 'anthropic', 'google')),
  model VARCHAR(100) NOT NULL,
  workflow_identifier VARCHAR(100),
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  estimated_cost_usd DECIMAL(10, 6) NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE llm_usage_logs IS 'LLM API usage and cost tracking';

-- LLM Usage Logs indexes
CREATE INDEX idx_llm_user ON llm_usage_logs(user_id);
CREATE INDEX idx_llm_provider ON llm_usage_logs(provider, created_at DESC);
CREATE INDEX idx_llm_workflow ON llm_usage_logs(workflow_identifier, created_at DESC);
CREATE INDEX idx_llm_created ON llm_usage_logs(created_at DESC);

-- ============================================
-- Triggers for updated_at timestamps
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Sample Data (Optional - for testing)
-- ============================================

-- Insert sample user (passwordless - no password_hash)
INSERT INTO users (email, display_name, account_status)
VALUES (
  'demo@example.com',
  'Demo User',
  'active'
);

-- Note: In a real passwordless setup, the user would register via:
-- 1. WebAuthn/Passkey (creates entry in authenticators table)
-- 2. OAuth (creates entry in oauth_accounts table)

-- ============================================
-- Database Permissions (Optional)
-- ============================================

-- Create read-only role for analytics
CREATE ROLE analytics_readonly;
GRANT CONNECT ON DATABASE crypto_trading_ai TO analytics_readonly;
GRANT USAGE ON SCHEMA public TO analytics_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_readonly;

-- ============================================
-- End of Schema
-- ============================================
```

---

## Appendix B: Complete GitHub Actions Workflow

**File:** `.github/workflows/deploy.yml`

See [TSD-DevOps.md Section 7.1](./04-TSD-DevOps.md#71-github-actions-workflow) for the complete GitHub Actions workflow YAML configuration.

The workflow includes:
- Automated testing with PostgreSQL and Redis services
- TypeScript type checking and linting
- Build and artifact management
- Frontend deployment to Vercel
- Backend deployment to Railway
- Security scanning with Snyk
- Slack notifications on success/failure

---

## Appendix C: Migration Scripts Examples

### C.1 Migration Tool Setup

**Installation:**
```bash
npm install --save-dev node-pg-migrate
```

**Configuration:** `package.json`
```json
{
  "scripts": {
    "migrate:up": "node-pg-migrate up",
    "migrate:down": "node-pg-migrate down",
    "migrate:create": "node-pg-migrate create"
  }
}
```

**Configuration:** `.node-pg-migraterc`
```json
{
  "database-url-var": "DATABASE_URL",
  "migrations-dir": "migrations",
  "dir": "migrations",
  "table": "pgmigrations",
  "schema": "public",
  "migrations-table": "pgmigrations",
  "migration-file-language": "ts",
  "tsconfig": "tsconfig.json"
}
```

---

### C.2 Migration Example 1: Create Users and Authenticators Tables

**File:** `migrations/1729432800000_create-users-table.ts`

```typescript
import type { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create users table (passwordless - no password_hash)
  pgm.createTable('users', {
    id: 'id',
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    display_name: {
      type: 'varchar(100)',
      notNull: false,
    },
    avatar_url: {
      type: 'text',
      notNull: false,
    },
    account_status: {
      type: 'varchar(50)',
      default: 'active',
      check: "account_status IN ('active', 'suspended', 'deleted')",
    },
    last_login_at: {
      type: 'timestamp',
      notNull: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  // Create authenticators table for WebAuthn/Passkeys
  pgm.createTable('authenticators', {
    credential_id: {
      type: 'text',
      primaryKey: true,
    },
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    credential_public_key: {
      type: 'text',
      notNull: true,
    },
    counter: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
    credential_device_type: {
      type: 'varchar(32)',
      notNull: true,
    },
    credential_backed_up: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    transports: {
      type: 'text[]',
      notNull: false,
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    last_used_at: {
      type: 'timestamp',
      notNull: false,
    },
  });

  // Add indexes
  pgm.createIndex('users', 'email');
  pgm.createIndex('users', 'account_status');
  pgm.createIndex('authenticators', 'user_id');

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE users IS 'User accounts (passwordless - auth via WebAuthn/OAuth)';
    COMMENT ON TABLE authenticators IS 'WebAuthn/Passkey credentials for passwordless auth';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('authenticators');
  pgm.dropTable('users');
}
```

---

### C.3 Migration Example 2: Add Column to Existing Table

**File:** `migrations/1729519200000_add-last-login-to-users.ts`

```typescript
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('users', {
    last_login_at: {
      type: 'timestamp',
      notNull: false,
    },
  });

  pgm.createIndex('users', 'last_login_at');

  pgm.sql(`
    COMMENT ON COLUMN users.last_login_at IS 'Timestamp of last successful login';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('users', 'last_login_at');
}
```

---

### C.4 Migration Example 3: Data Migration

**File:** `migrations/1729605600000_migrate-old-trades-format.ts`

```typescript
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add new column
  pgm.addColumn('trades', {
    position_size_tokens: {
      type: 'decimal(30, 10)',
      notNull: false,
    },
  });

  // Migrate data: calculate position_size_tokens from position_size_usd and entry_price_usd
  pgm.sql(`
    UPDATE trades
    SET position_size_tokens = position_size_usd / NULLIF(entry_price_usd, 0)
    WHERE status = 'open' AND entry_price_usd > 0;
  `);

  // Make column required after data migration
  pgm.alterColumn('trades', 'position_size_tokens', {
    notNull: true,
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('trades', 'position_size_tokens');
}
```

---

### C.5 Migration Example 4: Create Indexes for Performance

**File:** `migrations/1729692000000_add-performance-indexes.ts`

```typescript
import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Composite index for frequently queried columns together
  pgm.createIndex('smart_money_transactions', ['wallet_address', 'timestamp'], {
    name: 'idx_smt_wallet_timestamp',
    method: 'btree',
  });

  // Partial index for active trades only
  pgm.createIndex('trades', 'user_id', {
    name: 'idx_trades_user_active',
    where: "status = 'open'",
  });

  // Index for full-text search on narratives
  pgm.createIndex('narratives', 'title', {
    name: 'idx_narratives_title_trgm',
    method: 'gin',
    operator: 'gin_trgm_ops',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('smart_money_transactions', ['wallet_address', 'timestamp'], {
    name: 'idx_smt_wallet_timestamp',
  });
  pgm.dropIndex('trades', 'user_id', {
    name: 'idx_trades_user_active',
  });
  pgm.dropIndex('narratives', 'title', {
    name: 'idx_narratives_title_trgm',
  });
}
```

---

### C.6 Running Migrations

**Apply all pending migrations:**
```bash
npm run migrate:up
```

**Rollback last migration:**
```bash
npm run migrate:down
```

**Create new migration:**
```bash
npm run migrate:create add-trading-pairs-table
```

**Check migration status:**
```bash
npx node-pg-migrate list
```

**Apply specific number of migrations:**
```bash
npx node-pg-migrate up 3  # Apply next 3 migrations
npx node-pg-migrate down 2  # Rollback last 2 migrations
```

---

## Appendix D: Traceability Matrix

### D.1 FRD Requirements → TSD Mapping

This matrix maps all Functional Requirements Document (FRD v4.0) requirements to their implementation in the Technical Specification Document (TSD v2.0+).

| FRD Requirement ID | Requirement Summary | TSD Module | TSD Section |
|--------------------|---------------------|------------|-------------|
| **Smart Money Tracking** |
| FR-SMT-001 | Track whale wallet transactions | TSD-Database.md | Table: smart_money_transactions |
| FR-SMT-002 | Multi-blockchain support | TSD-Database.md | Column: blockchain |
| FR-SMT-003 | Real-time monitoring | TSD-API.md | WebSocket: smart_money_alert |
| FR-SMT-004 | AI reasoning for trades | TSD-Services.md | LLM Service |
| FR-SMT-005 | Historical transaction query | TSD-API.md | GET /smart-money/transactions |
| **Narrative Scouting** |
| FR-NAR-001 | Detect trending narratives | TSD-Database.md | Table: narratives |
| FR-NAR-002 | Social media integration | TSD-Database.md | Table: social_posts |
| FR-NAR-003 | Strength score calculation | TSD-Services.md | MCP Service (LunarCrush, CryptoPanic) |
| FR-NAR-004 | Associated tokens tracking | TSD-Database.md | Column: associated_tokens |
| FR-NAR-005 | Narrative timeline | TSD-API.md | GET /narratives/:id/social-posts |
| **Security Detection** |
| FR-SEC-001 | Smart contract scanning | TSD-Database.md | Table: security_scans |
| FR-SEC-002 | Risk scoring | TSD-Database.md | Column: risk_score, risk_level |
| FR-SEC-003 | Honeypot detection | TSD-Database.md | Column: findings (JSONB) |
| FR-SEC-004 | On-demand scanning | TSD-API.md | POST /security/scans |
| FR-SEC-005 | Security alerts | TSD-API.md | WebSocket: security_alert |
| **Backtesting** |
| FR-BACK-001 | Historical strategy testing | TSD-Services.md | MCP Service (TradingView, CCXT) |
| FR-BACK-002 | P&L calculation | TSD-Database.md | Table: trades (p_l_usd) |
| FR-BACK-003 | Win rate metrics | TSD-API.md | GET /trades/stats |
| FR-BACK-004 | Sharpe ratio calculation | TSD-API.md | TradeStatsResponseSchema |
| **Breakout Trading** |
| FR-BRKT-001 | Technical indicator analysis | TSD-Services.md | MCP Service (TradingView) |
| FR-BRKT-002 | Entry/exit signals | TSD-Database.md | Table: trade_signals |
| FR-BRKT-003 | Stop-loss automation | TSD-Database.md | Column: stop_loss_price_usd |
| FR-BRKT-004 | Position sizing | TSD-Database.md | Column: position_size_usd |
| **Portfolio Management** |
| FR-PORT-001 | Multi-token holdings | TSD-Database.md | Table: trades (open positions) |
| FR-PORT-002 | Portfolio value tracking | TSD-API.md | GET /trades/stats |
| FR-PORT-003 | Risk exposure calculation | TSD-API.md | TradeStatsResponseSchema |
| FR-PORT-004 | Rebalancing suggestions | TSD-Services.md | LLM Service |
| **Authentication & Authorization (Passwordless)** |
| FR-AUTH-001 | User registration (WebAuthn/OAuth) | TSD-API.md | POST /auth/register/challenge, POST /auth/register/verify |
| FR-AUTH-002 | Login with JWT (WebAuthn/OAuth) | TSD-API.md | POST /auth/login/challenge, POST /auth/login/verify |
| FR-AUTH-003 | OAuth provider support | TSD-API.md | GET /auth/oauth/:provider, GET /auth/oauth/callback |
| FR-AUTH-004 | Session management | TSD-Database.md | Table: user_sessions (auth_method tracking) |
| FR-AUTH-005 | Token refresh | TSD-API.md | POST /auth/refresh |
| **Human-in-the-Loop** |
| FR-HITL-001 | Approval queue | TSD-Database.md | Table: approval_requests |
| FR-HITL-002 | Email/push notifications | TSD-Services.md | HITL Service |
| FR-HITL-003 | 24-hour timeout | TSD-Database.md | Column: timeout_at |
| FR-HITL-004 | Approval/rejection tracking | TSD-API.md | POST /trade-signals/:id/approve |
| **LLM Integration** |
| FR-LLM-001 | Multi-provider support | TSD-Services.md | LLM Service (OpenAI, Anthropic, Google) |
| FR-LLM-002 | Cost tracking | TSD-Database.md | Table: llm_usage_logs |
| FR-LLM-003 | Budget limits | TSD-Services.md | LLMService (budgetUSD) |
| FR-LLM-004 | Provider failover | TSD-Services.md | LLMService.generateCompletion |
| FR-LLM-005 | Token usage logging | TSD-API.md | GET /llm-usage |
| **MCP Integration** |
| FR-MCP-001 | The Graph support | TSD-Services.md | MCP_SERVERS config |
| FR-MCP-002 | CoinGecko support | TSD-Services.md | MCP_SERVERS config |
| FR-MCP-003 | DefiLlama support | TSD-Services.md | MCP_SERVERS config |
| FR-MCP-004 | LunarCrush support | TSD-Services.md | MCP_SERVERS config |
| FR-MCP-005 | CryptoPanic support | TSD-Services.md | MCP_SERVERS config |
| FR-MCP-006 | TradingView support | TSD-Services.md | MCP_SERVERS config |
| **API Requirements** |
| FR-API-001 | RESTful endpoints | TSD-API.md | All sections |
| FR-API-002 | Zod validation | TSD-API.md | Section 6.1.4 |
| FR-API-003 | Standard error format | TSD-API.md | Section 6.11 |
| FR-API-004 | Rate limiting | TSD-API.md | Section 6.11.3 |
| FR-API-005 | CORS configuration | TSD-DevOps.md | Vercel headers |
| **WebSocket Requirements** |
| FR-WS-001 | Real-time alerts | TSD-API.md | Section 6.10 |
| FR-WS-002 | Authentication | TSD-API.md | WebSocket connection |
| FR-WS-003 | Event subscription | TSD-API.md | Section 6.10.2 |
| FR-WS-004 | Connection management | TSD-API.md | Section 6.10 |

---

### D.2 Non-Functional Requirements → TSD Mapping

| NFR Requirement ID | Requirement Summary | TSD Module | TSD Section |
|--------------------|---------------------|------------|-------------|
| **Performance** |
| NFR-PERF-001 | API response < 200ms | TSD-Database.md | Performance indexes |
| NFR-PERF-002 | WebSocket latency < 100ms | TSD-DevOps.md | Railway deployment |
| NFR-PERF-003 | Database query optimization | TSD-Database.md | All index definitions |
| NFR-PERF-004 | Concurrent user support (1000+) | TSD-DevOps.md | Railway auto-scaling |
| **Security** |
| NFR-SEC-001 | HTTPS/TLS encryption | TSD-DevOps.md | Vercel configuration |
| NFR-SEC-002 | JWT token expiry | TSD-Configuration.md | JWT_EXPIRY=15m |
| NFR-SEC-003 | Biometric auth (WebAuthn/Passkeys) | TSD-Authentication.md | WebAuthnService |
| NFR-SEC-004 | Zero-trust session validation | TSD-Database.md | Table: user_sessions (auth_method) |
| NFR-SEC-005 | SQL injection prevention | TSD-API.md | Parameterized queries |
| **Reliability** |
| NFR-REL-001 | 99.9% uptime | TSD-DevOps.md | Health checks |
| NFR-REL-002 | Automated backups | TSD-DevOps.md | Railway Postgres backups |
| NFR-REL-003 | Error logging | TSD-Services.md | Pino logger configuration |
| NFR-REL-004 | Circuit breaker for APIs | TSD-Services.md | LLM Service retry logic |
| **Maintainability** |
| NFR-MAINT-001 | Strict TypeScript | TSD-Dev-Environment.md | tsconfig.json (NodeNext) |
| NFR-MAINT-002 | Code quality (ESLint) | TSD-Dev-Environment.md | eslint.config.js (Flat Config) |
| NFR-MAINT-003 | Pre-commit hooks | TSD-Dev-Environment.md | Husky 9 + lint-staged |
| NFR-MAINT-004 | Automated tests | TSD-DevOps.md | GitHub Actions (Vitest) |
| **Observability** |
| NFR-OBS-001 | Structured logging | TSD-Services.md | Pino logger (NDJSON) |
| NFR-OBS-002 | Metrics collection | TSD-DevOps.md | Prometheus metrics |
| NFR-OBS-003 | Alerting | TSD-DevOps.md | PagerDuty, Slack |
| NFR-OBS-004 | Health check endpoints | TSD-DevOps.md | Section 7.7 |
| **Scalability** |
| NFR-SCALE-001 | Horizontal scaling | TSD-DevOps.md | Railway auto-scaling |
| NFR-SCALE-002 | Database connection pooling | TSD-Configuration.md | DATABASE_POOL_MAX=10 |
| NFR-SCALE-003 | Caching layer | TSD-Configuration.md | REDIS_URL |
| NFR-SCALE-004 | CDN for static assets | TSD-DevOps.md | Vercel edge network |

---

### D.3 ADD Architecture → TSD Implementation Mapping

| ADD Architectural Decision | TSD Implementation |
|----------------------------|-------------------|
| **ADR-001: LangGraph.js Framework** | TSD-Database.md: Table agent_runs<br>TSD-API.md: GET /agent-runs |
| **ADR-002: Result<T, E> Pattern** | TSD-Services.md: All service methods return Result<T, E> |
| **ADR-003: Multi-LLM Strategy** | TSD-Services.md: LLM Service with OpenAI, Anthropic, Google providers |
| **ADR-004: Hybrid File Structure** | TSD-Dev-Environment.md: Path aliases (@workflows/*, @shared/*) |
| **Deployment: Vercel (Frontend)** | TSD-DevOps.md: Section 7.2 vercel.json |
| **Deployment: Railway (Backend)** | TSD-DevOps.md: Section 7.3 Dockerfile, railway.json |
| **Database: PostgreSQL** | TSD-Database.md: Complete schema |
| **Cache: Redis** | TSD-Configuration.md: REDIS_URL |
| **Validation: Zod** | TSD-API.md: All request/response schemas |
| **ORM: Raw SQL + pg** | TSD-Services.md: All database queries use Pool.query() |

---

### D.4 Database Tables → API Endpoints Mapping

| Database Table | Primary API Endpoints |
|----------------|----------------------|
| `users` | POST /auth/register<br>POST /auth/login |
| `user_sessions` | POST /auth/refresh<br>POST /auth/logout |
| `smart_money_transactions` | GET /smart-money/transactions<br>GET /smart-money/transactions/:id<br>POST /smart-money/transactions/:id/feedback |
| `narratives` | GET /narratives<br>GET /narratives/:id |
| `social_posts` | GET /narratives/:id/social-posts |
| `security_scans` | GET /security/scans<br>GET /security/scans/:id<br>POST /security/scans |
| `approval_requests` | Part of HITL Service (internal) |
| `trade_signals` | GET /trade-signals<br>GET /trade-signals/:id<br>POST /trade-signals/:id/approve<br>POST /trade-signals/:id/reject |
| `trades` | GET /trades<br>GET /trades/:id<br>POST /trades/:id/close<br>GET /trades/stats |
| `agent_runs` | GET /agent-runs<br>GET /agent-runs/:id |
| `llm_usage_logs` | GET /llm-usage<br>GET /llm-usage/budget |

---

### D.5 Environment Variables → Configuration Sources

| Environment Variable | TSD Module | Configuration Source |
|---------------------|------------|---------------------|
| `DATABASE_URL` | TSD-Configuration.md | Railway Postgres |
| `REDIS_URL` | TSD-Configuration.md | Railway Redis |
| `OPENAI_API_KEY` | TSD-Configuration.md | OpenAI Dashboard |
| `ANTHROPIC_API_KEY` | TSD-Configuration.md | Anthropic Console |
| `GOOGLE_API_KEY` | TSD-Configuration.md | Google Cloud Console |
| `JWT_SECRET` | TSD-Configuration.md | Generate with `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | TSD-Configuration.md | Generate with `openssl rand -hex 32` |
| `THEGRAPH_API_KEY` | TSD-Configuration.md | The Graph Dashboard |
| `COINGECKO_API_KEY` | TSD-Configuration.md | CoinGecko API Portal |
| `LUNARCRUSH_API_KEY` | TSD-Configuration.md | LunarCrush Dashboard |
| `BINANCE_API_KEY` | TSD-Configuration.md | Binance API Management |
| `VERCEL_TOKEN` | TSD-DevOps.md | Vercel Account Settings |
| `RAILWAY_TOKEN` | TSD-DevOps.md | Railway Account Tokens |
| `SLACK_WEBHOOK_URL` | TSD-DevOps.md | Slack App Configuration |
| `PAGERDUTY_INTEGRATION_KEY` | TSD-DevOps.md | PagerDuty Service Integration |

---

## Summary

This appendix provides:
- **Appendix A**: Complete executable database schema (13 tables including authenticators and oauth_accounts, 25+ indexes)
- **Appendix B**: Reference to complete GitHub Actions workflow
- **Appendix C**: 6 migration script examples with node-pg-migrate
- **Appendix D**: Comprehensive traceability matrix mapping FRD v4.0 requirements to TSD v2.0+ implementations

All scripts are production-ready, aligned with passwordless authentication (WebAuthn + OAuth), and copy-paste executable.

---

**Related Modules:**
- [TSD-Database.md](./04-TSD-Database.md) - Database schema source
- [TSD-DevOps.md](./04-TSD-DevOps.md) - CI/CD workflow source
- [TSD-API.md](./04-TSD-API.md) - API endpoints
- [TSD-Configuration.md](./04-TSD-Configuration.md) - Environment variables

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-20 | Initial | Initial appendices with schema, migrations, traceability matrix |
| 2.0 | 2026-01-15 | Multi-model Review | Major alignment with passwordless auth: removed password_hash/mfa_secret/mfa_enabled from users table, added authenticators and oauth_accounts tables, updated user_sessions with auth_method tracking, changed social_posts platform constraint (farcaster/lens instead of twitter), updated migration examples for passwordless schema, updated traceability matrix to FRD v4.0 and TSD v2.0+, fixed NFR references (Pino logger, eslint.config.js, WebAuthn auth) |
