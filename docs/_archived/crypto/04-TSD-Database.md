# TSD - Database Specifications
# Crypto Trading AI Agent Ecosystem

**Module**: Database
**Version**: 2.1
**Last Updated**: January 15, 2026
**Status**: Complete
**References**: BRD v2.3, FRD v4.0, ADD v2.1

[← Back to TSD Root](./04-TSD-Root.md)

---

## Overview

This module defines the complete PostgreSQL database schema for the Crypto Trading AI Agent Ecosystem. All schemas follow the data entities defined in FRD v4.0 Section 7.1 and implement the data persistence layer described in ADD v2.1.

> **Architecture Note:** This system uses passwordless authentication (WebAuthn/Passkeys + OAuth). The schema reflects this with no password storage - authentication credentials are stored in the `authenticators` and `oauth_accounts` tables.

**Contents:**
- 2.1: PostgreSQL Schema Definitions (12 tables)
- 2.2: Database Indexes and Query Optimization (25+ indexes)
- 2.3: Database Migrations Strategy
- 2.4: Constraints and Foreign Key Relationships
- 2.5: Kysely Query Patterns
- 2.6: Analytics Storage (DuckDB)

---
## 2. Database Specifications

This section defines the complete PostgreSQL database schema for the Crypto Trading AI Agent Ecosystem. All schemas follow the data entities defined in FRD v4.0 Section 7.1.

### 2.1 PostgreSQL Schema Definitions

#### 2.1.1 Users Table

**Purpose:** Store core user identity and profile information.

**Implements:** FR-AUTH-001 (User identity management - passwordless)

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  avatar_url TEXT,
  account_status VARCHAR(50) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE users IS 'User identity and profile - authentication handled via authenticators/oauth_accounts tables';
COMMENT ON COLUMN users.email IS 'Primary email for notifications and account recovery';
COMMENT ON COLUMN users.display_name IS 'User-chosen display name';
COMMENT ON COLUMN users.account_status IS 'Account lifecycle state';
```

#### 2.1.1A Authenticators Table (WebAuthn)

**Purpose:** Store WebAuthn/Passkey credentials for passwordless authentication.

**Implements:** FR-AUTH-001 (WebAuthn authentication)

```sql
CREATE TABLE authenticators (
  id VARCHAR(255) PRIMARY KEY, -- base64url encoded credentialID
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key BYTEA NOT NULL, -- COSE-encoded public key
  counter BIGINT NOT NULL DEFAULT 0, -- Signature counter for replay protection
  transports VARCHAR(50)[] DEFAULT '{}', -- e.g., 'internal', 'usb', 'nfc', 'ble', 'hybrid'
  device_type VARCHAR(50) DEFAULT 'singleDevice', -- 'singleDevice' or 'multiDevice'
  backed_up BOOLEAN DEFAULT FALSE, -- Whether credential is backed up (e.g., iCloud Keychain)
  device_name VARCHAR(100), -- User-friendly name like "MacBook Pro TouchID"
  aaguid VARCHAR(36), -- Authenticator Attestation GUID
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

COMMENT ON TABLE authenticators IS 'WebAuthn/Passkey credentials for passwordless login';
COMMENT ON COLUMN authenticators.id IS 'Credential ID from WebAuthn registration (base64url)';
COMMENT ON COLUMN authenticators.public_key IS 'COSE-encoded public key for signature verification';
COMMENT ON COLUMN authenticators.counter IS 'Signature counter - must increment on each use';
COMMENT ON COLUMN authenticators.transports IS 'Supported transport methods for this credential';
COMMENT ON COLUMN authenticators.backed_up IS 'True if credential is synced across devices';
```

#### 2.1.1B OAuth Accounts Table

**Purpose:** Store linked OAuth provider accounts for passwordless authentication.

**Implements:** FR-AUTH-001 (OAuth authentication)

```sql
CREATE TABLE oauth_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'google', 'apple'
  provider_account_id VARCHAR(255) NOT NULL, -- Provider's unique user ID
  email VARCHAR(255), -- Email from provider (may differ from users.email)
  access_token TEXT, -- Encrypted access token (if needed for API calls)
  refresh_token TEXT, -- Encrypted refresh token
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);

COMMENT ON TABLE oauth_accounts IS 'Linked OAuth provider accounts for authentication';
COMMENT ON COLUMN oauth_accounts.provider IS 'OAuth provider: google, apple';
COMMENT ON COLUMN oauth_accounts.provider_account_id IS 'Unique ID from the OAuth provider';
COMMENT ON COLUMN oauth_accounts.access_token IS 'Encrypted - only stored if needed for API access';
```

#### 2.1.2 User Sessions Table

**Purpose:** Track active user sessions with JWT refresh tokens.

**Implements:** FR-AUTH-002 (Session management)

```sql
CREATE TABLE user_sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  refresh_token VARCHAR(500) UNIQUE NOT NULL,
  auth_method VARCHAR(50) NOT NULL CHECK (auth_method IN ('webauthn', 'oauth')),
  authenticator_id VARCHAR(255) REFERENCES authenticators(id) ON DELETE SET NULL,
  oauth_provider VARCHAR(50), -- Set if auth_method = 'oauth'
  device_info TEXT,
  ip_address INET,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE user_sessions IS 'Active user sessions with refresh tokens';
COMMENT ON COLUMN user_sessions.id IS 'Session identifier (hex string generated by AuthService)';
COMMENT ON COLUMN user_sessions.token IS 'JWT access token for quick validation';
COMMENT ON COLUMN user_sessions.refresh_token IS 'JWT refresh token (hashed)';
COMMENT ON COLUMN user_sessions.auth_method IS 'How user authenticated: webauthn or oauth';
COMMENT ON COLUMN user_sessions.authenticator_id IS 'Which passkey was used (if webauthn)';
COMMENT ON COLUMN user_sessions.device_info IS 'User-Agent string from client';
COMMENT ON COLUMN user_sessions.expires_at IS 'Session expiration (7 days default)';
```

#### 2.1.3 Smart Money Transactions Table

**Purpose:** Store blockchain transactions from tracked smart money wallets.

**Implements:** FR-SMT-001 (Smart money wallet monitoring)

```sql
CREATE TABLE smart_money_transactions (
  id SERIAL PRIMARY KEY,
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
COMMENT ON COLUMN smart_money_transactions.blockchain IS 'L2-first: arbitrum, base, optimism, polygon (primary); ethereum, solana, bsc (secondary)';
COMMENT ON COLUMN smart_money_transactions.direction IS 'Transaction type: buy, sell, or transfer';
COMMENT ON COLUMN smart_money_transactions.ai_reasoning IS 'LLM-generated explanation of transaction significance';
COMMENT ON COLUMN smart_money_transactions.confidence_score IS 'AI confidence in transaction importance (1-10)';
COMMENT ON COLUMN smart_money_transactions.user_feedback IS 'User feedback on alert quality';
```

#### 2.1.4 Narratives Table

**Purpose:** Store identified market narratives with strength scores.

**Implements:** FR-NAR-001 (Market narrative identification)

```sql
CREATE TABLE narratives (
  id SERIAL PRIMARY KEY,
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
COMMENT ON COLUMN narratives.description IS 'Detailed narrative description';
COMMENT ON COLUMN narratives.keywords IS 'Array of related keywords for matching';
COMMENT ON COLUMN narratives.strength_score IS 'Narrative strength (1=emerging, 10=dominant)';
COMMENT ON COLUMN narratives.ai_reasoning IS 'LLM explanation of why this is a significant narrative';
COMMENT ON COLUMN narratives.social_post_count IS 'Number of social posts linked to this narrative';
```

#### 2.1.5 Social Posts Table

**Purpose:** Store social media posts linked to narratives.

**Implements:** FR-NAR-002 (Social media signal collection)

```sql
CREATE TABLE social_posts (
  id SERIAL PRIMARY KEY,
  narrative_id INTEGER REFERENCES narratives(id) ON DELETE SET NULL,
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
COMMENT ON COLUMN social_posts.narrative_id IS 'Linked narrative (NULL if not yet categorized)';
```

#### 2.1.6 Security Scans Table

**Purpose:** Store smart contract security scan results.

**Implements:** FR-SEC-001 (Smart contract security scanning)

```sql
CREATE TABLE security_scans (
  id SERIAL PRIMARY KEY,
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

#### 2.1.7 Trade Signals Table

**Purpose:** Store generated trade signals awaiting user approval.

**Implements:** FR-SIG-001 (Trade signal generation), FR-HITL-001 (Human-in-the-loop approval)

```sql
CREATE TABLE trade_signals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

#### 2.1.8 Trades Table

**Purpose:** Store executed trades with P&L tracking.

**Implements:** FR-TRD-001 (Trade execution and tracking)

```sql
CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signal_id INTEGER REFERENCES trade_signals(id) ON DELETE SET NULL,
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

#### 2.1.9 Agent Runs Table

**Purpose:** Audit trail for all LangGraph workflow executions.

**Implements:** FR-AUDIT-001 (Workflow execution logging)

```sql
CREATE TABLE agent_runs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  workflow_identifier VARCHAR(100) NOT NULL,
  execution_status VARCHAR(50) CHECK (execution_status IN ('running', 'completed', 'failed', 'paused_for_approval')),
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  approval_request_id INTEGER REFERENCES trade_signals(id) ON DELETE SET NULL,
  started_timestamp TIMESTAMP DEFAULT NOW(),
  completed_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE agent_runs IS 'Audit trail for LangGraph workflow executions';
COMMENT ON COLUMN agent_runs.workflow_identifier IS 'smart-money-tracking, narrative-scouting, etc.';
COMMENT ON COLUMN agent_runs.input_data IS 'JSON snapshot of workflow input state';
COMMENT ON COLUMN agent_runs.output_data IS 'JSON snapshot of workflow output state';
COMMENT ON COLUMN agent_runs.approval_request_id IS 'Trade signal awaiting HITL approval';
```

#### 2.1.10 LLM Usage Logs Table

**Purpose:** Track LLM API usage for cost monitoring.

**Implements:** FR-LLM-004 (LLM cost tracking)

```sql
CREATE TABLE llm_usage_logs (
  id SERIAL PRIMARY KEY,
  workflow_identifier VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cost_usd DECIMAL(10, 6) NOT NULL,
  created_timestamp TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE llm_usage_logs IS 'LLM API usage tracking for cost monitoring';
COMMENT ON COLUMN llm_usage_logs.provider IS 'openai, anthropic, google';
COMMENT ON COLUMN llm_usage_logs.model IS 'gpt-4, claude-3-opus, gemini-pro, etc.';
COMMENT ON COLUMN llm_usage_logs.cost_usd IS 'API call cost in USD';
```

### 2.2 Database Indexes and Query Optimization

**Performance Requirement:** All queries must return within 100ms for 95th percentile (NFR-PERF-001).

#### 2.2.1 Users Table Indexes

```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_account_status ON users(account_status) WHERE account_status = 'active';
```

**Rationale:**
- `idx_users_email`: Used for user lookup during authentication
- `idx_users_account_status`: Partial index for filtering active users only

#### 2.2.1A Authenticators Table Indexes

```sql
CREATE INDEX idx_authenticators_user_id ON authenticators(user_id);
CREATE INDEX idx_authenticators_last_used ON authenticators(last_used_at DESC);
```

**Rationale:**
- `idx_authenticators_user_id`: Used to fetch user's registered passkeys during login
- `idx_authenticators_last_used`: Used for identifying stale/unused credentials

#### 2.2.1B OAuth Accounts Table Indexes

```sql
CREATE INDEX idx_oauth_user_id ON oauth_accounts(user_id);
-- Note: UNIQUE(provider, provider_account_id) in table definition already creates unique index
```

**Rationale:**
- `idx_oauth_user_id`: Used to fetch user's linked OAuth providers
- Unique index on (provider, provider_account_id) automatically created by UNIQUE constraint in table definition

#### 2.2.2 User Sessions Table Indexes

```sql
CREATE INDEX idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_sessions_refresh_token ON user_sessions(refresh_token);
CREATE INDEX idx_sessions_expires_at ON user_sessions(expires_at) WHERE expires_at > NOW();
```

**Rationale:**
- `idx_sessions_user_id`: Used for fetching user's active sessions
- `idx_sessions_refresh_token`: Used for token refresh queries
- `idx_sessions_expires_at`: Partial index for cleaning up expired sessions

#### 2.2.3 Smart Money Transactions Table Indexes

```sql
CREATE INDEX idx_smt_wallet_address ON smart_money_transactions(wallet_address);
CREATE INDEX idx_smt_timestamp ON smart_money_transactions(timestamp DESC);
CREATE INDEX idx_smt_wallet_timestamp ON smart_money_transactions(wallet_address, timestamp DESC);
CREATE INDEX idx_smt_blockchain_token ON smart_money_transactions(blockchain, token_symbol);
```

**Rationale:**
- `idx_smt_wallet_address`: Used for wallet-specific transaction queries
- `idx_smt_timestamp`: Used for recent transaction feeds (DESC for newest first)
- `idx_smt_wallet_timestamp`: Composite index for wallet history queries
- `idx_smt_blockchain_token`: Used for filtering by blockchain and token

#### 2.2.4 Narratives Table Indexes

```sql
CREATE INDEX idx_narratives_strength ON narratives(strength_score DESC);
CREATE INDEX idx_narratives_updated ON narratives(last_updated_timestamp DESC);
CREATE INDEX idx_narratives_keywords ON narratives USING GIN(keywords);
```

**Rationale:**
- `idx_narratives_strength`: Used for fetching strongest narratives
- `idx_narratives_updated`: Used for recently updated narratives feed
- `idx_narratives_keywords`: GIN index for array search on keywords

#### 2.2.5 Social Posts Table Indexes

```sql
CREATE INDEX idx_posts_timestamp ON social_posts(timestamp DESC);
CREATE INDEX idx_posts_narrative ON social_posts(narrative_id, timestamp DESC);
CREATE INDEX idx_posts_platform ON social_posts(platform);
```

**Rationale:**
- `idx_posts_timestamp`: Used for recent posts feed
- `idx_posts_narrative`: Composite index for narrative-specific posts
- `idx_posts_platform`: Used for platform-specific filtering

#### 2.2.6 Security Scans Table Indexes

```sql
CREATE INDEX idx_scans_contract ON security_scans(contract_address);
CREATE INDEX idx_scans_timestamp ON security_scans(scanned_timestamp DESC);
CREATE INDEX idx_scans_risk ON security_scans(risk_level) WHERE risk_level IN ('critical', 'high');
```

**Rationale:**
- `idx_scans_contract`: Used for contract-specific scan history
- `idx_scans_timestamp`: Used for recent scans feed
- `idx_scans_risk`: Partial index for high-risk contracts only

#### 2.2.7 Trade Signals Table Indexes

```sql
CREATE INDEX idx_signals_user_status ON trade_signals(user_id, status);
CREATE INDEX idx_signals_created ON trade_signals(created_timestamp DESC);
CREATE INDEX idx_signals_workflow ON trade_signals(workflow_identifier);
CREATE INDEX idx_signals_status ON trade_signals(status);
```

**Rationale:**
- `idx_signals_user_status`: Composite index for user's pending signals
- `idx_signals_created`: Used for recent signals feed
- `idx_signals_workflow`: Used for workflow-specific signal analytics
- `idx_signals_status`: Standalone index for global status queries (admin views, timeout processing)

#### 2.2.8 Trades Table Indexes

```sql
CREATE INDEX idx_trades_user_opened ON trades(user_id, opened_timestamp DESC);
CREATE INDEX idx_trades_pnl ON trades(p_l_usd DESC) WHERE status = 'closed';
CREATE INDEX idx_trades_status ON trades(status) WHERE status = 'open';
```

**Rationale:**
- `idx_trades_user_opened`: Composite index for user's trade history
- `idx_trades_pnl`: Partial index for closed trades P&L leaderboard
- `idx_trades_status`: Partial index for open positions

#### 2.2.9 Agent Runs Table Indexes

```sql
CREATE INDEX idx_runs_workflow ON agent_runs(workflow_identifier, created_at DESC);
CREATE INDEX idx_runs_approval ON agent_runs(approval_request_id) WHERE approval_request_id IS NOT NULL;
CREATE INDEX idx_runs_status ON agent_runs(execution_status) WHERE execution_status IN ('running', 'paused_for_approval');
```

**Rationale:**
- `idx_runs_workflow`: Composite index for workflow-specific run history
- `idx_runs_approval`: Partial index for runs with pending approvals
- `idx_runs_status`: Partial index for active/paused runs

#### 2.2.10 LLM Usage Logs Table Indexes

```sql
CREATE INDEX idx_llm_workflow ON llm_usage_logs(workflow_identifier, created_timestamp DESC);
CREATE INDEX idx_llm_provider ON llm_usage_logs(provider, created_timestamp DESC);
CREATE INDEX idx_llm_cost_daily ON llm_usage_logs(created_timestamp DESC) WHERE created_timestamp >= CURRENT_DATE;
```

**Rationale:**
- `idx_llm_workflow`: Composite index for workflow cost analytics
- `idx_llm_provider`: Composite index for provider cost comparison
- `idx_llm_cost_daily`: Partial index for daily cost budget monitoring

### 2.3 Database Migrations Strategy

#### 2.3.1 Migration Tool

**Chosen Tool:** `node-pg-migrate` (TypeScript-compatible PostgreSQL migration tool)

**Installation:**
```bash
npm install --save-dev node-pg-migrate
npm install --save pg
```

**Configuration (`migrations/config.js`):**
```javascript
module.exports = {
  databaseUrl: process.env.DATABASE_URL,
  migrationsTable: 'pgmigrations',
  dir: 'migrations',
  direction: 'up',
  schema: 'public',
  createSchema: false,
  createMigrationsTable: true,
  checkOrder: true
};
```

#### 2.3.2 Migration File Naming Convention

**Format:** `YYYYMMDDHHMMSS_description.js`

**Examples:**
- `20251020120000_create_users_table.js`
- `20251020120100_create_sessions_table.js`
- `20251020120200_create_smart_money_transactions_table.js`
- `20251020130000_add_indexes.js`

#### 2.3.3 Migration File Template

```javascript
/**
 * Migration: Create users and authentication tables (passwordless)
 * Created: 2026-01-15
 * Note: No password storage - authentication via WebAuthn + OAuth
 */

exports.up = (pgm) => {
  // Users table - identity only, no auth credentials
  pgm.createTable('users', {
    id: 'id',
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true
    },
    display_name: {
      type: 'varchar(100)',
      notNull: false
    },
    avatar_url: {
      type: 'text',
      notNull: false
    },
    account_status: {
      type: 'varchar(50)',
      default: 'active',
      check: "account_status IN ('active', 'suspended', 'deleted')"
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()')
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()')
    }
  });

  // Authenticators table - WebAuthn credentials
  pgm.createTable('authenticators', {
    id: {
      type: 'varchar(255)',
      primaryKey: true  // credentialID
    },
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE'
    },
    public_key: {
      type: 'bytea',
      notNull: true
    },
    counter: {
      type: 'bigint',
      notNull: true,
      default: 0
    },
    transports: {
      type: 'varchar(50)[]',
      default: pgm.func("'{}'")
    },
    device_type: {
      type: 'varchar(50)',
      default: 'singleDevice'
    },
    backed_up: {
      type: 'boolean',
      default: false
    },
    device_name: {
      type: 'varchar(100)'
    },
    aaguid: {
      type: 'varchar(36)'
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()')
    },
    last_used_at: {
      type: 'timestamp'
    }
  });

  // OAuth accounts table
  pgm.createTable('oauth_accounts', {
    id: 'id',
    user_id: {
      type: 'integer',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE'
    },
    provider: {
      type: 'varchar(50)',
      notNull: true
    },
    provider_account_id: {
      type: 'varchar(255)',
      notNull: true
    },
    email: {
      type: 'varchar(255)'
    },
    access_token: {
      type: 'text'  // Encrypted
    },
    refresh_token: {
      type: 'text'  // Encrypted
    },
    expires_at: {
      type: 'timestamp'
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('NOW()')
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('NOW()')
    }
  });

  pgm.addConstraint('oauth_accounts', 'unique_provider_account', {
    unique: ['provider', 'provider_account_id']
  });

  // Indexes
  pgm.createIndex('users', 'email');
  pgm.createIndex('authenticators', 'user_id');
  pgm.createIndex('oauth_accounts', 'user_id');
};

exports.down = (pgm) => {
  pgm.dropTable('oauth_accounts');
  pgm.dropTable('authenticators');
  pgm.dropTable('users');
};
```

#### 2.3.4 Migration Execution

**Run all pending migrations:**
```bash
npm run migrate:up
```

**Rollback last migration:**
```bash
npm run migrate:down
```

**Create new migration:**
```bash
npx node-pg-migrate create <description>
```

**Check migration status:**
```bash
npx node-pg-migrate status
```

#### 2.3.5 Migration Best Practices

1. **Always test migrations in development first**
   - Run `npm run migrate:up` locally
   - Verify data integrity
   - Test rollback with `npm run migrate:down`

2. **Never edit applied migrations**
   - Create a new migration to fix issues
   - Keep migration history immutable

3. **Use transactions for data migrations**
   ```javascript
   exports.up = (pgm) => {
     pgm.sql('BEGIN');
     // Migration SQL here
     pgm.sql('COMMIT');
   };
   ```

4. **Include both UP and DOWN migrations**
   - Always provide rollback path
   - Test DOWN migrations before production deployment

5. **Document breaking changes**
   - Add comments explaining complex migrations
   - Reference related FRD requirements

### 2.4 Constraints and Foreign Key Relationships

#### 2.4.1 Foreign Key Relationships

```sql
-- User Sessions → Users
ALTER TABLE user_sessions
  ADD CONSTRAINT fk_sessions_users
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

-- Social Posts → Narratives
ALTER TABLE social_posts
  ADD CONSTRAINT fk_posts_narratives
  FOREIGN KEY (narrative_id)
  REFERENCES narratives(id)
  ON DELETE SET NULL;

-- Trade Signals → Users
ALTER TABLE trade_signals
  ADD CONSTRAINT fk_signals_users
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

-- Trades → Users
ALTER TABLE trades
  ADD CONSTRAINT fk_trades_users
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

-- Trades → Trade Signals
ALTER TABLE trades
  ADD CONSTRAINT fk_trades_signals
  FOREIGN KEY (signal_id)
  REFERENCES trade_signals(id)
  ON DELETE SET NULL;

-- Agent Runs → Users
ALTER TABLE agent_runs
  ADD CONSTRAINT fk_runs_users
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE SET NULL;

-- Agent Runs → Trade Signals
ALTER TABLE agent_runs
  ADD CONSTRAINT fk_runs_signals
  FOREIGN KEY (approval_request_id)
  REFERENCES trade_signals(id)
  ON DELETE SET NULL;
```

#### 2.4.2 Cascade Rules Explained

**DELETE user → CASCADE:**
- `user_sessions`: Delete all user's sessions (automatic logout)
- `trade_signals`: Delete all user's pending signals
- `trades`: Delete all user's trade history

**Rationale:** When a user account is deleted, all related personal data must be removed (GDPR compliance).

**DELETE user → SET NULL:**
- `agent_runs`: Keep workflow audit trail even if user is deleted

**Rationale:** Preserve system audit logs for compliance and debugging.

**DELETE narrative → SET NULL:**
- `social_posts`: Keep historical posts even if narrative is removed

**Rationale:** Social posts may be relevant to multiple narratives over time.

**DELETE trade_signal → SET NULL:**
- `trades`: Keep trade record even if originating signal is deleted
- `agent_runs`: Keep workflow audit even if signal is deleted

**Rationale:** Executed trades are permanent financial records.

#### 2.4.3 Check Constraints

All check constraints are defined inline in Section 2.1 CREATE TABLE statements:

- `users.account_status IN ('active', 'suspended', 'deleted')`
- `smart_money_transactions.direction IN ('buy', 'sell', 'transfer')`
- `smart_money_transactions.confidence_score BETWEEN 1 AND 10`
- `narratives.strength_score BETWEEN 1 AND 10`
- `security_scans.risk_level IN ('critical', 'high', 'medium', 'low', 'safe')`
- `trade_signals.signal_type IN ('buy', 'sell')`
- `trade_signals.confidence_score BETWEEN 1 AND 10`
- `trade_signals.status IN ('pending_approval', 'approved', 'rejected', 'expired', 'executed')`
- `trades.trade_type IN ('buy', 'sell')`
- `trades.status IN ('open', 'closed', 'stopped_out', 'target_hit')`
- `agent_runs.execution_status IN ('running', 'completed', 'failed', 'paused_for_approval')`

**Rationale:** Check constraints prevent invalid data at the database level, ensuring data integrity even if application code has bugs.

---

### 2.5 Kysely Query Patterns

**Purpose:** Type-safe database queries using Kysely query builder.

**Package:** `kysely@^0.27.0`, `pg@^8.11.0` (see ADD v2.1 for architectural rationale)

#### 2.5.1 Database Type Definitions

**File:** `src/shared/database/types.ts`

```typescript
import { Generated, Selectable, Insertable, Updateable } from 'kysely';

// Table interfaces match SQL schema from Section 2.1 (passwordless auth)
export interface UsersTable {
  id: Generated<number>; // SERIAL PRIMARY KEY
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  account_status: 'active' | 'suspended' | 'deleted';
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AuthenticatorsTable {
  id: string; // VARCHAR PRIMARY KEY (credentialID)
  user_id: number;
  public_key: Buffer; // BYTEA
  counter: string; // BIGINT as string for precision safety
  transports: string[]; // VARCHAR[]
  device_type: 'singleDevice' | 'multiDevice';
  backed_up: boolean;
  device_name: string | null;
  aaguid: string | null;
  created_at: Generated<Date>;
  last_used_at: Date | null;
}

export interface OAuthAccountsTable {
  id: Generated<number>;
  user_id: number;
  provider: 'google' | 'apple';
  provider_account_id: string;
  email: string | null;
  access_token: string | null; // Encrypted
  refresh_token: string | null; // Encrypted
  expires_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserSessionsTable {
  id: string; // VARCHAR PRIMARY KEY
  user_id: number;
  token: string;
  refresh_token: string;
  auth_method: 'webauthn' | 'oauth';
  authenticator_id: string | null;
  oauth_provider: string | null;
  device_info: string | null;
  ip_address: string | null; // INET stored as string
  expires_at: Date;
  created_at: Generated<Date>;
  last_accessed_at: Generated<Date>;
}

export interface TradesTable {
  id: Generated<number>;
  user_id: number;
  signal_id: number | null;
  token_symbol: string;
  token_address: string | null;
  blockchain: string;
  trade_type: 'buy' | 'sell';
  entry_price: string; // DECIMAL as string for precision
  exit_price: string | null;
  position_size_usd: string;
  p_l_usd: string | null;
  p_l_percentage: string | null;
  opened_timestamp: Generated<Date>;
  closed_timestamp: Date | null;
  status: 'open' | 'closed' | 'stopped_out' | 'target_hit';
  created_at: Generated<Date>;
}

export interface TradeSignalsTable {
  id: Generated<number>;
  user_id: number;
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

export interface SmartMoneyTransactionsTable {
  id: Generated<number>;
  wallet_address: string;
  blockchain: string;
  token_symbol: string | null;
  token_address: string | null;
  amount: string | null;
  direction: 'buy' | 'sell' | 'transfer';
  usd_value: string | null;
  transaction_hash: string;
  block_number: string | null; // BIGINT as string for precision safety
  timestamp: Date;
  ai_reasoning: string | null;
  confidence_score: number | null;
  user_feedback: string | null;
  created_at: Generated<Date>;
}

export interface NarrativesTable {
  id: Generated<number>;
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
  id: Generated<number>;
  narrative_id: number | null;
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
  id: Generated<number>;
  contract_address: string;
  blockchain: string;
  scan_tool: string;
  risk_level: 'critical' | 'high' | 'medium' | 'low' | 'safe' | null;
  vulnerabilities: Record<string, unknown> | null; // JSONB
  ai_analysis: string | null;
  scanned_timestamp: Date;
  created_at: Generated<Date>;
}

export interface AgentRunsTable {
  id: Generated<number>;
  user_id: number | null;
  workflow_identifier: string;
  execution_status: 'running' | 'completed' | 'failed' | 'paused_for_approval';
  input_data: Record<string, unknown> | null; // JSONB
  output_data: Record<string, unknown> | null; // JSONB
  error_message: string | null;
  approval_request_id: number | null;
  started_timestamp: Generated<Date>;
  completed_timestamp: Date | null;
  created_at: Generated<Date>;
}

export interface LLMUsageLogsTable {
  id: Generated<number>;
  workflow_identifier: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: string;
  created_timestamp: Generated<Date>;
}

// Database interface - all 12 tables from Section 2.1
export interface Database {
  users: UsersTable;
  authenticators: AuthenticatorsTable;
  oauth_accounts: OAuthAccountsTable;
  user_sessions: UserSessionsTable;
  trades: TradesTable;
  trade_signals: TradeSignalsTable;
  smart_money_transactions: SmartMoneyTransactionsTable;
  narratives: NarrativesTable;
  social_posts: SocialPostsTable;
  security_scans: SecurityScansTable;
  agent_runs: AgentRunsTable;
  llm_usage_logs: LLMUsageLogsTable;
}

// Helper types for CRUD operations
export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type Authenticator = Selectable<AuthenticatorsTable>;
export type NewAuthenticator = Insertable<AuthenticatorsTable>;

export type Trade = Selectable<TradesTable>;
export type NewTrade = Insertable<TradesTable>;
export type TradeUpdate = Updateable<TradesTable>;
```

#### 2.5.2 Database Connection

**File:** `src/shared/database/connection.ts`

```typescript
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { Database } from './types';
import { env } from '../config/env';

const { Pool } = pg;

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX ?? 10,
  min: env.DATABASE_POOL_MIN ?? 2,
});

// Create Kysely instance with full type safety
export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
```

#### 2.5.3 Repository Pattern

**File:** `src/shared/repositories/TradeRepository.ts`

```typescript
import { db } from '../database/connection';
import { Trade, NewTrade, TradeUpdate } from '../database/types';
import { Result } from '@satoshibits/functional/result';
import { dbPolicy } from '../resilience/policies';

export class TradeRepository {
  // Find by ID with type safety
  async findById(id: number): Promise<Result<Trade | null, string>> {
    try {
      const trade = await dbPolicy.execute(() =>
        db
          .selectFrom('trades')
          .selectAll() // Return type automatically inferred as Trade
          .where('id', '=', id)
          .executeTakeFirst()
      );

      return { success: true, data: trade ?? null };
    } catch (error) {
      return { success: false, error: `Query failed: ${error.message}` };
    }
  }

  // Find with filtering and pagination
  async findByUserId(
    userId: number,
    options: { limit?: number; offset?: number; status?: Trade['status'] } = {}
  ): Promise<Result<Trade[], string>> {
    try {
      let query = db
        .selectFrom('trades')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('opened_timestamp', 'desc');

      if (options.status) {
        query = query.where('status', '=', options.status); // Type-safe: status must match Trade['status']
      }

      if (options.limit) query = query.limit(options.limit);
      if (options.offset) query = query.offset(options.offset);

      const trades = await dbPolicy.execute(() => query.execute());
      return { success: true, data: trades };
    } catch (error) {
      return { success: false, error: `Query failed: ${error.message}` };
    }
  }

  // Insert with type-safe values
  async insert(trade: NewTrade): Promise<Result<Trade, string>> {
    try {
      const [inserted] = await dbPolicy.execute(() =>
        db
          .insertInto('trades')
          .values(trade) // Type-safe: must match NewTrade interface
          .returningAll()
          .execute()
      );

      return { success: true, data: inserted };
    } catch (error) {
      return { success: false, error: `Insert failed: ${error.message}` };
    }
  }

  // Update with automatic updated_at
  async update(id: number, updates: TradeUpdate): Promise<Result<Trade, string>> {
    try {
      const [updated] = await dbPolicy.execute(() =>
        db
          .updateTable('trades')
          .set(updates)
          .where('id', '=', id)
          .returningAll()
          .execute()
      );

      if (!updated) {
        return { success: false, error: `Trade not found: ${id}` };
      }

      return { success: true, data: updated };
    } catch (error) {
      return { success: false, error: `Update failed: ${error.message}` };
    }
  }

  // JOIN example - trades with signal reasoning
  async findWithSignals(userId: number): Promise<Result<TradeWithSignal[], string>> {
    try {
      const results = await dbPolicy.execute(() =>
        db
          .selectFrom('trades')
          .leftJoin('trade_signals', 'trade_signals.id', 'trades.signal_id')
          .select([
            'trades.id',
            'trades.token_address',
            'trades.entry_price',
            'trade_signals.ai_reasoning as signal_reasoning',
            'trade_signals.confidence_score',
          ])
          .where('trades.user_id', '=', userId)
          .execute()
      );

      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: `Query failed: ${error.message}` };
    }
  }

  // Transaction example - atomic insert + update
  async insertWithSignalUpdate(
    trade: NewTrade,
    signalId: number
  ): Promise<Result<Trade, string>> {
    try {
      const result = await dbPolicy.execute(() =>
        db.transaction().execute(async (trx) => {
          // Insert trade
          const [inserted] = await trx
            .insertInto('trades')
            .values(trade)
            .returningAll()
            .execute();

          // Update signal status to 'executed'
          await trx
            .updateTable('trade_signals')
            .set({ status: 'executed' })
            .where('id', '=', signalId)
            .execute();

          return inserted;
        })
      );

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: `Transaction failed: ${error.message}` };
    }
  }
}
```

#### 2.5.4 Complex Query Examples

**Aggregation with window functions:**

```typescript
// Find top tokens by total PnL
async function getTopTokensByPnL(): Promise<Result<TokenStats[], string>> {
  try {
    const results = await db
      .selectFrom('trades')
      .select([
        'token_address',
        (eb) => eb.fn.count('id').as('trade_count'),
        (eb) => eb.fn.sum<string>('p_l_usd').as('total_pnl'),
        (eb) => eb.fn.avg<string>('p_l_usd').as('avg_pnl'),
      ])
      .where('status', 'in', ['closed', 'stopped_out', 'target_hit'])
      .groupBy('token_address')
      .having((eb) => eb.fn.count('id'), '>=', 5) // Min 5 trades
      .orderBy('total_pnl', 'desc')
      .limit(10)
      .execute();

    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: `Query failed: ${error.message}` };
  }
}
```

**CTE (Common Table Expression):**

```typescript
// Calculate win rate per blockchain
async function getWinRateByBlockchain(): Promise<Result<BlockchainStats[], string>> {
  try {
    const results = await db
      .with('trade_stats', (db) =>
        db
          .selectFrom('trades')
          .select([
            'blockchain',
            db.fn.count('id').as('total'),
            db.fn.countAll<number>().filterWhere('p_l_usd', '>', '0').as('wins'),
          ])
          .groupBy('blockchain')
      )
      .selectFrom('trade_stats')
      .select([
        'blockchain',
        'total',
        'wins',
        (eb) => eb('wins', '/', 'total').as('win_rate'),
      ])
      .execute();

    return { success: true, data: results };
  } catch (error) {
    return { success: false, error: `Query failed: ${error.message}` };
  }
}
```

#### 2.5.5 Migration Integration

Kysely works with node-pg-migrate for schema management (see Section 2.3).

**Workflow:**

```bash
# 1. Create migration
npm run migrate:create add_trades_table

# 2. Write SQL from Section 2.1 in migration file

# 3. Run migration
npm run migrate:up

# 4. Update Database interface in types.ts with new table

# 5. Kysely now has compile-time safety for new table
```

**Optional: Generate types from database:**

```bash
npm install --save-dev kysely-codegen
npx kysely-codegen --out-file src/shared/database/types.generated.ts
```

---

### 2.6 Analytics Storage (DuckDB)

**Package:** `duckdb-async@^1.0.0`

**Purpose:** Embedded OLAP database for backtesting results, historical candle data, and performance analytics. Separates analytical workloads from PostgreSQL transactional data.

> **Architecture Decision:** DuckDB was chosen over ClickHouse to avoid operational complexity. As an embedded, in-process database, it requires no separate server deployment and integrates directly with TypeScript services.

#### 2.6.1 Analytics Schema

```sql
-- DuckDB schema for analytics data
-- File: analytics.duckdb (managed by AnalyticsService)

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

-- Backtest results (from BacktestingService)
CREATE TABLE backtest_results (
  id VARCHAR PRIMARY KEY,  -- nanoid
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

-- Strategy performance metrics (aggregated)
CREATE TABLE strategy_metrics (
  strategy_name VARCHAR NOT NULL,
  symbol VARCHAR NOT NULL,
  period VARCHAR NOT NULL,  -- 'daily', 'weekly', 'monthly'
  period_start TIMESTAMP NOT NULL,
  total_return DOUBLE NOT NULL,
  sharpe_ratio DOUBLE NOT NULL,
  max_drawdown DOUBLE NOT NULL,
  trade_count INTEGER NOT NULL,
  win_rate DOUBLE NOT NULL,
  PRIMARY KEY (strategy_name, symbol, period, period_start)
);
```

#### 2.6.2 DuckDB TypeScript Integration

```typescript
import { Database } from 'duckdb-async';
import { nanoid } from 'nanoid';
import type pino from 'pino';
import { Result, ok, err } from '@satoshibits/functional';

/**
 * Analytics Service using DuckDB for OLAP workloads
 */
export class AnalyticsService {
  private db?: Database;

  constructor(
    private logger: pino.Logger,
    private config: {
      dbPath: string;  // e.g., './data/analytics.duckdb'
    }
  ) {}

  /**
   * Initialize DuckDB connection and create all tables
   */
  async initialize(): Promise<Result<void, Error>> {
    try {
      this.db = await Database.create(this.config.dbPath);

      // create all analytics tables
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS candles (
          symbol VARCHAR NOT NULL,
          exchange VARCHAR NOT NULL,
          timeframe VARCHAR NOT NULL,
          timestamp TIMESTAMP NOT NULL,
          open DOUBLE NOT NULL,
          high DOUBLE NOT NULL,
          low DOUBLE NOT NULL,
          close DOUBLE NOT NULL,
          volume DOUBLE NOT NULL,
          PRIMARY KEY (symbol, exchange, timeframe, timestamp)
        );

        CREATE TABLE IF NOT EXISTS backtest_results (
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

        CREATE TABLE IF NOT EXISTS backtest_trades (
          id VARCHAR PRIMARY KEY,
          backtest_id VARCHAR NOT NULL,
          entry_date TIMESTAMP NOT NULL,
          exit_date TIMESTAMP NOT NULL,
          entry_price DOUBLE NOT NULL,
          exit_price DOUBLE NOT NULL,
          quantity DOUBLE NOT NULL,
          pnl DOUBLE NOT NULL,
          pnl_percent DOUBLE NOT NULL,
          side VARCHAR NOT NULL
        );

        CREATE TABLE IF NOT EXISTS strategy_metrics (
          strategy_name VARCHAR NOT NULL,
          symbol VARCHAR NOT NULL,
          period VARCHAR NOT NULL,
          period_start TIMESTAMP NOT NULL,
          total_return DOUBLE NOT NULL,
          sharpe_ratio DOUBLE NOT NULL,
          max_drawdown DOUBLE NOT NULL,
          trade_count INTEGER NOT NULL,
          win_rate DOUBLE NOT NULL,
          PRIMARY KEY (strategy_name, symbol, period, period_start)
        );
      `);

      this.logger.info('Analytics service initialized', {
        dbPath: this.config.dbPath,
      });

      return ok(undefined);
    } catch (error) {
      return err(error as Error);
    }
  }

  /**
   * Store backtest result with trades (uses transaction for efficiency)
   */
  async storeBacktestResult(
    result: BacktestResult
  ): Promise<Result<string, Error>> {
    if (!this.db) {
      return err(new Error('Analytics service not initialized'));
    }

    const id = nanoid();

    try {
      // use transaction for atomic batch insert
      await this.db.exec('BEGIN TRANSACTION');

      await this.db.run(`
        INSERT INTO backtest_results VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        result.strategyName,
        result.symbol,
        result.startDate,
        result.endDate,
        result.initialCapital,
        result.finalCapital,
        result.totalReturn,
        result.sharpeRatio,
        result.maxDrawdown,
        result.winRate,
        result.totalTrades,
        result.profitableTrades,
        new Date(),
      ]);

      // prepare statement for efficient batch insert
      const stmt = await this.db.prepare(`
        INSERT INTO backtest_trades VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const trade of result.trades) {
        await stmt.run([
          nanoid(),
          id,
          trade.entryDate,
          trade.exitDate,
          trade.entryPrice,
          trade.exitPrice,
          trade.quantity,
          trade.pnl,
          trade.pnlPercent,
          trade.side,
        ]);
      }

      await stmt.finalize();
      await this.db.exec('COMMIT');

      return ok(id);
    } catch (error) {
      await this.db.exec('ROLLBACK');
      return err(error as Error);
    }
  }

  /**
   * Query historical candles
   */
  async getCandles(
    symbol: string,
    exchange: string,
    timeframe: string,
    startDate: Date,
    endDate: Date
  ): Promise<Result<Candle[], Error>> {
    if (!this.db) {
      return err(new Error('Analytics service not initialized'));
    }

    try {
      const rows = await this.db.all(`
        SELECT * FROM candles
        WHERE symbol = ? AND exchange = ? AND timeframe = ?
          AND timestamp >= ? AND timestamp <= ?
        ORDER BY timestamp ASC
      `, [symbol, exchange, timeframe, startDate, endDate]);

      return ok(rows as Candle[]);
    } catch (error) {
      return err(error as Error);
    }
  }

  /**
   * Import candles from Parquet file (efficient bulk load)
   * Note: File path is validated to prevent path traversal attacks
   */
  async importCandlesFromParquet(
    filePath: string
  ): Promise<Result<number, Error>> {
    if (!this.db) {
      return err(new Error('Analytics service not initialized'));
    }

    // validate file path - only allow alphanumeric, dashes, underscores, dots, slashes
    const safePathPattern = /^[a-zA-Z0-9_\-./]+\.parquet$/;
    if (!safePathPattern.test(filePath)) {
      return err(new Error('Invalid file path'));
    }

    try {
      // DuckDB read_parquet requires string literal; path validated above
      await this.db.exec(`
        INSERT INTO candles
        SELECT * FROM read_parquet('${filePath}')
      `);

      const result = await this.db.all(`SELECT COUNT(*) as count FROM candles`);
      return ok((result[0] as { count: number }).count);
    } catch (error) {
      return err(error as Error);
    }
  }

  /**
   * Get strategy performance summary
   */
  async getStrategyPerformance(
    strategyName: string
  ): Promise<Result<StrategyPerformance, Error>> {
    if (!this.db) {
      return err(new Error('Analytics service not initialized'));
    }

    try {
      const rows = await this.db.all(`
        SELECT
          strategy_name,
          COUNT(*) as backtest_count,
          AVG(total_return) as avg_return,
          AVG(sharpe_ratio) as avg_sharpe,
          MAX(max_drawdown) as worst_drawdown,
          AVG(win_rate) as avg_win_rate
        FROM backtest_results
        WHERE strategy_name = ?
        GROUP BY strategy_name
      `, [strategyName]);

      if (rows.length === 0) {
        return err(new Error('Strategy not found'));
      }

      return ok(rows[0] as StrategyPerformance);
    } catch (error) {
      return err(error as Error);
    }
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = undefined;
    }
  }
}
```

#### 2.6.3 Parquet Integration for Historical Data

DuckDB has native support for Parquet files, enabling efficient storage and querying of large historical datasets without loading everything into memory.

```typescript
/**
 * Export candles to Parquet for archival
 * Note: Inputs validated to prevent injection attacks
 */
async exportCandlesToParquet(
  symbol: string,
  outputPath: string
): Promise<Result<void, Error>> {
  if (!this.db) {
    return err(new Error('Analytics service not initialized'));
  }

  // validate symbol - only allow trading pair format (e.g., BTC/USDT, ETH-USD)
  const safeSymbolPattern = /^[A-Z0-9]{2,10}[/-][A-Z0-9]{2,10}$/;
  if (!safeSymbolPattern.test(symbol)) {
    return err(new Error('Invalid symbol format'));
  }

  // validate output path - only allow safe characters ending in .parquet
  const safePathPattern = /^[a-zA-Z0-9_\-./]+\.parquet$/;
  if (!safePathPattern.test(outputPath)) {
    return err(new Error('Invalid output path'));
  }

  try {
    // create temporary view using parameterized query to prevent SQL injection
    await this.db.run(
      'CREATE OR REPLACE TEMPORARY VIEW candles_to_export AS SELECT * FROM candles WHERE symbol = ?',
      [symbol]
    );

    // COPY from temporary view; outputPath validated by regex above
    await this.db.exec(`
      COPY candles_to_export TO '${outputPath}' (FORMAT PARQUET, COMPRESSION ZSTD)
    `);

    this.logger.info('Exported candles to Parquet', { symbol, outputPath });
    return ok(undefined);
  } catch (error) {
    return err(error as Error);
  }
}
```

**Storage Strategy:**
- **Hot data** (recent 30 days): Keep in DuckDB tables for fast queries
- **Cold data** (historical): Export to Parquet files on disk/object storage
- **Query cold data**: Use DuckDB's `read_parquet()` for ad-hoc historical analysis

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-20 | Initial | Initial database specification |
| 2.0 | 2026-01-15 | Multi-model Review | Complete rewrite for passwordless auth: removed password_hash/mfa columns from users table, added authenticators (WebAuthn) and oauth_accounts tables, updated user_sessions for auth tracking, updated social_posts for on-chain social (farcaster/lens), updated blockchain comments for L2-first strategy, rewrote migration template and Kysely types |
| 2.1 | 2026-01-15 | Migration Queue | Added Section 2.6 Analytics Storage (DuckDB) for backtesting results and historical candle data |

