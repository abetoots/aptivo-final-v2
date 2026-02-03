# TSD - CI/CD Pipeline & Monitoring
# Crypto Trading AI Agent Ecosystem

**Module**: DevOps
**Version**: 2.1
**Last Updated**: January 15, 2026
**Status**: Complete
**References**: BRD v2.3, FRD v4.0, ADD v2.1

[← Back to TSD Root](./04-TSD-Root.md)

---

## Overview

This module defines the complete DevOps infrastructure including CI/CD pipelines, deployment configurations, logging, monitoring, and alerting for the Crypto Trading AI Agent Ecosystem.

**Contents:**
- 7.1: GitHub Actions Workflow
- 7.2: Vercel Deployment Configuration
- 7.3: Railway Deployment Configuration
- 7.4: Log Management & Aggregation
- 7.5: Metrics Collection (Prometheus)
- 7.6: Alerting Configuration (PagerDuty, Slack)
- 7.7: Health Check Endpoints

---

## 7.1 GitHub Actions Workflow

**File:** `.github/workflows/deploy.yml`

**Purpose:** Automated testing, building, and deployment on every push to `main` branch.

```yaml
name: Deploy Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '22.x'

jobs:
  # ============================================
  # JOB 1: Run Tests and Type Checking
  # ============================================
  test:
    name: Test & Type Check
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: crypto_trading_ai_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run TypeScript type checking
        run: npm run typecheck

      - name: Run Prettier check
        run: npm run format:check

      - name: Run database migrations (test)
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/crypto_trading_ai_test
        run: npm run migrate:up

      - name: Run tests
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/crypto_trading_ai_test
          REDIS_URL: redis://localhost:6379
          NODE_ENV: test
        run: npm run test:coverage

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json
          flags: unittests
          name: codecov-umbrella

  # ============================================
  # JOB 2: Build Application
  # ============================================
  build:
    name: Build
    runs-on: ubuntu-latest
    needs: test

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build TypeScript
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 7

  # ============================================
  # JOB 3: Deploy Frontend to Vercel
  # ============================================
  deploy-frontend:
    name: Deploy Frontend (Vercel)
    runs-on: ubuntu-latest
    needs: [test, build]
    if: github.ref == 'refs/heads/main'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install Vercel CLI
        run: npm install -g vercel@latest

      - name: Deploy to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: |
          cd frontend
          vercel pull --yes --environment=production --token=$VERCEL_TOKEN
          vercel build --prod --token=$VERCEL_TOKEN
          vercel deploy --prebuilt --prod --token=$VERCEL_TOKEN

  # ============================================
  # JOB 3b: Preview Deployment (PRs only)
  # ============================================
  deploy-preview:
    name: Deploy Preview (Vercel)
    runs-on: ubuntu-latest
    needs: [test]
    if: github.event_name == 'pull_request'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install Vercel CLI
        run: npm install -g vercel@latest

      - name: Deploy Preview to Vercel
        id: vercel-deploy
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: |
          cd frontend
          vercel pull --yes --environment=preview --token=$VERCEL_TOKEN
          vercel build --token=$VERCEL_TOKEN
          DEPLOY_URL=$(vercel deploy --prebuilt --token=$VERCEL_TOKEN)
          echo "deploy_url=$DEPLOY_URL" >> $GITHUB_OUTPUT

      - name: Comment deployment URL on PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '✅ Preview deployed to Vercel: ${{ steps.vercel-deploy.outputs.deploy_url }}'
            })

  # ============================================
  # JOB 4: Deploy Backend to Railway
  # ============================================
  deploy-backend:
    name: Deploy Backend (Railway)
    runs-on: ubuntu-latest
    needs: [test, build]
    if: github.ref == 'refs/heads/main'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/

      - name: Deploy to Railway
        uses: railwayapp/railway-github-action@v1
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: backend

  # ============================================
  # JOB 5: Security Scanning
  # ============================================
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    needs: test

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run npm audit
        run: npm audit --audit-level=moderate

      - name: Run Snyk security scan
        uses: snyk/actions/node@0.4.0
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

  # ============================================
  # JOB 6: Notify Deployment Status
  # ============================================
  notify:
    name: Notify Team
    runs-on: ubuntu-latest
    needs: [deploy-frontend, deploy-backend]
    if: always() && github.ref == 'refs/heads/main'

    steps:
      - name: Notify Slack on success
        if: success()
        uses: slackapi/slack-github-action@v2.0.0
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "✅ Production deployment successful!",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Crypto Trading AI* deployed to production\n• Frontend: Vercel\n• Backend: Railway\n• Commit: ${{ github.sha }}"
                  }
                }
              ]
            }

      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v2.0.0
        with:
          webhook: ${{ secrets.SLACK_WEBHOOK_URL }}
          webhook-type: incoming-webhook
          payload: |
            {
              "text": "❌ Production deployment failed!",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Crypto Trading AI* deployment failed\n• Commit: ${{ github.sha }}\n• Check logs: https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}"
                  }
                }
              ]
            }
```

### 7.1.1 Required GitHub Secrets

Configure these secrets in **Settings → Secrets and variables → Actions**:

```bash
# Vercel
VERCEL_TOKEN=<vercel-deployment-token>
VERCEL_ORG_ID=<vercel-organization-id>
VERCEL_PROJECT_ID=<vercel-project-id>

# Railway
RAILWAY_TOKEN=<railway-deployment-token>
DATABASE_URL=<production-postgres-url>

# Security
SNYK_TOKEN=<snyk-api-token>

# Notifications
SLACK_WEBHOOK_URL=<slack-webhook-url>
```

---

## 7.2 Vercel Deployment Configuration

**File:** `vercel.json`

**Purpose:** Configure Vercel deployment for Next.js frontend.

```json
{
  "version": 2,
  "name": "crypto-trading-ai-frontend",
  "regions": ["iad1"],
  "build": {
    "env": {
      "NEXT_PUBLIC_API_URL": "@api-url",
      "NEXT_PUBLIC_WS_URL": "@ws-url"
    }
  },
  "env": {
    "NEXT_PUBLIC_API_URL": "https://api.crypto-trading-ai.com/v1",
    "NEXT_PUBLIC_WS_URL": "wss://api.crypto-trading-ai.com/ws"
  },
  "functions": {
    "api/**/*.ts": {
      "memory": 1024,
      "maxDuration": 10
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=()"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.crypto-trading-ai.com wss://api.crypto-trading-ai.com"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.crypto-trading-ai.com/v1/:path*"
    }
  ]
}
```

### 7.2.1 Vercel Environment Variables

Configure in **Vercel Dashboard → Settings → Environment Variables**:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://api.crypto-trading-ai.com/v1
NEXT_PUBLIC_WS_URL=wss://api.crypto-trading-ai.com/ws

# Analytics (optional)
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

---

## 7.3 Railway Deployment Configuration

**File:** `Dockerfile`

**Purpose:** Containerize backend for Railway deployment.

```dockerfile
# ============================================
# Stage 1: Build
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy migration files
COPY migrations/ ./migrations/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 3000

# Health check (uses wget which is included in alpine)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start application
CMD ["node", "dist/index.js"]
```

### 7.3.1 Railway Configuration File

**File:** `railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "releaseCommand": "npm run migrate:up",
    "startCommand": "node dist/index.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

> **Note:** The `releaseCommand` runs once before the new version is released, ensuring migrations complete before any instances start. This prevents race conditions when scaling to multiple containers.

### 7.3.2 Railway Environment Variables

Configure in **Railway Dashboard → Variables**:

```bash
# Database
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_SSL=true

# Redis
REDIS_URL=${{Redis.REDIS_URL}}
REDIS_TLS=true

# LLM Providers (see TSD-Configuration.md for full details)
OPENAI_API_KEY=<secret>
ANTHROPIC_API_KEY=<secret>
GOOGLE_API_KEY=<secret>
LLM_MONTHLY_BUDGET_USD=400
LLM_DAILY_BUDGET_USD=15

# MCP Servers
THEGRAPH_API_KEY=<secret>
COINGECKO_API_KEY=<secret>
DEFILLAMA_API_KEY=<secret>
LUNARCRUSH_API_KEY=<secret>
CRYPTOPANIC_API_KEY=<secret>
BINANCE_API_KEY=<secret>
BINANCE_API_SECRET=<secret>

# Authentication
JWT_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Monitoring
SENTRY_DSN=<sentry-dsn>
PROMETHEUS_PORT=9090
```

---

## 7.4 Log Management & Aggregation

**Purpose:** This section defines the operational strategy for collecting, aggregating, and managing logs produced by the application. It covers the infrastructure responsible for log transport, storage, and alerting.

**For application-level logging implementation** (Pino configuration, child loggers, usage patterns), see **[TSD-Services.md Section 4.3](./04-TSD-Services.md#43-logging-service)**.

### 7.4.1 Logging Philosophy

The logging infrastructure follows a **12-factor app** approach with clear separation of concerns:

- **Standardized Output:** All services write structured, newline-delimited JSON (NDJSON) logs to `stdout`. This is the sole logging output stream.
- **Stateless Services:** Services are not responsible for log file management, rotation, or shipping. This is handled entirely by the hosting environment.
- **Separation of Concerns:**
  - **Application (TSD-Services.md):** Responsible for *producing* logs with rich context using Pino
  - **Infrastructure (this document):** Responsible for *collecting, shipping, storing, and analyzing* those logs

### 7.4.2 Log Pipeline

The log pipeline moves logs from the application to a centralized analysis platform:

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Application   │────▶│   Railway    │────▶│    Datadog /    │
│  (Pino→stdout)  │     │  Log Drain   │     │   CloudWatch    │
└─────────────────┘     └──────────────┘     └─────────────────┘
```

**Pipeline Stages:**

1. **Source:** The application running in a Docker container on Railway writes JSON logs to `stdout`
2. **Collection:** Railway's built-in log infrastructure automatically captures all `stdout` and `stderr` streams from running services
3. **Transport:** A **Log Drain** is configured in the Railway project to forward all captured log streams to a third-party log management service
4. **Aggregation & Storage:** A service like **Datadog**, **Logtail (Better Stack)**, or **AWS CloudWatch** is used as the centralized destination for all logs

**Configuration Example (Railway Log Drain):**

Railway log drains can be configured via the dashboard or CLI:

```bash
# configure log drain to datadog
railway logs drain add \
  --name "datadog-prod" \
  --url "https://http-intake.logs.datadoghq.com/api/v2/logs?dd-api-key=${DATADOG_API_KEY}&ddsource=railway&service=crypto-trading-ai"

# configure log drain to logtail (better stack)
railway logs drain add \
  --name "logtail-prod" \
  --url "https://in.logtail.com?source_token=${LOGTAIL_SOURCE_TOKEN}"

# configure log drain to aws cloudwatch (via firehose)
railway logs drain add \
  --name "cloudwatch-prod" \
  --url "${AWS_FIREHOSE_ENDPOINT}"
```

### 7.4.3 Log Retention Policy

Logs are retained in two tiers to balance cost and accessibility:

**Hot Storage (Indexed & Searchable):**
- **Duration:** 30 days
- **Purpose:** Active debugging, real-time monitoring, and recent trend analysis
- **Platform:** Datadog, Logtail, CloudWatch Logs Insights
- **Cost:** Higher due to indexing and query performance

**Cold Storage (Archived):**
- **Duration:** 1 year (or as required by compliance)
- **Purpose:** Compliance, long-term auditing, and occasional historical analysis
- **Platform:** Logs are automatically archived from the hot storage platform to a low-cost object store like AWS S3 Glacier or Datadog Archives
- **Cost:** Very low, pay-per-GB storage
- **Rehydration:** Logs can be rehydrated from cold storage for investigation (incurs cost and time delay)

**Configuration Example (Datadog Archive):**

```yaml
# datadog archive configuration (via terraform or UI)
archive:
  name: "crypto-trading-ai-logs"
  destination:
    type: "s3"
    bucket: "crypto-trading-ai-logs-archive"
    path: "logs/production/"
  rehydration:
    enabled: true
    max_scan_size_gb: 100
```

### 7.4.4 Log-Based Alerting

Alerts are configured within the log aggregation platform based on log content. This decouples alerting logic from the application code and allows centralized alert management.

**Critical Alerts (`level: "error"` or `level: "fatal"`):**

- **Condition:** Any log entry with `json.level = "error"` or `json.level = "fatal"`
- **Threshold:** Immediate (single occurrence triggers alert)
- **Action:** Trigger a high-priority alert in PagerDuty
- **Integration:** See Section 7.6.1 for PagerDuty integration details
- **Example Query (Datadog):** `json.level:(error OR fatal) service:crypto-trading-ai`

**Warning Alerts (`level: "warn"`):**

- **Condition:** A spike in logs with `json.level = "warn"`
- **Threshold:** More than 10 warnings per minute for 5 consecutive minutes
- **Action:** Send a notification to the `#alerts-engineering` Slack channel
- **Integration:** See Section 7.6.2 for Slack integration details
- **Example Query (Datadog):** `json.level:warn service:crypto-trading-ai`

**Custom Business Alerts:**

Examples of business-specific alerts configured based on structured log fields:

| Alert Name | Condition | Threshold | Action |
|------------|-----------|-----------|--------|
| LLM Budget Exceeded | `json.llmCostUsd >= json.llmBudgetUsd` | Immediate | PagerDuty + Slack |
| Database Pool Exhausted | `json.activeConnections >= json.maxConnections` | Immediate | PagerDuty |
| High-Risk Contract Detected | `json.riskScore >= 80` | Immediate | Slack `#security` |
| Large Trade P&L | `abs(json.pnlUsd) >= 1000` | Immediate | Slack `#trading` |
| Agent Run Failed | `json.workflowStatus = "failed"` | Immediate | Slack `#engineering` |

**Alert Configuration Example (Datadog Monitor):**

```yaml
# datadog monitor for LLM budget alerts
monitor:
  name: "LLM Budget Exceeded"
  type: "log alert"
  query: "logs(\"json.llmCostUsd:>=json.llmBudgetUsd service:crypto-trading-ai\").index(\"main\").rollup(\"count\").last(\"5m\") > 0"
  message: |
    {{#is_alert}}
    🚨 LLM Budget Exceeded!
    Cost: ${{json.llmCostUsd}} / Budget: ${{json.llmBudgetUsd}}
    Service: {{service}}
    {{/is_alert}}
  tags:
    - "service:crypto-trading-ai"
    - "team:engineering"
  priority: "1" # P1 - critical
  notify:
    - "@pagerduty-crypto-trading-ai"
    - "@slack-alerts-engineering"
```

### 7.4.5 Developer Access & Querying

Developers can access the centralized logging platform for debugging and analysis.

**Access Control:**
- Granted via SSO through our identity provider (Google Workspace, Okta, etc.)
- Read-only access for all engineers
- Write access (alert configuration) limited to DevOps/SRE team

**Common Query Patterns:**

All queries assume structured JSON logs produced by Pino as defined in TSD-Services.md Section 4.3.

| Use Case | Query (Datadog Syntax) | Description |
|----------|------------------------|-------------|
| Trace a single request | `@requestId:"req-abc123"` | Find all logs for a specific HTTP request |
| Trace a workflow execution | `@workflowId:"wf-001" @executionId:"exec-456"` | Find all logs for a workflow execution |
| Find all errors for a service | `service:llm-service @level:error` | All error-level logs from LLM service |
| Find slow database queries | `@queryDurationMs:>1000` | Queries taking over 1 second |
| LLM cost analysis | `@provider:openai \| sum(@costUsd) by @model` | Total cost by model |
| Trade signals by status | `@signal_type:long @status:approved` | All approved long signals |

**Example Query Session (CloudWatch Logs Insights):**

```sql
-- find all failed workflow executions in the last hour
fields @timestamp, workflowId, executionId, error
| filter level = "error" and workflowStatus = "failed"
| sort @timestamp desc
| limit 100
```

**Example Query Session (Datadog):**

```
-- find correlation between LLM provider and error rate
service:llm-service status:error
| group by @provider
| count by @provider
| sort -count
```

### 7.4.6 Log Sampling (Cost Optimization)

For high-volume, low-value logs, consider sampling to reduce costs:

**Sampling Strategy:**
- **Debug logs:** Sample at 10% in production (keep 100% in development)
- **HTTP request logs:** Sample at 50% for successful requests (keep 100% for errors)
- **Workflow execution logs:** Keep 100% (critical for debugging)

**Implementation (Datadog):**

```yaml
# datadog agent configuration
logs_config:
  processing_rules:
    # sample debug logs at 10%
    - type: exclude_at_match
      name: exclude_debug_logs
      pattern: '"level":"debug"'
      sampling_rate: 0.9 # exclude 90%, keep 10%

    # sample successful HTTP requests at 50%
    - type: exclude_at_match
      name: exclude_successful_http
      pattern: '"method":"(GET|POST)" "status_code":"2\d\d"'
      sampling_rate: 0.5 # exclude 50%, keep 50%
```

---

## 7.5 Metrics Collection (Prometheus)

**File:** `src/shared/services/metrics/prometheus.ts`

**Purpose:** Collect application metrics for monitoring and alerting.

```typescript
import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import type { Request, Response } from 'express';

/**
 * Create Prometheus registry
 */
export const register = new Registry();

/**
 * Default labels for all metrics
 */
register.setDefaultLabels({
  app: 'crypto-trading-ai',
  environment: process.env.NODE_ENV || 'development',
});

// ============================================
// HTTP Metrics
// ============================================

/**
 * HTTP request counter
 */
export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * HTTP request duration histogram
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// ============================================
// LLM Metrics
// ============================================

/**
 * LLM API call counter
 */
export const llmCallCounter = new Counter({
  name: 'llm_calls_total',
  help: 'Total number of LLM API calls',
  labelNames: ['provider', 'model', 'workflow'],
  registers: [register],
});

/**
 * LLM token usage counter
 */
export const llmTokenCounter = new Counter({
  name: 'llm_tokens_total',
  help: 'Total number of tokens consumed',
  labelNames: ['provider', 'model', 'type'], // type: 'prompt' or 'completion'
  registers: [register],
});

/**
 * LLM cost gauge
 */
export const llmCostGauge = new Gauge({
  name: 'llm_cost_usd',
  help: 'Total LLM cost in USD',
  labelNames: ['provider'],
  registers: [register],
});

// ============================================
// Trading Metrics
// ============================================

/**
 * Trade signal counter
 */
export const tradeSignalCounter = new Counter({
  name: 'trade_signals_total',
  help: 'Total number of trade signals generated',
  labelNames: ['signal_type', 'status'], // long/short, approved/rejected/expired
  registers: [register],
});

/**
 * Open trades gauge
 */
export const openTradesGauge = new Gauge({
  name: 'open_trades_count',
  help: 'Number of currently open trades',
  labelNames: ['user_id'],
  registers: [register],
});

/**
 * Trade P&L histogram
 */
export const tradePnLHistogram = new Histogram({
  name: 'trade_pnl_usd',
  help: 'Trade profit and loss in USD',
  labelNames: ['user_id', 'token_symbol'],
  buckets: [-1000, -500, -100, 0, 100, 500, 1000, 5000],
  registers: [register],
});

// ============================================
// Database Metrics
// ============================================

/**
 * Database query duration
 */
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['query_type'], // select/insert/update/delete
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

/**
 * Database connection pool gauge
 */
export const dbConnectionPoolGauge = new Gauge({
  name: 'db_connection_pool_size',
  help: 'Database connection pool size',
  labelNames: ['state'], // idle/active
  registers: [register],
});

// ============================================
// Agent Run Metrics
// ============================================

/**
 * Agent run counter
 */
export const agentRunCounter = new Counter({
  name: 'agent_runs_total',
  help: 'Total number of agent runs',
  labelNames: ['workflow', 'status'], // running/completed/failed
  registers: [register],
});

/**
 * Agent run duration
 */
export const agentRunDuration = new Histogram({
  name: 'agent_run_duration_seconds',
  help: 'Agent run duration in seconds',
  labelNames: ['workflow'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [register],
});

// ============================================
// Metrics Endpoint
// ============================================

/**
 * Express endpoint to expose metrics
 */
export const metricsEndpoint = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.set('Content-Type', register.contentType);
  const metrics = await register.metrics();
  res.send(metrics);
};
```

### 7.5.1 Metrics Middleware

```typescript
import type { Request, Response, NextFunction } from 'express';
import {
  httpRequestCounter,
  httpRequestDuration,
} from '@shared/services/metrics/prometheus.js';

/**
 * Middleware to collect HTTP metrics
 */
export const metricsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const route = req.route?.path || req.path;

    httpRequestCounter.inc({
      method: req.method,
      route,
      status_code: res.statusCode,
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: res.statusCode,
      },
      duration
    );
  });

  next();
};
```

### 7.5.2 Expose Metrics Endpoint

```typescript
import express from 'express';
import { metricsEndpoint } from '@shared/services/metrics/prometheus.js';

const app = express();

// metrics endpoint (should be protected in production)
app.get('/metrics', metricsEndpoint);
```

---

## 7.6 Alerting Configuration

### 7.6.1 PagerDuty Integration

**File:** `src/shared/services/alerting/pagerduty.ts`

```typescript
import { logger } from '@shared/services/logging/logger.js';

/**
 * PagerDuty event severity
 */
type PagerDutySeverity = 'critical' | 'error' | 'warning' | 'info';

/**
 * Send alert to PagerDuty using native fetch (Node.js 22+)
 */
export async function sendPagerDutyAlert(
  summary: string,
  severity: PagerDutySeverity,
  details?: Record<string, unknown>
): Promise<void> {
  const integrationKey = process.env.PAGERDUTY_INTEGRATION_KEY;

  if (!integrationKey) {
    logger.warn('PagerDuty integration key not configured');
    return;
  }

  try {
    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routing_key: integrationKey,
        event_action: 'trigger',
        payload: {
          summary,
          severity,
          source: 'crypto-trading-ai',
          timestamp: new Date().toISOString(),
          custom_details: details,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`PagerDuty API error: ${response.status}`);
    }

    logger.info('PagerDuty alert sent', { summary, severity });
  } catch (error) {
    logger.error('Failed to send PagerDuty alert', { error });
  }
}
```

### 7.6.2 Slack Integration

**File:** `src/shared/services/alerting/slack.ts`

```typescript
import { logger } from '@shared/services/logging/logger.js';

/**
 * Slack Block Kit block type
 */
interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  [key: string]: unknown;
}

/**
 * Send alert to Slack channel using native fetch (Node.js 22+)
 */
export async function sendSlackAlert(
  message: string,
  channel?: string
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.warn('Slack webhook URL not configured');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message,
        channel: channel ?? '#alerts',
        username: 'Crypto Trading AI Bot',
        icon_emoji: ':robot_face:',
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    logger.info('Slack alert sent', { message });
  } catch (error) {
    logger.error('Failed to send Slack alert', { error });
  }
}

/**
 * Send formatted Slack message with blocks
 */
export async function sendSlackBlocks(blocks: SlackBlock[]): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    logger.warn('Slack webhook URL not configured');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks,
        username: 'Crypto Trading AI Bot',
        icon_emoji: ':robot_face:',
      }),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status}`);
    }

    logger.info('Slack blocks sent');
  } catch (error) {
    logger.error('Failed to send Slack blocks', { error });
  }
}
```

### 7.6.3 Alerting Rules

**File:** `src/shared/services/alerting/rules.ts`

```typescript
import { sendPagerDutyAlert } from './pagerduty.js';
import { sendSlackAlert } from './slack.js';
import { logger } from '@shared/services/logging/logger.js';

/**
 * Alert when LLM budget exceeds threshold
 */
export async function alertLLMBudgetExceeded(
  spendUsd: number,
  budgetUsd: number
): Promise<void> {
  const percentUsed = (spendUsd / budgetUsd) * 100;

  if (percentUsed >= 90) {
    await sendPagerDutyAlert(
      `LLM budget at ${percentUsed.toFixed(1)}% (${spendUsd}/${budgetUsd} USD)`,
      'critical',
      { spendUsd, budgetUsd, percentUsed }
    );
  } else if (percentUsed >= 80) {
    await sendSlackAlert(
      `⚠️ LLM budget at ${percentUsed.toFixed(1)}% (${spendUsd}/${budgetUsd} USD)`
    );
  }
}

/**
 * Alert when database connection pool is exhausted
 */
export async function alertDatabasePoolExhausted(
  activeConnections: number,
  maxConnections: number
): Promise<void> {
  await sendPagerDutyAlert(
    `Database connection pool exhausted (${activeConnections}/${maxConnections})`,
    'critical',
    { activeConnections, maxConnections }
  );
}

/**
 * Alert when agent run fails
 */
export async function alertAgentRunFailed(
  workflowIdentifier: string,
  errorMessage: string
): Promise<void> {
  await sendSlackAlert(
    `❌ Agent run failed: ${workflowIdentifier}\nError: ${errorMessage}`
  );
}

/**
 * Alert when high-risk contract detected
 */
export async function alertHighRiskContract(
  contractAddress: string,
  riskScore: number,
  findings: Record<string, unknown>
): Promise<void> {
  await sendSlackAlert(
    `🚨 High-risk contract detected!\nAddress: ${contractAddress}\nRisk Score: ${riskScore}/100\nFindings: ${JSON.stringify(
      findings
    )}`
  );
}

/**
 * Alert when trade P&L exceeds threshold
 */
export async function alertTradePnL(
  userId: number,
  tradeId: number,
  pnlUsd: number,
  threshold: number
): Promise<void> {
  if (Math.abs(pnlUsd) >= threshold) {
    const emoji = pnlUsd > 0 ? '📈' : '📉';
    await sendSlackAlert(
      `${emoji} Large P&L: $${pnlUsd.toFixed(2)} (Trade #${tradeId}, User #${userId})`
    );
  }
}
```

---

## 7.7 Health Check Endpoints

**File:** `src/api/health.ts`

**Purpose:** Provide health check endpoints for monitoring and load balancers.

```typescript
import type { Request, Response } from 'express';
import { Router } from 'express';
import type { Pool } from 'pg';
import Redis from 'ioredis';
import { logger } from '@shared/services/logging/logger.js';

/**
 * Health check response
 */
interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
    mcp: 'up' | 'down';
  };
  version: string;
}

/**
 * Create health check router
 */
export function createHealthRouter(db: Pool): Router {
  const router = Router();

  /**
   * GET /health
   * Basic health check (fast, for load balancers)
   */
  router.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /health/ready
   * Readiness check (checks dependencies)
   */
  router.get('/health/ready', async (req: Request, res: Response) => {
    const checks = await performHealthChecks(db);

    const allHealthy = Object.values(checks.services).every(
      status => status === 'up'
    );

    const status = allHealthy ? 'healthy' : 'degraded';
    const statusCode = allHealthy ? 200 : 503;

    res.status(statusCode).json({
      ...checks,
      status,
    });
  });

  /**
   * GET /health/live
   * Liveness check (application is running)
   */
  router.get('/health/live', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  return router;
}

/**
 * Perform health checks on all services
 */
async function performHealthChecks(db: Pool): Promise<HealthCheckResponse> {
  const services = {
    database: await checkDatabase(db),
    redis: await checkRedis(),
    mcp: await checkMCP(),
  };

  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services,
    version: process.env.npm_package_version || '1.0.0',
  };
}

/**
 * Check database connectivity
 */
async function checkDatabase(db: Pool): Promise<'up' | 'down'> {
  try {
    await db.query('SELECT 1');
    return 'up';
  } catch (error) {
    logger.error('Database health check failed', { error });
    return 'down';
  }
}

/**
 * Check Redis connectivity
 * Note: In production, inject the shared Redis client instance
 * to avoid creating new connections on every health check
 */
async function checkRedis(): Promise<'up' | 'down'> {
  try {
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });

    await redis.connect();
    await redis.ping();
    await redis.quit();
    return 'up';
  } catch (error) {
    logger.error('Redis health check failed', { error });
    return 'down';
  }
}

/**
 * Check MCP services
 */
async function checkMCP(): Promise<'up' | 'down'> {
  try {
    // check if MCP service is available by checking if MCPService is initialized
    // in production, this would check the actual MCP service instance
    // for now, return 'up' if MCP_ENABLED env var is set
    if (process.env.MCP_ENABLED !== 'true') {
      return 'up'; // mcp disabled is not a failure state
    }

    // TODO: implement actual MCP service health check via service instance
    // const mcpService = getMCPServiceInstance();
    // const availableServers = mcpService.getAvailableServers();
    // return availableServers.size > 0 ? 'up' : 'down';

    return 'up';
  } catch (error) {
    logger.error('MCP health check failed', { error });
    return 'down';
  }
}
```

---

## Installation Dependencies

**Note:** Logging dependencies (Pino) are defined in [TSD-Services.md](./04-TSD-Services.md#installation-dependencies). This section covers only DevOps-specific dependencies.

```bash
npm install --save \
  prom-client \
  ioredis

npm install --save-dev \
  @types/prom-client
```

> **Note:** `ioredis` v5+ includes built-in TypeScript definitions; no separate `@types/ioredis` package is needed. Native `fetch` (Node.js 22+) replaces `axios` for HTTP requests.

---

## Environment Variables Required

```bash
# Logging
LOG_LEVEL=info
SENTRY_DSN=<sentry-dsn>

# Monitoring
PROMETHEUS_PORT=9090

# Alerting
PAGERDUTY_INTEGRATION_KEY=<pagerduty-key>
SLACK_WEBHOOK_URL=<slack-webhook-url>
```

---

## Next Steps

1. Set up Prometheus server to scrape `/metrics` endpoint
2. Configure Grafana dashboards for visualization
3. Set up PagerDuty escalation policies
4. Configure Slack channels for alerts
5. Implement blue-green deployment strategy
6. Set up automated database backups

---

**Related Modules:**
- [TSD-Database.md](./04-TSD-Database.md) - Database for migrations
- [TSD-Configuration.md](./04-TSD-Configuration.md) - Environment variables
- [TSD-Services.md](./04-TSD-Services.md) - Services being monitored
- [TSD-API.md](./04-TSD-API.md) - API endpoints being monitored

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-20 | Initial | Initial CI/CD pipeline and monitoring specification |
| 2.0 | 2025-01-21 | - | Added log management section, alerting configuration |
| 2.1 | 2026-01-15 | Multi-model Review | Major modernization: updated Node.js 18→22 LTS throughout (CI, Docker), PostgreSQL 15→16, GitHub Actions @v3→@v4, pinned Snyk action, replaced axios with native fetch, migrated all TypeScript to ESM syntax (.js extensions), fixed Railway migration race condition (releaseCommand), added PR preview deployment job, replaced X-XSS-Protection with CSP header, updated LLM budget ($400/month, $15/day), removed redundant @types/ioredis, added explicit document references to BRD v2.3/FRD v4.0/ADD v2.1 |
