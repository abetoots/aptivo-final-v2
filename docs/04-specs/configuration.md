---
id: TSD-CORE-CONFIG
title: Configuration Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
parent: ../03-architecture/platform-core-add.md
---
# Configuration Specification

---

## 1. Environment Variables

### 1.1 Required Variables

All services require these environment variables:

```bash
# Application
NODE_ENV=production|staging|development
SERVICE_NAME=candidate-service
SERVICE_VERSION=1.0.0
LOG_LEVEL=debug|info|warn|error

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20
DATABASE_SSL=true

# Redis
REDIS_URL=redis://host:6379
REDIS_TLS=true

# Object Storage (S3-compatible)
S3_ENDPOINT=https://storage.aptivo.com
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=access-key
S3_SECRET_ACCESS_KEY=secret-key

# Authentication
AUTH_ISSUER=https://auth.aptivo.com/realms/aptivo
AUTH_CLIENT_ID=aptivo-app
AUTH_CLIENT_SECRET=client-secret
AUTH_SECRET=nextauth-secret  # 32+ chars

# LLM Providers (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIza...

# Workflow Engine
INNGEST_SIGNING_KEY=signkey-...

# Notifications
NOVU_API_KEY=...

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector:4318
OTEL_SERVICE_NAME=${SERVICE_NAME}
SENTRY_DSN=https://key@sentry.io/project
```

### 1.2 Optional Variables

```bash
# Feature Flags
FEATURE_WORKFLOW_V2=true|false
FEATURE_ADVANCED_SEARCH=true|false

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=100
RATE_LIMIT_BURST=20

# Caching
CACHE_TTL_DEFAULT=300
CACHE_TTL_USER_SESSION=900

# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=smtp-user
SMTP_PASS=smtp-pass
SMTP_FROM=noreply@aptivo.com

# External Services
CALENDAR_SERVICE_URL=https://calendar-api.aptivo.com
PDF_SERVICE_URL=https://pdf-api.aptivo.com
```

---

## 2. Environment Validation

### 2.1 Zod Schema Validation

Use `@t3-oss/env-nextjs` or custom Zod schema for build-time validation:

```typescript
// lib/env.ts
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'staging', 'production']),
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),

    REDIS_URL: z.string().url(),

    AUTH_ISSUER: z.string().url(),
    AUTH_CLIENT_ID: z.string().min(1),
    AUTH_CLIENT_SECRET: z.string().min(1),
    AUTH_SECRET: z.string().min(32),

    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    SENTRY_DSN: z.string().url().optional(),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_API_URL: z.string().url(),
  },

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    // ... all variables
  },

  skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
```

### 2.2 Startup Validation

```typescript
// validate on application startup
import { env } from '@/lib/env';

const validateEnvironment = () => {
  const requiredVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'AUTH_ISSUER',
  ];

  const missing = requiredVars.filter(
    (key) => !process.env[key]
  );

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // validate formats
  try {
    env; // triggers validation
  } catch (error) {
    console.error('Environment validation failed:', error);
    process.exit(1);
  }

  console.log('Environment validation passed');
};
```

---

## 3. Secrets Management

### 3.1 Secret Categories

| Category | Examples | Storage |
|----------|----------|---------|
| **Application Secrets** | AUTH_SECRET, JWT signing keys | Environment variables / Vault |
| **Service Credentials** | Database passwords, API keys | Environment variables / Vault |
| **Encryption Keys** | Data encryption keys | Hardware Security Module (HSM) |
| **Certificates** | TLS certs, mTLS certs | Certificate manager |

### 3.2 Secret Rotation

| Secret Type | Rotation Frequency | Automation |
|-------------|-------------------|------------|
| Database passwords | 90 days | Automated |
| API keys (S3, LLM providers) | 90 days | Manual via provider dashboard |
| Novu API Key | 180 days | Manual via Novu dashboard |
| Webhook HMAC secrets | 180 days | Manual (dual-key during transition) |
| HITL_SECRET (HS256 signing) | 180 days | Manual with dual-key overlap |
| INNGEST_SIGNING_KEY | 180 days | Manual via Inngest dashboard |
| INNGEST_EVENT_KEY | 180 days | Manual via Inngest dashboard |
| JWT signing keys (Supabase) | 90 days | Supabase-managed |
| TLS certificates | Before expiry | Automated (DO managed) |

> **SSOT**: Canonical rotation cadences are defined in ADD §8.8. This table mirrors those values.

### 3.3 Secret Injection Pattern

```typescript
// prefer environment injection over hardcoding
// BAD
const dbPassword = 'hardcoded-password';

// GOOD
const dbPassword = env.DATABASE_PASSWORD;

// for Kubernetes, use external-secrets or sealed-secrets
// external-secrets.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: aptivo-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: aptivo-secrets
  data:
    - secretKey: DATABASE_PASSWORD
      remoteRef:
        key: aptivo/production/database
        property: password
```

---

## 4. Health Checks

### 4.1 Health Endpoints

All services must expose:

```typescript
// app/health/live/route.ts (matches Runbook §5.3, Railway config)
export async function GET() {
  // basic liveness - is the process running?
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}

// app/health/ready/route.ts (matches Runbook §5.3, Railway config)
export async function GET() {
  const checks: HealthCheck[] = [
    { name: 'database', check: checkDatabase },
    { name: 'redis', check: checkRedis },
  ];

  const results = await Promise.all(
    checks.map(async ({ name, check }) => ({
      name,
      status: await check().then(() => 'healthy').catch(() => 'unhealthy'),
    }))
  );

  const allHealthy = results.every((r) => r.status === 'healthy');

  return Response.json(
    {
      status: allHealthy ? 'ready' : 'not_ready',
      checks: results,
      timestamp: new Date().toISOString(),
    },
    { status: allHealthy ? 200 : 503 }
  );
}
```

### 4.2 Dependency Checks

```typescript
const checkDatabase = async (): Promise<void> => {
  const client = await db.connect();
  await client.query('SELECT 1');
  client.release();
};

const checkRedis = async (): Promise<void> => {
  await redis.ping();
};

```

### 4.3 Railway Health Checks

> **Note**: Production uses Railway (not Kubernetes). See Runbook §3.3 for the full railway.json config.

```json
// railway.json (excerpt)
{
  "deploy": {
    "healthcheckPath": "/health/live",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

Health check paths are standardized across all documents:

| Endpoint | Path | Purpose |
|----------|------|---------|
| Liveness | `/health/live` | Is the process running? |
| Readiness | `/health/ready` | Can the service accept traffic? |
| Startup | `/health/startup` | Has initialization completed? |

---

## 5. Feature Flags

> **Phase 1 Reality**: Feature flags are compile-time constants defined in code, with optional per-deployment overrides via environment variables. There is no runtime feature flag service in Phase 1. See ADD S3.5 for architecture decisions and Runbook S2.4 for operational procedures.

### 5.1 Phase 1: Compile-Time Feature Constants

In Phase 1, feature flags are simple constants with environment variable overrides:

```typescript
// lib/features.ts

/**
 * Feature flags as compile-time constants.
 * Override per deployment via environment variables (e.g., FEATURE_WORKFLOW_EXPORT=true).
 * No runtime feature flag service in Phase 1.
 */
interface FeatureFlag {
  key: string;
  defaultValue: boolean;
  description: string;
}

const FEATURE_FLAGS: FeatureFlag[] = [
  {
    key: 'workflow_export',
    defaultValue: false,
    description: 'Enable workflow definition export/import',
  },
  {
    key: 'advanced_search',
    defaultValue: true,
    description: 'Enable advanced search filters',
  },
  {
    key: 'beta_features',
    defaultValue: false,
    description: 'Enable beta features for testing',
  },
];
```

### 5.2 Flag Evaluation (Phase 1)

```typescript
/**
 * Evaluates feature flags using compile-time defaults + environment variable overrides.
 *
 * Override a flag per deployment by setting:
 *   FEATURE_<FLAG_KEY_UPPER>=true|false
 *
 * Example: FEATURE_WORKFLOW_EXPORT=true enables the workflow_export flag
 * for that specific deployment without code changes.
 */
const isEnabled = (key: string): boolean => {
  const flag = FEATURE_FLAGS.find((f) => f.key === key);
  if (!flag) return false;

  // check environment variable override (e.g., FEATURE_WORKFLOW_EXPORT=true)
  const envOverride = process.env[`FEATURE_${key.toUpperCase()}`];
  if (envOverride !== undefined) {
    return envOverride === 'true';
  }

  return flag.defaultValue;
};

// Usage in application code:
if (isEnabled('workflow_export')) {
  // register export route
}
```

### 5.3 Phase 2: Runtime Feature Flag Service

**Phase 2+**: Consider LaunchDarkly, Unleash, or similar for runtime percentage rollouts without redeployment. This becomes necessary when:
- Multiple domain apps need independent rollout control
- A/B testing or percentage-based rollouts are required
- Non-developer stakeholders need to toggle features

The Phase 1 `isEnabled()` interface is designed for forward compatibility -- the function signature remains the same, but the implementation switches from environment variable lookup to a remote flag service call.

---

## 6. Configuration Profiles

### 6.1 Environment Profiles

| Profile | Use Case | Configuration |
|---------|----------|---------------|
| `development` | Local development | Debug logging, mock services |
| `staging` | Pre-production testing | Production-like, test data |
| `production` | Live environment | Optimized, real data |

### 6.2 Profile Configuration

```typescript
// config/profiles.ts
interface Profile {
  logging: {
    level: string;
    format: 'json' | 'pretty';
  };
  cache: {
    enabled: boolean;
    ttlMultiplier: number;
  };
  features: {
    debugMode: boolean;
    mockExternalServices: boolean;
  };
}

const profiles: Record<string, Profile> = {
  development: {
    logging: { level: 'debug', format: 'pretty' },
    cache: { enabled: false, ttlMultiplier: 0.1 },
    features: { debugMode: true, mockExternalServices: true },
  },
  staging: {
    logging: { level: 'info', format: 'json' },
    cache: { enabled: true, ttlMultiplier: 0.5 },
    features: { debugMode: true, mockExternalServices: false },
  },
  production: {
    logging: { level: 'info', format: 'json' },
    cache: { enabled: true, ttlMultiplier: 1 },
    features: { debugMode: false, mockExternalServices: false },
  },
};

export const config = profiles[env.NODE_ENV];
```

---

## 7. Service Discovery

### 7.1 Internal Service URLs

```typescript
// config/services.ts
export const serviceUrls = {
  candidateService: env.CANDIDATE_SERVICE_URL ?? 'http://candidate-service:3000',
  workflowService: env.WORKFLOW_SERVICE_URL ?? 'http://workflow-service:3000',
  emailService: env.EMAIL_SERVICE_URL ?? 'http://email-service:3000',
  fileService: env.FILE_SERVICE_URL ?? 'http://file-service:3000',
};
```

### 7.2 Railway Service Discovery

```yaml
# Railway injects internal URLs as environment variables
# Services within the same Railway project can communicate via private networking
# See Runbook §3.3 for full railway.json configuration
CANDIDATE_SERVICE_URL=${RAILWAY_PRIVATE_DOMAIN}:3000
```

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Environment configuration | [platform-core-frd.md](../../02-requirements/platform-core-frd.md) | Section 10 (Configuration Service) |
| Secret management | [platform-core-add.md](../../03-architecture/platform-core-add.md) | Section 7 (Security Architecture) |
| Feature flags | [platform-core-frd.md](../../02-requirements/platform-core-frd.md) | Section 10.3 |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Environment variable patterns | [05a-Coding-Guidelines.md](../05-guidelines/05a-Coding-Guidelines.md) | Environment Configuration |
| Health check implementation | [01-runbook.md](../06-operations/01-runbook.md) | Health Monitoring |
