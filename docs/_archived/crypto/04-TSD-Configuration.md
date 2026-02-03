# TSD - Environment Variables & Secrets Management
# Crypto Trading AI Agent Ecosystem

**Module**: Configuration
**Version**: 2.2
**Last Updated**: January 15, 2026
**Status**: Complete
**References**: BRD v2.3, FRD v4.0, ADD v2.1

[← Back to TSD Root](./04-TSD-Root.md)

---

## Overview

This module defines all required environment variables for local development and production deployment, along with comprehensive secret management procedures for Railway (backend) and Vercel (frontend).

> **Architecture Note:** This system uses passwordless authentication (WebAuthn/Passkeys + OAuth). Authentication configuration includes WebAuthn relying party settings and OAuth provider credentials - there is no password hashing configuration.

> **Blockchain Note:** This system follows an L2-first strategy. RPC endpoints for Arbitrum, Base, Optimism, and Polygon are required for production deployment.

**Contents:**
- 6.1: Environment Variable Specifications (35+ variables across 10 categories)
- 6.2: Secret Management Procedures (Railway, Vercel)
- 6.3: Local Development Configuration (.env.example)
- 6.4: Production Environment Configuration

---
## 6. Environment Variables & Secrets Management

This section defines all required environment variables for local development and production deployment.

### 6.1 Environment Variable Specifications

#### 6.1.1 Database Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string (format: `postgresql://user:password@host:port/database`) |
| `DATABASE_POOL_MIN` | No | `2` | Minimum database connection pool size |
| `DATABASE_POOL_MAX` | No | `10` | Maximum database connection pool size |
| `DATABASE_SSL` | No | `true` | Enable SSL for database connections (required for production) |

**Example:**
```bash
DATABASE_URL="postgresql://postgres:password@localhost:5432/crypto_trading_ai"
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_SSL=false  # Only for local development
```

#### 6.1.2 Cache Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes | - | Redis connection string (format: `redis://user:password@host:port`) |
| `REDIS_TTL` | No | `3600` | Default cache TTL in seconds (1 hour) |
| `REDIS_MAX_RETRIES` | No | `3` | Maximum connection retry attempts |

**Example:**
```bash
REDIS_URL="redis://localhost:6379"
REDIS_TTL=3600
REDIS_MAX_RETRIES=3
```

#### 6.1.3 LLM Provider Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | - | OpenAI API key for GPT models |
| `ANTHROPIC_API_KEY` | Yes | - | Anthropic API key for Claude models |
| `GOOGLE_API_KEY` | Yes | - | Google API key for Gemini models |
| `LLM_MONTHLY_BUDGET_USD` | No | `400` | Monthly cost budget in USD (BRD target: $300-500/month) |
| `LLM_DAILY_BUDGET_USD` | No | `15` | Daily cost budget in USD (triggers alerts when exceeded) |
| `LLM_DEFAULT_PROVIDER` | No | `openai` | Default LLM provider (`openai`, `anthropic`, `google`) |
| `LLM_TIMEOUT_MS` | No | `30000` | LLM API request timeout in milliseconds (30 seconds) |

**Example:**
```bash
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
GOOGLE_API_KEY="..."
LLM_MONTHLY_BUDGET_USD=400
LLM_DAILY_BUDGET_USD=15
LLM_DEFAULT_PROVIDER="openai"
LLM_TIMEOUT_MS=30000
```

#### 6.1.4 Blockchain RPC Configuration (L2-First)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ARBITRUM_RPC_URL` | Yes | - | Arbitrum One RPC endpoint (primary L2) |
| `BASE_RPC_URL` | Yes | - | Base RPC endpoint (primary L2) |
| `OPTIMISM_RPC_URL` | Yes | - | Optimism RPC endpoint (primary L2) |
| `POLYGON_RPC_URL` | Yes | - | Polygon RPC endpoint (primary L2) |
| `ETHEREUM_RPC_URL` | No | - | Ethereum L1 RPC endpoint (secondary, for L1 verification) |
| `SOLANA_RPC_URL` | No | - | Solana RPC endpoint (secondary) |

**Example:**
```bash
# Primary L2 chains (required)
ARBITRUM_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/..."
BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/..."
OPTIMISM_RPC_URL="https://opt-mainnet.g.alchemy.com/v2/..."
POLYGON_RPC_URL="https://polygon-mainnet.g.alchemy.com/v2/..."

# Secondary chains (optional)
ETHEREUM_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/..."
SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
```

**Provider Options:**
- **Alchemy**: Recommended for L2 support and reliability
- **QuickNode**: Good alternative with broad chain support
- **Infura**: Ethereum-focused, limited L2 support

#### 6.1.5 Data Provider Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `THEGRAPH_API_KEY` | Yes | - | The Graph API key for indexed blockchain data |
| `COINGECKO_API_KEY` | Yes (Prod) | - | CoinGecko API key (required for production rate limits) |
| `DEFILLAMA_API_KEY` | No | - | DefiLlama API key (optional, has free tier) |
| `NEYNAR_API_KEY` | Yes | - | Neynar API key for Farcaster data (on-chain social) |
| `LENS_API_URL` | No | `https://api.lens.dev` | Lens Protocol API endpoint |
| `CRYPTOPANIC_API_KEY` | Yes | - | CryptoPanic API key for news aggregation |
| `LUNARCRUSH_API_KEY` | No | - | LunarCrush API key (optional, supplementary sentiment) |
| `GOPLUS_API_KEY` | Yes | - | GoPlus Security API for honeypot detection and contract analysis |
| `DEXSCREENER_API_KEY` | No | - | DEX Screener API (optional, subject to public rate limits if omitted) |
| `TENDERLY_ACCESS_KEY` | Yes | - | Tenderly API key for transaction simulation |
| `TENDERLY_PROJECT` | Yes | - | Tenderly project slug |
| `TENDERLY_ACCOUNT` | Yes | - | Tenderly account/org name |
| `ETHERSCAN_API_KEY` | Yes | - | Ethereum Mainnet block explorer API key |
| `ARBISCAN_API_KEY` | Yes | - | Arbiscan API key for Arbitrum (get from arbiscan.io) |
| `BASESCAN_API_KEY` | Yes | - | Basescan API key for Base (get from basescan.org) |
| `OPTIMISTIC_ETHERSCAN_API_KEY` | Yes | - | Optimism explorer API key (get from optimistic.etherscan.io) |
| `POLYGONSCAN_API_KEY` | Yes | - | Polygonscan API key for Polygon (get from polygonscan.com) |
| `COINMARKETCAP_API_KEY` | No | - | CoinMarketCap API key (optional, for professional tier access) |
| `MCP_CACHE_ENABLED` | No | `true` | Enable Redis caching for MCP responses |
| `MCP_CACHE_TTL` | No | `300` | Default MCP cache TTL in seconds (endpoints may override) |

**Example:**
```bash
THEGRAPH_API_KEY="..."
COINGECKO_API_KEY="CG-..."
DEFILLAMA_API_KEY="..."
NEYNAR_API_KEY="..."  # Farcaster data
LENS_API_URL="https://api.lens.dev"
CRYPTOPANIC_API_KEY="..."
LUNARCRUSH_API_KEY="..."  # Optional
# Migration Queue Batch 1 additions
GOPLUS_API_KEY="..."  # Critical for L2 security
DEXSCREENER_API_KEY="..."  # Optional - subject to public rate limits if omitted
TENDERLY_ACCESS_KEY="..."  # Transaction simulation
TENDERLY_PROJECT="my-project"
TENDERLY_ACCOUNT="my-account"
# Block Explorer API Keys (L2-first - each explorer requires separate registration)
ETHERSCAN_API_KEY="..."  # Ethereum mainnet
ARBISCAN_API_KEY="..."  # Arbitrum (arbiscan.io)
BASESCAN_API_KEY="..."  # Base (basescan.org)
OPTIMISTIC_ETHERSCAN_API_KEY="..."  # Optimism (optimistic.etherscan.io)
POLYGONSCAN_API_KEY="..."  # Polygon (polygonscan.com)
COINMARKETCAP_API_KEY="..."  # Optional - professional tier access
MCP_CACHE_ENABLED=true
MCP_CACHE_TTL=300
```

#### 6.1.6 Exchange Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BINANCE_API_KEY` | No | - | Binance API key for CEX trading (optional) |
| `BINANCE_API_SECRET` | No | - | Binance API secret |

**Example:**
```bash
# CEX integration (optional - system is L2/DEX focused)
BINANCE_API_KEY="..."
BINANCE_API_SECRET="..."
```

#### 6.1.7 Authentication Configuration (Passwordless)

> **Note:** This system uses passwordless authentication only. There is no password hashing configuration.

**WebAuthn/Passkey Configuration:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WEBAUTHN_RP_ID` | Yes | - | Relying Party ID - your domain (e.g., `crypto-trading-ai.com`) |
| `WEBAUTHN_RP_NAME` | Yes | - | Relying Party display name (e.g., `Crypto Trading AI`) |
| `WEBAUTHN_ORIGIN` | Yes | - | Expected origin URL (e.g., `https://app.crypto-trading-ai.com`) |
| `WEBAUTHN_TIMEOUT` | No | `60000` | Authentication timeout in milliseconds (60 seconds) |

**OAuth Provider Configuration:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | - | Google OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | - | Google OAuth 2.0 client secret |
| `APPLE_OAUTH_CLIENT_ID` | No | - | Apple Sign-In client ID (Service ID) |
| `APPLE_OAUTH_CLIENT_SECRET` | No | - | Apple Sign-In client secret (generated JWT) |
| `OAUTH_CALLBACK_URL` | Yes | - | OAuth redirect URI (e.g., `https://api.crypto-trading-ai.com/auth/callback`) |

**JWT/Session Configuration:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | JWT signing secret (minimum 32 characters) |
| `JWT_REFRESH_SECRET` | Yes | - | Refresh token signing secret (minimum 32 characters) |
| `JWT_EXPIRY` | No | `15m` | Access token expiry (examples: `15m`, `1h`, `30s`) |
| `JWT_REFRESH_EXPIRY` | No | `7d` | Refresh token expiry (examples: `7d`, `30d`) |
| `SESSION_SECRET` | Yes | - | Session cookie signing secret (minimum 32 characters) |

**Example:**
```bash
# WebAuthn/Passkey Configuration
WEBAUTHN_RP_ID="crypto-trading-ai.com"
WEBAUTHN_RP_NAME="Crypto Trading AI"
WEBAUTHN_ORIGIN="https://app.crypto-trading-ai.com"
WEBAUTHN_TIMEOUT=60000

# OAuth Providers
GOOGLE_OAUTH_CLIENT_ID="..."
GOOGLE_OAUTH_CLIENT_SECRET="..."
APPLE_OAUTH_CLIENT_ID="..."  # Optional
APPLE_OAUTH_CLIENT_SECRET="..."  # Optional
OAUTH_CALLBACK_URL="https://api.crypto-trading-ai.com/auth/callback"

# JWT/Session (generate with: openssl rand -base64 32)
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-min-32-chars"
JWT_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
SESSION_SECRET="your-super-secret-session-key-min-32-chars"
```

**Security Requirements:**
- All secrets must be generated using cryptographically secure random generators
- Minimum length: 32 characters
- Never commit secrets to git
- Rotate secrets quarterly (every 90 days)

**Generate secure secrets:**
```bash
# On Linux/Mac
openssl rand -base64 32

# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

#### 6.1.8 Notification Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Telegram bot token for notifications (from @BotFather) |
| `SMTP_HOST` | No | - | Email SMTP server host |
| `SMTP_PORT` | No | `587` | Email SMTP server port |
| `SMTP_USER` | No | - | Email SMTP username |
| `SMTP_PASS` | No | - | Email SMTP password |
| `SMTP_FROM` | No | `noreply@crypto-trading-ai.com` | Email sender address |

**Example:**
```bash
TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="alerts@crypto-trading-ai.com"
```

#### 6.1.9 Application Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Environment (`development`, `production`, `test`) |
| `PORT` | No | `3000` | Backend server port |
| `FRONTEND_URL` | Yes | - | Frontend origin for CORS (example: `https://app.crypto-trading-ai.com`) |
| `LOG_LEVEL` | No | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate limit window in ms (15 minutes) |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Max requests per window per IP |

**Example:**
```bash
NODE_ENV="production"
PORT=3000
FRONTEND_URL="https://app.crypto-trading-ai.com"
LOG_LEVEL="info"
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

#### 6.1.10 Monitoring Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PAGERDUTY_SERVICE_KEY` | No | - | PagerDuty integration key for critical alerts |
| `SLACK_WEBHOOK_CRITICAL` | No | - | Slack webhook URL for critical alerts |
| `SLACK_WEBHOOK_ALERTS` | No | - | Slack webhook URL for high-priority alerts |
| `SLACK_WEBHOOK_WARNINGS` | No | - | Slack webhook URL for medium-priority warnings |
| `SENTRY_DSN` | No | - | Sentry DSN for error tracking |

**Example:**
```bash
PAGERDUTY_SERVICE_KEY="..."
SLACK_WEBHOOK_CRITICAL="https://hooks.slack.com/services/..."
SLACK_WEBHOOK_ALERTS="https://hooks.slack.com/services/..."
SLACK_WEBHOOK_WARNINGS="https://hooks.slack.com/services/..."
SENTRY_DSN="https://...@sentry.io/..."
```

### 6.2 Secret Management Procedures

#### 6.2.1 Railway (Backend Deployment)

**Adding Secrets:**

1. Navigate to your Railway project dashboard
2. Select the backend service
3. Go to **Variables** tab
4. Click **New Variable**
5. Add each environment variable from Section 6.1
6. Click **Deploy** to apply changes

**Best Practices:**
- Use Railway's built-in secret encryption (secrets are encrypted at rest)
- Never expose secrets in build logs
- Use separate environments for staging and production
- Enable audit logging to track secret changes

**Railway CLI (Alternative):**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# Set environment variable
railway variables set DATABASE_URL="postgresql://..."

# Set multiple variables from .env file
railway variables set --env-file .env.production
```

#### 6.2.2 Vercel (Frontend Deployment)

**Adding Secrets:**

1. Navigate to your Vercel project dashboard
2. Go to **Settings** → **Environment Variables**
3. Add each client-exposed variable with `NEXT_PUBLIC_` prefix
4. Select environments: Production, Preview, Development
5. Click **Save**
6. Redeploy to apply changes

**Client-Exposed Variables (Frontend):**
```bash
NEXT_PUBLIC_API_URL="https://api.crypto-trading-ai.com"
NEXT_PUBLIC_WS_URL="wss://api.crypto-trading-ai.com"
NEXT_PUBLIC_ENV="production"
```

**Server-Only Variables (API Routes):**
```bash
# These are NOT prefixed with NEXT_PUBLIC_ and stay server-side
SESSION_SECRET="..."
JWT_SECRET="..."
```

**Vercel CLI (Alternative):**
```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Link to project
vercel link

# Set environment variable
vercel env add DATABASE_URL production

# Pull environment variables locally
vercel env pull .env.local
```

#### 6.2.3 Local Development

**Never commit `.env` to git:**

Add to `.gitignore`:
```gitignore
.env
.env.local
.env.*.local
```

**Use `.env.example` as template:**

Create `.env.example` with placeholder values (see Section 6.3), commit this to git as documentation.

**Sharing secrets with team:**

Use a secure secret sharing tool:
- **1Password** (recommended for teams)
- **AWS Secrets Manager** (for AWS users)
- **HashiCorp Vault** (for enterprise)

DO NOT share secrets via:
- Slack messages
- Email
- Unencrypted text files
- Screenshots

#### 6.2.4 Secret Rotation Policy

**Rotation Schedule:**
- **Critical secrets** (JWT, database passwords): Every 90 days
- **API keys**: Every 180 days
- **After security incident**: Immediately

**Rotation Procedure:**

1. Generate new secret
2. Add new secret to Railway/Vercel with `_NEW` suffix
3. Update application code to try new secret, fallback to old
4. Deploy changes
5. Monitor for errors (24 hours)
6. Remove old secret
7. Deploy final cleanup

**Example (JWT secret rotation):**
```typescript
// During rotation period, accept both old and new secrets
const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET_NEW);
  } catch (err) {
    // Fallback to old secret during rotation
    return jwt.verify(token, process.env.JWT_SECRET);
  }
};
```

#### 6.2.5 Access Control

**Railway Access Levels:**
- **Owner**: Full access to all secrets
- **Admin**: Can view and modify secrets
- **Member**: Can view secrets (read-only)
- **Viewer**: Cannot access secrets

**Principle of Least Privilege:**
- Developers: Member access (can view secrets for debugging)
- DevOps: Admin access (can rotate secrets)
- CI/CD: Service account with read-only access to specific secrets

#### 6.2.6 Doppler Secrets Management (Recommended)

**Package:** `@doppler/sdk@^1.0.0` (optional - env injection preferred)

**Purpose:** Centralized secrets management across all environments. Replaces platform-specific secrets with a unified management plane.

> **Architecture Decision:** Doppler was chosen over HashiCorp Vault to avoid self-hosted infrastructure overhead. As a SaaS solution, it provides audit logs, access control, and environment management without operational complexity.

**Setup:**

```bash
# Install Doppler CLI
curl -sLf https://cli.doppler.com/install.sh | sh

# Authenticate
doppler login

# Create project (one-time setup)
doppler projects create crypto-trading-ai

# Configure environments
doppler environments create development
doppler environments create staging
doppler environments create production
```

**Environment Structure:**
```
crypto-trading-ai/
├── development    # Local dev secrets
├── staging        # Pre-production testing
└── production     # Live environment secrets
```

**Adding Secrets:**

```bash
# Set a secret
doppler secrets set DATABASE_URL "postgresql://..."

# Set multiple secrets from file
doppler secrets upload .env.local

# Clone config to new environment (download/upload workflow)
doppler secrets download --config development --no-file --format env | \
  doppler secrets upload --config staging
```

**Local Development (CLI Injection):**

```bash
# Run application with secrets injected as environment variables
doppler run -- npm run dev

# Run with specific environment
doppler run --config staging -- npm run dev

# Generate .env file for IDE compatibility (not recommended for production)
doppler secrets download --no-file --format env > .env.local
```

**TypeScript Integration (Optional SDK):**

```typescript
import { Doppler } from '@doppler/sdk';

/**
 * Fetch secrets programmatically (for dynamic secret refresh)
 * Note: Prefer CLI injection for static secrets
 */
export async function fetchSecrets(): Promise<Record<string, string>> {
  const doppler = new Doppler({
    accessToken: process.env.DOPPLER_TOKEN,
  });

  const response = await doppler.secrets.list({
    project: 'crypto-trading-ai',
    config: process.env.NODE_ENV || 'development',
  });

  return response.secrets;
}
```

**Container Runtime (Production):**

```dockerfile
# Option 1: Doppler CLI in container entrypoint (recommended)
FROM node:22-alpine

# Install Doppler CLI
RUN apk add --no-cache curl && \
    curl -sLf https://cli.doppler.com/install.sh | sh

COPY . /app
WORKDIR /app

# Secrets injected at runtime
CMD ["doppler", "run", "--", "node", "dist/index.js"]
```

```yaml
# Option 2: Kubernetes Operator (for K8s deployments)
apiVersion: secrets.doppler.com/v1alpha1
kind: DopplerSecret
metadata:
  name: crypto-trading-secrets
spec:
  project: crypto-trading-ai
  config: production
  secretsRef:
    name: app-secrets
```

**Railway Integration:**

```bash
# Set Doppler service token in Railway
railway variables set DOPPLER_TOKEN="dp.st.xxxx"

# Update Dockerfile to use Doppler CLI
# Doppler will inject all secrets at container start
```

**Access Control (Doppler Dashboard):**
- **Owner**: Full project access, billing
- **Admin**: Manage secrets, environments, team members
- **Developer**: View/edit secrets in assigned environments
- **Viewer**: Read-only access to secrets

**Audit Logging:**
- All secret access logged with timestamp, user, IP
- Secret value changes tracked with diff
- Exportable audit logs for compliance

**Migration from .env Files:**

```bash
# 1. Upload existing .env to Doppler
doppler secrets upload .env.local

# 2. Update local dev workflow
doppler run -- npm run dev

# 3. Update CI/CD to use Doppler
# GitHub Actions example:
# - uses: dopplerhq/secrets-fetch-action@v1
#   with:
#     doppler-token: ${{ secrets.DOPPLER_TOKEN }}

# 4. Remove .env files from deployment
# Keep .env.example for documentation only
```

### 6.3 Local Development Configuration

**Complete `.env.example` file:**

Create this file in your project root and commit to git:

```bash
# ============================================
# DATABASE CONFIGURATION
# ============================================
DATABASE_URL="postgresql://postgres:password@localhost:5432/crypto_trading_ai"
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_SSL=false

# ============================================
# CACHE CONFIGURATION
# ============================================
REDIS_URL="redis://localhost:6379"
REDIS_TTL=3600
REDIS_MAX_RETRIES=3

# ============================================
# LLM PROVIDER CONFIGURATION
# ============================================
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
GOOGLE_API_KEY="..."
LLM_MONTHLY_BUDGET_USD=400
LLM_DAILY_BUDGET_USD=15
LLM_DEFAULT_PROVIDER="openai"
LLM_TIMEOUT_MS=30000

# ============================================
# BLOCKCHAIN RPC CONFIGURATION (L2-First)
# ============================================
# Primary L2 chains (required for production)
ARBITRUM_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/..."
BASE_RPC_URL="https://base-mainnet.g.alchemy.com/v2/..."
OPTIMISM_RPC_URL="https://opt-mainnet.g.alchemy.com/v2/..."
POLYGON_RPC_URL="https://polygon-mainnet.g.alchemy.com/v2/..."
# Secondary chains (optional)
# ETHEREUM_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/..."
# SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"

# ============================================
# DATA PROVIDER CONFIGURATION (13 MCP Servers)
# ============================================
THEGRAPH_API_KEY="..."
COINGECKO_API_KEY="CG-..."  # Required for production
DEFILLAMA_API_KEY="..."  # Optional
NEYNAR_API_KEY="..."  # Farcaster data (on-chain social)
LENS_API_URL="https://api.lens.dev"  # Lens Protocol
CRYPTOPANIC_API_KEY="..."
LUNARCRUSH_API_KEY="..."  # Optional supplementary sentiment
# Migration Queue Batch 1 (Security, DEX, Simulation)
GOPLUS_API_KEY="..."  # Critical - honeypot/rugpull detection
DEXSCREENER_API_KEY="..."  # Optional - subject to public rate limits if omitted
TENDERLY_ACCESS_KEY="..."  # Transaction simulation
TENDERLY_PROJECT="my-project"
TENDERLY_ACCOUNT="my-account"
# Block Explorer API Keys (L2-first - each explorer requires separate registration)
ETHERSCAN_API_KEY="..."  # Ethereum mainnet
ARBISCAN_API_KEY="..."  # Arbitrum (arbiscan.io)
BASESCAN_API_KEY="..."  # Base (basescan.org)
OPTIMISTIC_ETHERSCAN_API_KEY="..."  # Optimism (optimistic.etherscan.io)
POLYGONSCAN_API_KEY="..."  # Polygon (polygonscan.com)
COINMARKETCAP_API_KEY="..."  # Optional - professional tier access
MCP_CACHE_ENABLED=true
MCP_CACHE_TTL=300

# ============================================
# EXCHANGE CONFIGURATION (Optional)
# ============================================
# BINANCE_API_KEY="..."
# BINANCE_API_SECRET="..."

# ============================================
# AUTHENTICATION CONFIGURATION (Passwordless)
# ============================================
# WebAuthn/Passkey
WEBAUTHN_RP_ID="localhost"
WEBAUTHN_RP_NAME="Crypto Trading AI (Dev)"
WEBAUTHN_ORIGIN="http://localhost:3001"
WEBAUTHN_TIMEOUT=60000

# OAuth Providers
GOOGLE_OAUTH_CLIENT_ID="..."
GOOGLE_OAUTH_CLIENT_SECRET="..."
# APPLE_OAUTH_CLIENT_ID="..."  # Optional
# APPLE_OAUTH_CLIENT_SECRET="..."  # Optional
OAUTH_CALLBACK_URL="http://localhost:3000/auth/callback"

# JWT/Session (generate with: openssl rand -base64 32)
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-min-32-chars"
JWT_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"
SESSION_SECRET="your-super-secret-session-key-min-32-chars"

# ============================================
# NOTIFICATION CONFIGURATION
# ============================================
TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
# Email (optional for local dev)
# SMTP_HOST="smtp.gmail.com"
# SMTP_PORT=587
# SMTP_USER="your-email@gmail.com"
# SMTP_PASS="your-app-password"
# SMTP_FROM="alerts@crypto-trading-ai.com"

# ============================================
# APPLICATION CONFIGURATION
# ============================================
NODE_ENV="development"
PORT=3000
FRONTEND_URL="http://localhost:3001"
LOG_LEVEL="debug"
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# ============================================
# MONITORING CONFIGURATION (Optional for local)
# ============================================
# PAGERDUTY_SERVICE_KEY="..."
# SLACK_WEBHOOK_CRITICAL="https://hooks.slack.com/services/..."
# SLACK_WEBHOOK_ALERTS="https://hooks.slack.com/services/..."
# SLACK_WEBHOOK_WARNINGS="https://hooks.slack.com/services/..."
# SENTRY_DSN="https://...@sentry.io/..."
```

**Setup Instructions for New Developers:**

1. Clone repository
   ```bash
   git clone https://github.com/your-org/crypto-trading-ai-agent-ecosystem.git
   cd crypto-trading-ai-agent-ecosystem
   ```

2. Copy `.env.example` to `.env`
   ```bash
   cp .env.example .env
   ```

3. Generate secrets
   ```bash
   # JWT_SECRET
   openssl rand -base64 32

   # JWT_REFRESH_SECRET
   openssl rand -base64 32

   # SESSION_SECRET
   openssl rand -base64 32
   ```

4. Fill in API keys
   - Request LLM API keys from team lead
   - Request MCP server API keys from team lead
   - Create personal Telegram bot via @BotFather

5. Start local services
   ```bash
   # Start PostgreSQL and Redis via Docker
   docker-compose up -d postgres redis

   # Run migrations
   npm run migrate:up

   # Start backend
   npm run dev
   ```

### 6.4 Production Environment Configuration

#### 6.4.1 Railway (Backend) Environment Variables

**Required for Production:**

All variables from Section 6.1 MUST be set in Railway with production values.

**Critical Security Settings:**
```bash
NODE_ENV="production"
DATABASE_SSL=true  # REQUIRED for production
LOG_LEVEL="info"   # Do not use "debug" in production
```

**Production Database URL Format:**
```bash
DATABASE_URL="postgresql://user:password@host.railway.app:5432/railway?sslmode=require"
```

**Redis URL (Railway Internal):**
```bash
# Railway provides internal Redis URL
REDIS_URL="${{REDIS.REDIS_URL}}"
```

#### 6.4.2 Vercel (Frontend) Environment Variables

**Required for Production:**

```bash
# Public variables (exposed to browser)
NEXT_PUBLIC_API_URL="https://api.crypto-trading-ai.com"
NEXT_PUBLIC_WS_URL="wss://api.crypto-trading-ai.com"
NEXT_PUBLIC_ENV="production"

# Server-only variables (API routes) - reference from Railway for consistency
SESSION_SECRET="${{Railway.SESSION_SECRET}}"
JWT_SECRET="${{Railway.JWT_SECRET}}"
JWT_REFRESH_SECRET="${{Railway.JWT_REFRESH_SECRET}}"
```

**Environment-Specific Values:**

| Environment | API URL | Purpose |
|-------------|---------|---------|
| Production | `https://api.crypto-trading-ai.com` | Live production traffic |
| Preview | `https://api-preview.crypto-trading-ai.com` | PR preview deployments |
| Development | `http://localhost:3000` | Local development |

#### 6.4.3 Secret Audit Log

**Maintain a secret audit log (tracked in secure document, NOT in git):**

| Secret | Created Date | Last Rotated | Next Rotation Due | Rotated By |
|--------|--------------|--------------|-------------------|------------|
| JWT_SECRET | 2025-10-20 | 2025-10-20 | 2026-01-18 | DevOps Team |
| DATABASE_PASSWORD | 2025-10-20 | 2025-10-20 | 2026-01-18 | DevOps Team |
| BINANCE_API_SECRET | 2025-10-20 | 2025-10-20 | 2026-04-18 | DevOps Team |

**Audit Checklist (Monthly):**
- [ ] All secrets in Railway match documented secrets
- [ ] No expired secrets (check rotation due dates)
- [ ] No secrets in git history (use `git log -S "sk-"` to search)
- [ ] Access logs reviewed for unauthorized access
- [ ] Team members with access matches current team roster

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-20 | Initial | Initial configuration specification |
| 2.0 | 2026-01-15 | Multi-model Review | Complete rewrite for passwordless auth and L2-first strategy: removed BCRYPT_ROUNDS (no password hashing), added WebAuthn/Passkey configuration (RP_ID, RP_NAME, ORIGIN), added OAuth provider configuration (Google/Apple), added L2 RPC URLs (Arbitrum, Base, Optimism, Polygon), added Farcaster/Lens API configuration (on-chain social), updated LLM budget to $400/month default aligned with BRD v2.3, reorganized sections from 8 to 10 categories |
| 2.1 | 2026-01-15 | Migration Queue | Batch 1 additions: Added 11 new env vars for MCP servers (GOPLUS_API_KEY, DEXSCREENER_API_KEY, TENDERLY_*, ETHERSCAN_API_KEY, ARBISCAN_API_KEY, BASESCAN_API_KEY, OPTIMISTIC_ETHERSCAN_API_KEY, POLYGONSCAN_API_KEY, COINMARKETCAP_API_KEY); L2-first block explorer keys |
| 2.2 | 2026-01-15 | Migration Queue | Added Section 6.2.6 Doppler Secrets Management: centralized secrets with CLI injection, TypeScript SDK, container runtime integration, Kubernetes operator, Railway integration, migration guide from .env files |

