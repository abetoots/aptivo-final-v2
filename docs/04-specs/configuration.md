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

# NATS JetStream
NATS_URL=nats://host:4222
NATS_USER=service-user
NATS_PASS=service-pass
NATS_TLS=true

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

    NATS_URL: z.string().url(),
    NATS_USER: z.string().min(1),
    NATS_PASS: z.string().min(1),

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
    'NATS_URL',
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
| API keys | 180 days | Automated |
| JWT signing keys | 365 days | Manual with overlap |
| TLS certificates | Before expiry | Automated (cert-manager) |

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
// app/api/health/live/route.ts
export async function GET() {
  // basic liveness - is the process running?
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}

// app/api/health/ready/route.ts
export async function GET() {
  const checks: HealthCheck[] = [
    { name: 'database', check: checkDatabase },
    { name: 'redis', check: checkRedis },
    { name: 'nats', check: checkNats },
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

const checkNats = async (): Promise<void> => {
  if (!natsConnection.isConnected()) {
    throw new Error('NATS not connected');
  }
};
```

### 4.3 Kubernetes Probes

```yaml
# deployment.yaml
spec:
  containers:
    - name: app
      livenessProbe:
        httpGet:
          path: /api/health/live
          port: 3000
        initialDelaySeconds: 10
        periodSeconds: 10
        timeoutSeconds: 5
        failureThreshold: 3

      readinessProbe:
        httpGet:
          path: /api/health/ready
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 5
        timeoutSeconds: 3
        failureThreshold: 3

      startupProbe:
        httpGet:
          path: /api/health/live
          port: 3000
        initialDelaySeconds: 0
        periodSeconds: 5
        timeoutSeconds: 3
        failureThreshold: 30  # 30 * 5s = 150s max startup
```

---

## 5. Feature Flags

### 5.1 Flag Definition

```typescript
interface FeatureFlag {
  key: string;
  defaultValue: boolean;
  description: string;
  rolloutPercentage?: number;  // 0-100
  enabledFor?: string[];       // user IDs or roles
}

const FEATURE_FLAGS: FeatureFlag[] = [
  {
    key: 'workflow_v2',
    defaultValue: false,
    description: 'Enable new workflow engine',
    rolloutPercentage: 10,
  },
  {
    key: 'advanced_search',
    defaultValue: true,
    description: 'Enable advanced search filters',
  },
  {
    key: 'beta_features',
    defaultValue: false,
    description: 'Enable beta features',
    enabledFor: ['role:admin', 'role:beta_tester'],
  },
];
```

### 5.2 Flag Evaluation

```typescript
interface FeatureFlagService {
  isEnabled(key: string, context?: FlagContext): Promise<boolean>;
  getAllFlags(context?: FlagContext): Promise<Record<string, boolean>>;
}

interface FlagContext {
  userId?: string;
  roles?: string[];
  attributes?: Record<string, unknown>;
}

const isEnabled = async (key: string, context?: FlagContext): Promise<boolean> => {
  const flag = FEATURE_FLAGS.find((f) => f.key === key);
  if (!flag) return false;

  // check environment override
  const envOverride = process.env[`FEATURE_${key.toUpperCase()}`];
  if (envOverride !== undefined) {
    return envOverride === 'true';
  }

  // check user/role targeting
  if (flag.enabledFor && context) {
    const userMatch = flag.enabledFor.includes(`user:${context.userId}`);
    const roleMatch = context.roles?.some((r) => flag.enabledFor!.includes(`role:${r}`));
    if (userMatch || roleMatch) return true;
  }

  // check rollout percentage
  if (flag.rolloutPercentage !== undefined && context?.userId) {
    const hash = hashUserId(context.userId, key);
    return hash < flag.rolloutPercentage;
  }

  return flag.defaultValue;
};
```

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

### 7.2 DNS-based Discovery (Kubernetes)

```yaml
# services communicate via Kubernetes DNS
# service-name.namespace.svc.cluster.local
CANDIDATE_SERVICE_URL=http://candidate-service.aptivo.svc.cluster.local:3000
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
