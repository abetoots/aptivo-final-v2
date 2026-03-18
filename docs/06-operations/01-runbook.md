---
id: RUNBOOK-DEPLOYMENT
title: 6.a Deployment & Operations
status: Draft
version: 2.4.0
owner: "@owner"
last_updated: "2026-03-04"
parent: ../03-architecture/platform-core-add.md
---

# 6.a Deployment & Operations

Created by: Abe Caymo
Created time: February 18, 2025 5:24 PM
Category: Engineering, Strategy doc
Last edited by: Document Review Panel
Last updated time: January 15, 2026

# **Deployment & Operations Guide**

_Aptivo Agentic Platform_

_v2.3.0 – [March 17, 2026]_

_Aligned with: TSD v3.0.0, ADD v2.0.0, Coding Guidelines v3.0.0, Testing Strategies v2.0.0_

---

## **1. Introduction**

### 1.1 Purpose

This document is the central operational runbook for Aptivo. It defines the standard operating procedures (SOPs) for deployment, monitoring, maintenance, and incident response.

### 1.2 Scope

This guide covers the operational lifecycle of all modules and shared services. Adherence to these procedures is mandatory for maintaining system stability and security.

### 1.3 Audience

- DevOps Engineers
- System Administrators
- Operations Teams
- On-Call Support Staff
- Site Reliability Engineers (SRE)

### 1.4 Related Documents

- **TSD v3.0.0** - Technical specifications, health checks, feature flags
- **ADD v2.0.0** - Architecture, HA/DR requirements (RTO/RPO targets)
- **Coding Guidelines v3.0.0** - OpenTelemetry, RFC 7807, Result types
- **Testing Strategies v2.0.0** - CI/CD pipeline, security scans, performance targets
- **[05d-Observability.md](../05-guidelines/05d-Observability.md)** - Detailed observability architecture

---

## **2. Deployment Process**

### 2.1 Deployment Strategy

The system uses a container-based deployment model with progressive delivery:

| Component            | Strategy                                          | Rollback Time |
| -------------------- | ------------------------------------------------- | ------------- |
| Application Services | Rolling deploy with instant rollback (Railway) | < 5 minutes   |
| Database Migrations  | Forward-only with rollback scripts                | < 15 minutes  |
| Feature Releases     | Compile-time feature flags with env var escape hatches | Per-deploy    |
| Gradual Rollout      | Deployment-gated rollout via environment promotion | Per-deploy    |

> **Note**: Phase 1 feature flags are compile-time constants toggled via environment variables and deployment-gated rollouts — NOT a runtime feature flag service. See Section 2.4 for details. Percentage-based canary traffic splitting requires Kubernetes + service mesh (not available on Railway).

### 2.2 Environments (Trunk-Based Development)

> **Strategy**: Build Once, Deploy Many. A single SHA-tagged artifact progresses through environments.

| Environment     | Source     | Trigger             | Purpose                                        |
| --------------- | ---------- | ------------------- | ---------------------------------------------- |
| **Development** | any branch | Local Docker        | Local developer environments                   |
| **Preview**     | any branch | Manual dispatch     | Stakeholder demos from any branch              |
| **Staging**     | main SHA   | Manual dispatch     | Production-like testing of validated artifacts |
| **Production**  | main tag   | Version tag push    | Live environment via release-please            |

**Artifact Flow**:
```
PR → pr-validation.yml → Merge → build.yml → SHA-tagged image
                                      ↓
                              Manual: Deploy Staging
                                      ↓
                              QA Validation
                                      ↓
                              release-please PR → Merge → Production
```

### 2.3 Standard Deployment Checklist

#### Pre-Deployment Gates

- [ ] All CI/CD pipeline checks passed:
  - [ ] Lint & format (ESLint flat config, Prettier)
  - [ ] Type check (TypeScript strict mode)
  - [ ] Unit tests with tiered coverage (Domain 100%, Application 80%, Interface 60%)
  - [ ] Integration tests passed
  - [ ] Security scans passed:
    - [ ] SAST (eslint-plugin-security) - Implementing
    - [ ] SCA (pnpm audit --audit-level=critical)
    - [ ] Secrets scanning (gitleaks)
    - [ ] Container image scanning (Trivy)
  - [ ] SBOM generated (BuildKit attestation)
- [ ] Performance tests confirm P95 response time < 500ms
- [ ] E2E test suite passed against staging (> 98% pass rate)
- [ ] QA sign-off obtained
- [ ] Change request approved (see 05d-Change-Risk-Management.md)

#### Deployment Steps

- [ ] Create version tag in Git (e.g., `v1.2.0`)
- [ ] Verify feature flags are configured for gradual rollout
- [ ] Trigger "Deploy to Production" workflow in GitHub Actions
- [ ] Monitor deployment progress via:
  - [ ] GitHub Actions logs
  - [ ] Railway dashboard
  - [ ] OpenTelemetry traces for deployment spans
- [ ] Verify health check endpoints return healthy status:
  - [ ] `/health/live` - Liveness probe
  - [ ] `/health/ready` - Readiness probe
- [ ] Perform post-deployment smoke tests on critical endpoints
- [ ] Monitor error rates and latency for 15 minutes post-deploy
- [ ] Announce deployment completion in #ops-deployments channel

#### Post-Deployment Validation

- [ ] Confirm all containers are running (Railway dashboard)
- [ ] Verify no spike in error rates (Sentry, OpenTelemetry)
- [ ] Check P95 response times remain < 500ms
- [ ] Validate feature flags are functioning correctly

### 2.4 Feature Flag Management

> **Phase 1 Reality**: Feature flags are **compile-time constants with environment variable escape hatches** — NOT a runtime feature flag service. "Feature flag management" means toggling environment variables and performing deployment-gated rollouts. There is no percentage-based traffic splitting, no runtime toggle UI, and no gradual rollout within a single deployment.
>
> A dedicated feature flag service (LaunchDarkly, Unleash, etc.) is a Phase 2+ consideration if runtime percentage rollouts are needed without redeployment.
>
> See [`docs/04-specs/configuration.md` §5](../04-specs/configuration.md#5-feature-flags) for implementation details.

#### Flag Lifecycle

```
Defined in code → Env var override (optional) → Deploy to staging → Validate → Deploy to production → Remove flag (cleanup)
```

#### Rollout Strategy (Deployment-Gated)

| Phase       | Mechanism                                 | Duration | Success Criteria            |
| ----------- | ----------------------------------------- | -------- | --------------------------- |
| Development | Flag enabled in `.env` locally            | -        | Unit/integration tests pass |
| Staging     | Flag enabled via env var in staging deploy | 1–2 days | QA sign-off                 |
| Production  | Flag enabled via env var in production deploy | -     | Error rate < 0.1%, P95 < 500ms |
| Cleanup     | Remove flag constant and conditional code | 1 sprint | Code simplified             |

#### Flag Operations

```bash
# enable a feature flag via environment variable (requires redeployment)
railway variables set FEATURE_USER_DASHBOARD_V2=true
railway up
# or update via Railway dashboard → Variables

# disable a feature flag (requires redeployment)
# set FEATURE_USER_DASHBOARD_V2=false and redeploy

# emergency disable: set env var to false and trigger immediate redeploy
railway variables set FEATURE_USER_DASHBOARD_V2=false && railway up
```

> **Important**: Because flags require redeployment to change, "instant rollback" via flag toggle is not available in Phase 1. Emergency rollback uses application rollback (§9.1) or env var change + redeploy.

---

## **3. Infrastructure Architecture**

> **Multi-Model Consensus (2026-02-03)**: PaaS selected over Kubernetes. K8s operational overhead is not justified for a 3-developer, self-funded team. See ADD Section 10.3 for rationale and upgrade triggers.
> **Vendor Migration (2026-03-18)**: Migrated from DigitalOcean App Platform to Railway via multi-model consensus after DO account lock.

### 3.1 Production Architecture (Railway)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Railway                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Load Balancer (managed)                 │  │
│  │                    TLS termination, routing                │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│  ┌─────────────────────────▼─────────────────────────────────┐  │
│  │                    Web Service                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │  │
│  │  │ Container 1 │  │ Container 2 │  │ Container N │        │  │
│  │  │ (auto-scale)│  │ (auto-scale)│  │ (auto-scale)│        │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘        │  │
│  │  Health checks: /health/live, /health/ready               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  PostgreSQL   │   │    Redis      │   │   Railway     │
│  (Railway)    │   │  (Upstash)    │   │   Volumes     │
│               │   │               │   │ (S3-compat)   │
└───────────────┘   └───────────────┘   └───────────────┘
```

### 3.2 Resource Specifications

| Service            | Size          | Scaling           | Notes                                 |
| ------------------ | ------------- | ----------------- | ------------------------------------- |
| **Web Service**    | Usage-based   | 1-3 containers    | CPU/memory auto-scale                 |
| **PostgreSQL**     | Usage-based   | Vertical          | Railway Managed PostgreSQL             |
| **Redis**          | Usage-based   | Serverless        | Upstash (external)                     |
| **Volumes**        | Usage-based   | N/A               | S3-compatible object storage          |
| **ClamAV**         | ~$6/mo        | Single container  | Malware scanning (see ADD §9.8.2); runs as Railway worker service or external Docker service |

**Cost Estimate**: ~$55-110/mo for staging + production (vs. $200-400/mo for managed K8s)

#### 3.2.1 Cost Controls and Budget Caps

| Resource | Monthly Budget | Alert Threshold | Exceed Behavior | Cost Attribution |
|----------|---------------|-----------------|-----------------|------------------|
| **Web Service (auto-scale)** | $50/mo | Railway usage alert at $40 (80%) | Max 3 containers (hard cap in railway.json); alert on-call if sustained at max | Platform — shared infrastructure |
| **PostgreSQL** | $25/mo | Railway usage alert at $20 | Vertical scaling requires manual approval | Platform — shared infrastructure |
| **Redis** | $20/mo | Upstash dashboard alert at $15 | Serverless; scales with usage | Platform — shared infrastructure |
| **Volumes** | $15/mo | Railway usage alert at $12 | Storage growth alert; review file retention policies | Platform — shared infrastructure |
| **ClamAV** | $10/mo | N/A (fixed cost) | Fixed container | Platform — security |
| **LLM API** | $500/mo (all domains) | Application-level at 90% (ADD §7.2) | Hard cap per domain (daily $50, monthly $500) | Per-domain attribution (ADD §7.2) |
| **Novu** | Free tier (10K events/mo) | Application-level at 8K events | No fallback provider (accepted risk — ADD §10.4.4); alert ops; manual intervention | Platform — notifications |
| **Inngest** | Free tier (Phase 1) | Monitor function run count monthly | Review pricing tiers; alert if approaching limit | Platform — workflows |
| **Supabase Auth** | Free tier (50K MAU) | Monitor MAU monthly | N/A for Phase 1 (< 100 users) | Platform — identity |
| **Sentry** | Free tier | Error event volume monitoring | Rate-limit noisy errors; alert on quota usage | Platform — observability |
| **Grafana Cloud** | Free tier | Telemetry volume monitoring | Reduce trace sampling rate; alert on quota usage | Platform — observability |

**Spend Observability**: Railway usage alerts configured for all managed resources. Monthly cost review by platform team. LLM spend visible via application dashboard (ADD §7.2).

### 3.3 Railway Configuration

```json
// railway.json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "pnpm start",
    "healthcheckPath": "/health/live",
    "restartPolicyType": "ON_FAILURE"
  }
}
```

Environment variables are managed via Railway dashboard or `railway variables set`. Database and Redis are provisioned as separate Railway services / Upstash instances.

### 3.4 K8s Upgrade Triggers

**Current Decision**: Railway (PaaS)

**When to Reconsider Kubernetes** (document these criteria explicitly):

| Trigger | Threshold | Rationale |
|---------|-----------|-----------|
| Custom networking/sidecars required | Service mesh, custom ingress | PaaS cannot accommodate |
| Fine-grained autoscaling | Beyond CPU/memory metrics | K8s HPA with custom metrics |
| Multi-tenant isolation | Compliance mandates | K8s namespace isolation |
| Cost inflection | PaaS > K8s + ops overhead | ~$500/mo+ with dedicated ops |
| Team growth | 5+ engineers with K8s experience | Can absorb operational burden |

**Not Triggers**:
- "We might need it someday" - YAGNI
- "Other companies use K8s" - Different scale/team
- "It looks more professional" - Premature optimization

---

## **4. Configuration Management**

### 4.1 Environment Validation

All services must use `@t3-oss/env-nextjs` for type-safe environment validation. Services fail fast on startup if configuration is invalid.

```typescript
// lib/env.ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "staging", "production"]),
    DATABASE_URL: z.string().url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(20),
    REDIS_URL: z.string().url(),
    AUTH_ISSUER: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url(),
    SENTRY_DSN: z.string().url(),
    // Feature flags are compile-time constants with env var escape hatches (§2.4)
    FEATURE_USER_DASHBOARD_V2: z.coerce.boolean().default(false),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().url(),
  },
  // fail build if validation fails
  skipValidation: false,
  // throw on missing vars in production
  emptyStringAsUndefined: true,
});
```

### 4.2 Configuration Hierarchy

Priority order (highest to lowest):

1. Railway encrypted environment variables (for sensitive values)
2. Railway environment variables (for non-sensitive config)
3. Environment variables in container spec
4. `.env` file (development only)

### 4.3 Secrets Management

All secrets managed via Railway encrypted environment variables:

| Secret Type          | Storage                            | Rotation              |
| -------------------- | ---------------------------------- | --------------------- |
| Database credentials | Railway (encrypted)                | 90 days               |
| API keys (S3, LLM providers) | Railway (encrypted)        | 90 days               |
| Novu API Key         | Railway (encrypted)                | 180 days              |
| Webhook HMAC secrets | PostgreSQL (encrypted column)      | 180 days              |
| HITL_SIGNING_SECRET          | Railway (encrypted)        | 180 days              |
| INNGEST_SIGNING_KEY  | Railway (encrypted)                | 180 days              |
| INNGEST_EVENT_KEY    | Railway (encrypted)                | 180 days              |
| JWT signing keys     | Supabase-managed                   | 90 days               |
| TLS certificates     | Railway (auto-renewal)             | Automatic             |

> **SSOT**: Canonical rotation cadences are defined in ADD §8.8 (Secret Rotation Cadences). This table mirrors those values. On conflict, ADD §8.8 takes precedence.

```bash
# example: update secret via railway CLI
railway variables set DATABASE_URL=<new-value>

# or via Railway dashboard → Variables
# secrets are never stored in git
```

---

## **5. Observability & Monitoring**

### 5.1 OpenTelemetry Architecture

All services emit telemetry via OpenTelemetry SDK with direct OTLP export (Railway compatible).

```
┌─────────────┐                         ┌─────────────┐
│ Application │────── OTLP/HTTP ───────▶│   Backend   │
│   (SDK)     │                         │  (Grafana   │
│             │                         │   Cloud /   │
│ OTel SDK    │                         │  Honeycomb) │
└─────────────┘                         └─────────────┘
      │
      │  Traces, Metrics, Logs (direct export)
      └────────────────────────────────────────
```

> **Note**: Railway does not support sidecars. Services export directly to observability backend via OTLP/HTTP.

### 5.2 Key Metrics & Alerts

| Metric                       | Tool            | Threshold          | Alert             | Recipient       |
| ---------------------------- | --------------- | ------------------ | ----------------- | --------------- |
| **API P95 Response Time**    | Prometheus/OTel | > 500ms for 5 min  | PagerDuty P2      | On-Call SRE     |
| **HTTP 5xx Error Rate**      | Prometheus/OTel | > 1% over 5 min    | PagerDuty P1      | On-Call SRE     |
| **HTTP 4xx Error Rate**      | Prometheus/OTel | > 5% over 10 min   | Slack #ops-alerts | DevOps Team     |
| **CPU Utilization**          | Prometheus      | > 80% for 10 min   | Slack #ops-alerts | DevOps Team     |
| **Memory Utilization**       | Prometheus      | > 85% for 10 min   | PagerDuty P2      | On-Call SRE     |
| **Database Connections**     | Prometheus      | > 80% of max       | PagerDuty P2      | On-Call SRE     |
| **Database Replication Lag** | Prometheus      | > 30 seconds       | PagerDuty P1      | On-Call SRE (Phase 2+: HA-tier only) |
| **Health Check Failures**    | Railway         | Container unhealthy 3x | PagerDuty P1  | On-Call SRE     |
| **Application Errors**       | Sentry/OTel     | New error type     | Slack #ops-errors | On-Call Support |
| **Feature Flag Misconfig**   | Startup logs    | Env var parse failure | Slack #ops-alerts | DevOps Team     |

### 5.3 Health Check Endpoints

All services expose standardized health endpoints:

| Endpoint          | Purpose                                  | Response          |
| ----------------- | ---------------------------------------- | ----------------- |
| `/health/live`    | Liveness probe (is process running?)     | `200 OK` or `503` |
| `/health/ready`   | Readiness probe (can accept traffic?)    | `200 OK` or `503` |
| `/health/startup` | Startup probe (initialization complete?) | `200 OK` or `503` |

```typescript
// health check response format
interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    database: "up" | "down";
    redis: "up" | "down";
  };
  version: string;
  uptime: number;
}
```

### 5.4 Log Management

#### Structured Logging Format

All logs must be structured JSON with OpenTelemetry correlation:

```json
{
  "timestamp": "2026-01-15T10:30:00.000Z",
  "level": "error",
  "message": "Failed to process candidate",
  "service": "aptivo-app",
  "version": "1.2.0",
  "environment": "production",
  "traceId": "abc123def456",
  "spanId": "789ghi",
  "error": {
    "type": "https://api.aptivo.com/errors/persistence-error",
    "title": "Database Error",
    "status": 500
  }
}
```

#### Log Aggregation

- **Collection:** App Platform built-in log forwarding
- **Storage:** Elasticsearch / Loki
- **Visualization:** Grafana dashboards
- **Retention:** 30 days (hot), 90 days (warm), 1 year (cold/archived)

### 5.5 Error Reporting with RFC 7807

All API errors use RFC 7807 Problem Details format. Operations should leverage this for precise alerting:

```typescript
// RFC 7807 Problem Details structure
interface ProblemDetails {
  type: string; // URI identifying error type
  title: string; // human-readable summary
  status: number; // HTTP status code
  detail?: string; // explanation
  instance?: string; // URI for this occurrence
  traceId?: string; // OpenTelemetry trace ID
  errors?: Array<{
    // validation errors
    field: string;
    message: string;
  }>;
}
```

#### Alert Routing by Error Type

Configure alerts based on RFC 7807 `type` field for precise incident routing:

| Error Type URI                  | Severity | Action             |
| ------------------------------- | -------- | ------------------ |
| `/errors/database-unavailable`  | P1       | Page DBA + SRE     |
| `/errors/authentication-failed` | P2       | Page Security      |
| `/errors/rate-limit-exceeded`   | P3       | Slack notification |
| `/errors/validation-error`      | P4       | Log only           |

#### Result-Based Error Reporting

Since the application uses functional error handling with `Result<T, E>` types, operations teams must understand that errors may not throw exceptions. All services must explicitly capture and report `Result.Err` values:

```typescript
// handler pattern: always report Result errors to Sentry
import * as Sentry from "@sentry/nextjs";
import { mapErrorToHttpResponse } from "@/lib/errors/http-mapper";

export async function handleRequest(input: Input): Promise<Response> {
  const result = await processBusinessLogic(input);

  if (!result.success) {
    // mandatory: capture functional errors in Sentry
    Sentry.captureException(result.error, {
      tags: {
        errorType: result.error._tag,
        operation: "processBusinessLogic",
      },
      extra: {
        input: sanitizeForLogging(input),
      },
    });

    // map Result error to RFC 7807 HTTP response
    return mapErrorToHttpResponse(result.error);
  }

  return Response.json(result.value);
}
```

#### Result Error Metrics

Track `Result.Err` occurrences as Prometheus metrics for operational visibility:

```typescript
// example custom metrics for Result-based errors
import { Counter } from "prom-client";

const resultErrorCounter = new Counter({
  name: "aptivo_result_errors_total",
  help: "Total count of Result.Err occurrences",
  labelNames: ["operation", "error_tag", "module"],
});

// usage in error handling
if (!result.success) {
  resultErrorCounter.inc({
    operation: "createProject",
    error_tag: result.error._tag,
    module: "project-management",
  });
}

// example metrics produced:
// aptivo_result_errors_total{operation="createProject",error_tag="ValidationError",module="project-management"} 42
// aptivo_result_errors_total{operation="findCandidate",error_tag="NotFoundError",module="recruitment"} 7
```

**Key Operational Points:**

- **Never silently discard** `Result.Err` values - they represent real failures
- **Always capture** errors in Sentry even when the code doesn't throw
- **Emit metrics** for all Result failures to enable alerting
- **Map consistently** to RFC 7807 responses for API consumers
- **Include trace context** via OpenTelemetry for correlation

### 5.6 Operational Tooling

For running ad-hoc scripts or debugging production issues:

```bash
# run operational task with full DI container
pnpm run task -- <task-name>

# examples
pnpm run task -- migrate-data
pnpm run task -- reprocess-failed-events
pnpm run task -- generate-report --date 2026-01-15

# all operational scripts use same dependency injection pattern
# and emit OpenTelemetry traces for observability
```

---

## **6. CI/CD Pipeline**

### 6.1 Pipeline Architecture

> **Strategy**: Build Once, Deploy Many with SHA-tagged immutable artifacts.

```mermaid
graph LR
    A[PR to main] --> B[pr-validation.yml]
    B --> C{Merge}
    C --> D[build.yml]
    D --> E[SHA-tagged image]
    E --> F[Manual: Deploy Staging]
    F --> G[QA Validation]
    G --> H[release-please PR]
    H --> I[Merge release PR]
    I --> J[publish-docker.yml]
    J --> K[deploy-production.yml]
```

**Workflow Files**:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `pr-validation.yml` | PR to main | Lint, typecheck, unit tests, security scans |
| `build.yml` | Push to main | Build SHA-tagged Docker image, container scan |
| `publish-docker.yml` | Version tag | Retag SHA image with version, publish |
| `deploy-production.yml` | After publish | Deploy to production via Railway |

### 6.2 Security Scan Requirements

| Scan Type     | Tool                     | Status         | Failure Threshold   | Frequency            |
| ------------- | ------------------------ | -------------- | ------------------- | -------------------- |
| **SAST**      | eslint-plugin-security   | Implementing   | Any high/critical   | Every PR             |
| **SCA**       | pnpm audit               | Active         | Critical only       | Every PR             |
| **Secrets**   | gitleaks                 | Active         | Any detected secret | Every PR             |
| **Container** | Trivy (v0.28.0)          | Active         | Critical/High CVE   | Before registry push |
| **SBOM**      | BuildKit attestation     | Active         | Generate always     | Every release        |

### 6.3 Deployment Gates

| Gate                  | Criteria                                       | Enforced By              |
| --------------------- | ---------------------------------------------- | ------------------------ |
| **PR Merge**          | All checks pass, coverage met, 1+ approval     | GitHub Branch Protection |
| **Staging Deploy**    | All tests pass, no critical security findings  | GitHub Actions           |
| **Production Deploy** | QA sign-off, change request approved, E2E pass | Manual + GitHub Actions  |

---

## **7. Maintenance SOPs**

### 7.1 Daily Tasks

- [ ] Review Sentry for new application errors (last 24 hours)
- [ ] Check Grafana dashboards for performance anomalies
- [ ] Verify all health checks are passing
- [ ] Review OpenTelemetry traces for high-latency operations

### 7.2 Weekly Tasks

- [ ] Review audit logs for suspicious activity
- [ ] Apply security patches to container base images
- [ ] Run SCA scan and review new vulnerabilities
- [ ] Verify feature flag env vars are consistent across environments
- [ ] Review and clean up old feature flags in code (> 30 days since full rollout)

### 7.3 Monthly Tasks

- [ ] Conduct full review of system access logs
- [ ] Test database backup recovery in non-production environment
- [ ] Test disaster recovery runbook (dry run)
- [ ] Review and rotate secrets approaching expiry
- [ ] Capacity planning review based on growth trends

### 7.4 Quarterly Tasks

- [ ] Full DR failover test to secondary region
- [ ] Penetration testing engagement
- [ ] Review and update runbooks
- [ ] Chaos engineering exercises

---

## **8. Incident Response**

### 8.1 Severity Classification

| Severity  | Definition                              | Response Time | Resolution Target |
| --------- | --------------------------------------- | ------------- | ----------------- |
| **SEV-1** | Complete outage, data loss risk         | 5 minutes     | 1 hour            |
| **SEV-2** | Major degradation, > 50% users affected | 15 minutes    | 4 hours           |
| **SEV-3** | Minor degradation, < 50% users affected | 1 hour        | 24 hours          |
| **SEV-4** | Cosmetic issues, workaround available   | 4 hours       | 1 week            |

### 8.2 On-Call Rotation

| Role                    | Schedule                 | Escalation Path                  |
| ----------------------- | ------------------------ | -------------------------------- |
| **Primary On-Call**     | Weekly rotation          | PagerDuty → Phone                |
| **Secondary On-Call**   | Weekly rotation (backup) | PagerDuty → Phone (after 10 min) |
| **Engineering Manager** | Always available         | Manual escalation for SEV-1      |

### 8.3 Incident Response Process

```
Alert Received
      │
      ▼
┌─────────────┐
│ Acknowledge │ (within response time)
│   Alert     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Assess    │ Determine severity, affected systems
│   Impact    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Communicate │ Post to #incident-{id} channel
│   Status    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Mitigate   │ Feature flag disable, rollback, scale
│   Impact    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Resolve   │ Fix root cause or implement workaround
│   Issue     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Post-Mortem │ Blameless review within 48 hours
│   Review    │
└─────────────┘
```

### 8.4 Playbook 1: Failed Deployment Rollback

**Trigger:** Deploy fails or smoke tests reveal critical issues

**Immediate Actions (< 5 minutes):**

1. **Disable feature flags** for new functionality (instant)
2. **Trigger rollback** via GitHub Actions "Rollback Production" workflow
3. **Post status** in #ops-deployments: "🔴 Production rollback initiated"

**Verification:**

1. Confirm previous stable version is running
2. Re-run smoke tests
3. Monitor error rates for 15 minutes

**Post-Incident:**

1. Announce recovery in #ops-deployments
2. Create incident ticket for post-mortem
3. Do not re-deploy until root cause identified

### 8.5 Playbook 2: Database Outage

**Trigger:** Database unreachable alert or replication lag > 5 minutes

**Immediate Actions:**

1. **Check managed service status** (Railway Dashboard → PostgreSQL service)
2. **Assess scope:** Primary failure vs connectivity issue
3. **Page DBA** if not already notified

**Phase 1 Recovery (Basic-tier, no replication):**

- Railway managed database provides automated daily backups
- Restore from latest backup if database is unrecoverable
- Application reconnects automatically when database recovers

**Phase 2+ Recovery (HA-tier, with standby):**

- HA-tier managed databases handle automatic failover to standby
- Application reconnects automatically via connection pooler

**Recovery Validation:**

1. Verify database connectivity from all services
2. Check replication is re-established (Phase 2+ HA-tier only)
3. Verify no data loss (compare transaction logs / check latest backup timestamp)

### 8.6 Playbook 3: Disaster Recovery

> **Phase 1 Reality**: Production runs on Railway (single region, managed databases). Full multi-region DR with automatic failover is a Phase 2+ capability requiring HA-tier databases and multi-region infrastructure. Phase 1 relies on Railway's managed database automated daily backups and Railway's built-in container restart.

**Trigger:** Complete regional outage or extended infrastructure failure

#### Phase 1: Single-Region Recovery

**RTO Target:** < 8 hours (manual restore from backup — realistic for 3-person team without automated failover)
**RPO Target:** < 24 hours (daily automated backups)

> **Note (2026-03-13, Tier 2 re-evaluation SA-1)**: Original RTO target of <4h was determined to be unsupportable for manual DR steps (provision infra, DB restore, DNS update, smoke test) with a 3-developer team and no automated failover. Updated to <8h. Phase 2 Epic 6 (HA Database) will enable automated failover to restore <4h target.

**Recovery Steps:**

1. **Declare incident** - Notify management, create incident channel
2. **Assess Railway status** - Check [status.railway.app](https://status.railway.app)
3. **If transient** - Wait for Railway platform recovery; Railway auto-restarts containers
4. **If extended outage** - Restore database from latest Railway automated backup to new region
5. **Redeploy app** - Create new Railway project in alternate region using same railway.json config
6. **Update DNS** - Point traffic to new deployment (via CloudFlare or registrar)
7. **Verify services** - Run smoke tests
8. **Communicate** - Update status page, notify stakeholders

#### Phase 1 Failback Procedure

> **Context**: After restoring to an alternate region (steps 1–8 above), use this procedure to return to the primary region when the original outage is resolved.

1. **Confirm primary region recovery** — Verify Railway status page shows all services operational in original region for ≥ 1 hour
2. **Provision primary region infrastructure** — Re-create Railway project and managed databases in original region
3. **Migrate data** — Export PostgreSQL from alternate region, import to primary; sync S3/Volumes objects
4. **Verify data integrity** — Compare row counts, audit log continuity, latest workflow execution timestamps
5. **DNS cutover** — Update DNS to point back to primary region; set TTL low (60s) during cutover window
6. **Smoke test** — Run full smoke test suite against primary region endpoints
7. **Decommission alternate** — After 24h stable operation, tear down alternate region infrastructure
8. **Post-failback review** — Document lessons learned, update RTO/RPO estimates based on actual times

**Decision Criteria for DR Activation:**

| Condition | Action |
|-----------|--------|
| Railway status page shows ETA < 1 hour | Wait; reassess every 30 minutes |
| Railway status page shows ETA > 2 hours or no ETA | Begin DR procedure (steps 1–8 above) |
| DO status page shows ETA 1–2 hours | Wait 1 hour; if no improvement, begin DR |
| Data corruption suspected (not just unavailability) | Begin DR immediately from last clean backup |

#### Phase 2+: Multi-Region DR (Design Target)

> **NOT YET OPERATIONAL** — The following defines design requirements for Phase 2 multi-region DR. Operational procedures will be created as part of Phase 2 architecture design. Do not reference these as current capabilities.

**Prerequisites (not yet met):**

- [ ] HA-tier managed databases with standby nodes and replication
- [ ] Secondary region infrastructure provisioned
- [ ] Cross-region database replication active
- [ ] DNS failover configured (CloudFlare)
- [ ] Runbook tested quarterly

**Design Parameters (must be documented before Phase 2 go-live):**

| Parameter | Requirement | Notes |
|-----------|-------------|-------|
| **Failover Trigger** | Define: automatic (DNS health check failure count/duration) vs. manual (operator decision tree) | DO managed DB HA uses automatic promotion; app-layer needs DNS-based trigger |
| **Data Consistency Mode** | Define: synchronous vs. asynchronous replication; RPO during failover | Async replication = potential data loss; document acceptable RPO per schema (public, aptivo_trading, aptivo_hr) |
| **Failback Procedure** | Document: primary region recovery verification, data reconciliation between regions, DNS cutover back, verification steps | Must handle data written to secondary during outage |
| **Regional Isolation Mapping** | Document: which SaaS dependencies (Inngest, Novu, Supabase) are region-independent and continue operating during DO regional outage | Prevents confusion during incident response |
| **Quarterly DR Test** | Define: test scope, success criteria, data verification steps, documented results | Must validate actual RTO/RPO against targets |

### 8.7 Playbook 4: Redis Outage

**Trigger:** Redis unreachable alert, BullMQ job processing stalled, or idempotency check failures detected

**Severity Classification:**
- Redis down + MCP tool calls active → **SEV-2** (data integrity risk from duplicate side-effecting calls)
- Redis down + no active MCP calls → **SEV-3** (feature degradation, no data risk)

**Immediate Actions (< 5 minutes):**

1. **Check managed Redis status** (Upstash dashboard or `redis-cli ping`)
2. **Assess scope:** Complete failure vs connectivity issue vs OOM
3. **Activate per-consumer degradation policies** (documented in ADD §2.3.2 Redis):
   - MCP idempotency: **fail-closed** — reject new tool calls to prevent duplicate financial operations
   - Rate limiting: **fail-open** — allow requests without rate limiting
   - Webhook deduplication: **fail-open** — process webhooks (handlers are idempotent)
   - Session cache: **fail-open** — fall back to database session lookup
4. **If OOM:** Check `redis-cli info memory` for eviction pressure; identify largest key namespace (`idem:*`, `rl:*`, `dedup:*`, `sess:*`)

**Recovery:**

1. If Redis restarts: verify connectivity from all consumers, check BullMQ job queue drains
2. If unrecoverable: provision new Redis instance, update connection strings, restart application
3. BullMQ jobs that were in-flight during outage: verify idempotency keys prevent duplicate processing

**Recovery Validation:**

1. `redis-cli ping` returns PONG from application network
2. BullMQ dashboard shows jobs processing
3. MCP idempotency checks passing (check application logs for `idempotency-cache-miss` events)
4. No duplicate webhook processing detected

### 8.8 Playbook 5: External SaaS Outage (Inngest / Novu / Supabase)

**Trigger:** Health check failures for external dependencies, or user reports of authentication/workflow/notification failures

#### Inngest Cloud Outage

**Severity:** SEV-1 (all workflows halt)

**Blast Radius:** All active workflows pause; new workflows cannot trigger; HITL correlations stop; scheduled timers do not fire.

**Immediate Actions:**

1. Check [status.inngest.com](https://status.inngest.com) for known incidents
2. Verify via application logs (`inngest.connection.error` or step execution failures)
3. **Communicate:** Post to #ops channel — "Workflow processing paused due to Inngest outage. No data loss — workflows will resume from last checkpoint on recovery."
4. If extended (> 1 hour): evaluate self-hosted Inngest deployment as DR option (see ADD §3.1 self-hosting link)

**Recovery:** Workflows resume automatically from last successful step (Inngest durable state). Verify: check Inngest dashboard for resumed function runs, confirm HITL events being correlated.

#### Supabase Auth Outage

**Severity:** SEV-1 (all authenticated operations fail)

**Blast Radius:** All authenticated API endpoints return 401/503. New logins impossible. HITL approvals via authenticated endpoints blocked.

**Immediate Actions:**

1. Check [status.supabase.com](https://status.supabase.com) for known incidents
2. Verify JWKS cache status — if cached keys are fresh (< 1h), existing sessions continue working
3. **If JWKS cache stale:** Extend stale-if-error window to 24h in application config to allow existing sessions
4. **Communicate:** Post to #ops channel with user impact assessment
5. HITL approval tokens (self-contained signed JWTs) can be validated locally — confirm HITL link-based approvals still work

**Recovery:** Verify login flow works end-to-end. Verify JWKS refresh succeeds. Monitor for elevated 401 rates.

#### Novu Outage

**Severity:** SEV-3 (notification delivery degraded; core platform unaffected)

**Blast Radius:** HITL approval notifications not delivered — approvers unaware of pending decisions. Workflows with HITL gates will eventually timeout at TTL.

**Immediate Actions:**

1. Check Novu status page for known incidents
2. Monitor HITL pending approval count — if growing, manually notify approvers via alternative channels (Slack, direct message)
3. **No platform action required** — core operations continue; HITL workflows fall back to TTL timeout path

**Recovery:** Verify notification delivery resumes. Check for queued notifications being delivered (potential burst). Monitor for duplicate notifications.

### 8.9 Playbook 6: HITL Gateway Failure

**Trigger:** HITL decision API errors > 5% for 5 minutes, OR pending approval count growing without decisions being recorded, OR `hitl_decision_errors` alert fires.

**Severity:** SEV-2 (approval-gated workflows blocked)

**Blast Radius:** All approval-gated workflows (trade execution, hiring decisions, compliance approvals) stall in SUSPENDED state. Core platform operations (non-HITL workflows, auth, MCP) continue.

**Immediate Actions:**

1. Check HITL decision endpoint health: `GET /api/v1/health/ready` — verify database connectivity
2. Query pending HITL requests: `SELECT count(*) FROM hitl_requests WHERE status = 'pending' AND created_at > now() - interval '1 hour'`
3. Check for database lock contention on `hitl_requests` / `hitl_decisions` tables
4. Verify Inngest `step.waitForEvent` is receiving decision events (check Inngest dashboard → Events → `hitl.decision.*`)
5. If approval tokens are failing validation: check JWKS cache status and Supabase Auth connectivity

**Recovery:**

1. If database lock contention: identify blocking query (`SELECT * FROM pg_stat_activity WHERE state = 'active'`), terminate if safe
2. If Inngest event delivery failing: verify Inngest Cloud status, check event send logs
3. Restart API container if HITL service is in a bad state: `railway service restart` (or Railway dashboard → service → Restart)
4. After recovery: verify pending approvals can be processed by submitting a test approval

**Escalation:** If not resolved within 30 minutes → SEV-1. Contact: Engineering Manager (always available per §8.2). For Inngest issues: [Inngest Status](https://status.inngest.com) and support channel.

### 8.10 Playbook 7: Audit Service Degradation

**Trigger:** Audit write latency > 500ms for 5 minutes, OR HITL decision recording latency spikes, OR `audit_write_timeout` alert fires.

**Severity:** SEV-2 (compliance logging degraded; critical paths may be blocked)

**Blast Radius:** Synchronous audit writes block callers: HITL decision recording, file access logging, retention enforcement, workflow audit events. Core platform operations without audit writes continue.

**Immediate Actions:**

1. Check `audit_logs` table size and bloat: `SELECT pg_size_pretty(pg_total_relation_size('audit_logs'))`
2. Check for lock contention: `SELECT * FROM pg_locks WHERE relation = 'audit_logs'::regclass AND NOT granted`
3. Check index health: `SELECT indexrelname, idx_scan, idx_tup_read FROM pg_stat_user_indexes WHERE schemaname = 'public' AND relname = 'audit_logs'`
4. Monitor current write latency: check application metrics for `audit_write_duration_ms` P99

**Recovery:**

1. If table bloat: run `VACUUM ANALYZE audit_logs` (non-blocking in PostgreSQL)
2. If index bloat: schedule `REINDEX CONCURRENTLY` during low-traffic window
3. If disk pressure: check managed database disk usage via Railway console; consider archiving old audit records per retention policy (§9.4)
4. **Interim mitigation**: If writes consistently > 1s, consider adding application-level write timeout (500ms) with dead-letter queue for failed entries — prevents blocking critical paths while preserving compliance (no silent drops)

**Escalation:** If HITL decisions are being blocked > 15 minutes → SEV-1. For database issues: Railway support.

### 8.11 Playbook 8: Database Connection Pool Exhaustion

**Trigger:** `db_connection_pool_usage > 80%` alert fires (Runbook §5.2), OR application errors with "connection pool timeout" or "too many connections," OR API latency spikes across all endpoints simultaneously.

**Severity:** SEV-1 (all database-dependent operations fail)

**Blast Radius:** Total platform degradation. All components using PostgreSQL become slow or unavailable: Workflow Engine, HITL Gateway, Audit Service, Identity Service (RBAC), File Storage (metadata), LLM Gateway (usage logs).

**Immediate Actions:**

1. Check current connections: `SELECT count(*), state FROM pg_stat_activity GROUP BY state`
2. Identify long-running queries: `SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 10`
3. Identify idle-in-transaction connections: `SELECT pid, now() - xact_start AS duration FROM pg_stat_activity WHERE state = 'idle in transaction' ORDER BY duration DESC`
4. Kill idle-in-transaction connections older than 5 minutes: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND xact_start < now() - interval '5 minutes'`

**Recovery:**

1. If a single long-running query is consuming connections: terminate it (`SELECT pg_terminate_backend(<pid>)`) — this may cause the originating workflow step to retry
2. If connection leak (connections not being returned to pool): restart API containers: `railway service restart` (or Railway dashboard)
3. If legitimate load spike: increase connection pool size in database configuration (Railway console) — note: managed database has a max based on plan tier
4. After recovery: verify connection count returns to normal; check application logs for the root cause (missing connection release, slow query, etc.)

**Prevention:** Phase 1 pool size is 20 connections (managed database default). Monitor `db_connection_pool_usage` metric. Phase 2+: connection pool per schema/domain to prevent cross-domain exhaustion.

**Escalation:** If not resolved within 15 minutes → contact Railway support. Engineering Manager for SEV-1 incident management.

### 8.12 Component Criticality & Recovery Priority

During multi-component incidents, recover in this order:

| Priority | Component | Rationale |
|----------|-----------|-----------|
| 1 | Railway | Infrastructure — nothing works without it |
| 2 | PostgreSQL Database | All components depend on it |
| 3 | Identity Service (Supabase Auth) | Gates all authenticated operations |
| 4 | Redis Cache | Idempotency and rate limiting (data integrity) |
| 5 | Workflow Engine (Inngest) | Core business process execution |
| 6 | HITL Gateway | Approval-gated business processes |
| 7 | Audit Service | Compliance logging |
| 8 | MCP Integration Layer | External tool access |
| 9 | LLM Gateway | AI-powered workflow steps |
| 10 | Notification Bus (Novu) | Alert delivery |
| 11 | File Storage | Document management |
| 12 | BullMQ | Queued job processing |

### 8.13 Playbook 9: MCP Circuit Breaker Sustained Open

**Severity**: SEV-3
**Symptoms**: MCP tool calls returning `circuit_open` errors; Grafana alert `mcp_tool_error_rate > 5%`; workflow steps failing with `ExternalServiceError`.

**Triage**:
1. Check which MCP server(s) have open circuit breakers: `GET /api/v1/admin/mcp/health` (or check logs for `circuit breaker open` entries)
2. Verify if the external service is actually down (check provider status pages)
3. Check if the issue is network-related (DNS, firewall, proxy)

**Resolution**:
1. If external service is down: Wait for recovery. Circuit breaker will auto-close after 30s half-open test succeeds.
2. If network issue: Fix network. Circuit breaker auto-recovers.
3. If persistent: Disable the MCP server in config (`MCPServerConfig.enabled = false`), deploy. Workflows will follow error path.
4. Manual circuit breaker reset: Restart the API container (clears in-memory circuit breaker state).

**Escalation**: If circuit breaker remains open for >1 hour with no external service issue, escalate to engineering.

### 8.14 Playbook 10: LLM Provider Failure / Budget Exhaustion

**Severity**: SEV-2 (if both providers down), SEV-3 (single provider, fallback active)
**Symptoms**: Workflow steps with LLM calls failing; `LLMError` in logs; `DAILY_BUDGET_EXCEEDED` or `MONTHLY_BUDGET_EXCEEDED` errors; Grafana alert on LLM error rate.

**Triage**:
1. Check provider status pages: [status.openai.com](https://status.openai.com), [status.anthropic.com](https://status.anthropic.com)
2. Check budget status: `GET /api/v1/admin/llm/budget` or query `SELECT SUM(cost_usd) FROM llm_usage_logs WHERE timestamp >= date_trunc('day', NOW())`
3. Check if fallback provider is active

**Resolution — Provider Down**:
1. Single provider down: Verify fallback is working. No action needed — automatic failover.
2. Both providers down: Wait for recovery. AI-dependent workflows will fail gracefully (error path).
3. Persistent issue: Contact provider support (see Vendor Contacts below).

**Resolution — Budget Exceeded**:
1. Check for anomalous usage: `SELECT workflow_id, SUM(cost_usd) FROM llm_usage_logs WHERE timestamp >= date_trunc('day', NOW()) GROUP BY workflow_id ORDER BY 2 DESC`
2. If legitimate spike: Temporarily increase daily budget via env var `LLM_DAILY_BUDGET_USD` and redeploy.
3. If runaway workflow: Identify and cancel the workflow. Investigate root cause.
4. Monthly budget: requires business approval to increase.

**Escalation**: Vendor contacts section below.

### 8.15 Playbook 11: File Storage / ClamAV Failure

**Severity**: SEV-3
**Symptoms**: File uploads returning 500 errors; `scan_pending` files accumulating; ClamAV health check failing; S3 storage connection errors.

**Triage**:
1. Check Railway Volumes status: [status.railway.app](https://status.railway.app)
2. Check ClamAV container health: Railway dashboard → clamav service status
3. Check ClamAV logs: Railway dashboard → clamav service → Logs (or `railway logs --service clamav`)
4. Check if issue is storage or ClamAV or both

**Resolution — Storage Down**:
1. Verify Railway status page
2. File uploads will fail; existing file metadata remains in PostgreSQL
3. No action needed — file operations retry when storage recovers
4. If prolonged: Notify users that file operations are temporarily unavailable

**Resolution — ClamAV Down**:
1. Check ClamAV container logs for OOM (signature DB update uses ~2.4 GiB peak)
2. If OOM: Restart container. Consider increasing memory limit.
3. If signature update failed: Check internet connectivity from container. ClamAV updates from `database.clamav.net`.
4. Files will queue as `scan_pending` and be scanned when ClamAV recovers
5. `scan_pending` files cannot be downloaded (quarantine policy)

**Escalation**: Railway support for storage issues. ClamAV community for scanner issues.

### 8.16 Playbook 12: BullMQ Job Queue Stall

**Severity**: SEV-3
**Symptoms**: Rate-limited MCP requests not draining; outbound webhooks not delivering; BullMQ dashboard showing stalled jobs; Redis memory increasing.

**Triage**:
1. Check Redis connectivity: `redis-cli -u $REDIS_URL ping`
2. Check BullMQ worker status: application logs for `bullmq` entries
3. Check stalled job count: BullMQ admin API or direct Redis query
4. Check Redis memory: `redis-cli -u $REDIS_URL info memory`

**Resolution**:
1. If Redis down: BullMQ cannot process jobs. See Redis recovery playbook (§8.7).
2. If worker crashed: Restart worker container. Stalled jobs auto-retry after stall interval (30s).
3. If jobs stuck in `active` state: BullMQ stall detection will move them back to `waiting` after `stalledInterval` (30s default). If not: manually move with BullMQ admin API.
4. If Redis near OOM: Check for job accumulation (`LLEN bull:mcp-requests:wait`). Clear completed/failed jobs older than 7 days.
5. Manual job retry: Use BullMQ admin API to retry specific failed jobs.

**Escalation**: Engineering for persistent stalls. Redis scaling for memory issues.

### 8.17 Playbook 13: ClamAV Operations

**Deployment**:
- Container image: `ajilach/clamav-rest` or `benzino77/clamav-rest-api`
- Minimum RAM: 1.2 GiB (2.4 GiB peak during signature updates)
- API port: HTTP POST `/api/v1/scan` (multipart/form-data)
- Scan timeout: 30s per file (configurable)

**Monitoring**:
- Health check: `GET /api/v1/version` returns ClamAV version and signature date
- Signature freshness: Signatures should be ≤24h old. Alert if `freshclam` last update >48h.
- Memory usage: Monitor for OOM during daily signature updates (~2.4 GiB peak)

**Signature Updates**:
- Automatic: `freshclam` runs daily inside the container (built-in to docker image)
- Manual trigger: `docker exec <container> freshclam`
- Mirror: `database.clamav.net` (default). Consider private mirror if rate-limited.

**Troubleshooting**:
1. Scan always returns "error": Check if ClamAV daemon is running inside container (`clamd` process)
2. High scan latency: Check file size (>50MB files may timeout); check container CPU/memory
3. Signature update failing: Check DNS resolution; check if ClamAV mirror is accessible; check disk space

---

## **9. Rollback Procedures**

### 9.1 Application Rollback

**When**: Deployment introduces bugs, performance regression, or unexpected behavior.

**Procedure (Railway)**:
1. List recent deployments: Railway dashboard → Deployments tab
2. Identify the last known-good deployment
3. Rollback: Click "Rollback" on the target deployment (or `railway up` with previous commit SHA)
4. Alternative: Revert the git commit and push to trigger new deployment
5. Verify: Check health endpoint `GET /health/ready` returns 200

**Manual Fallback** (if Railway CLI fails):
1. Go to Railway dashboard → Project → Deployments
2. Click the last successful deployment → "Rollback"
3. Monitor deployment progress

**Notes**:
- Rolling deployments ensure zero-downtime during rollback
- In-flight requests complete before old containers are terminated
- Verify health checks pass before declaring rollback complete

### 9.2 Database Migration Rollback

**When**: Migration introduces schema errors, data corruption, or performance issues.

**Procedure**:
1. Identify the failed migration: Check `drizzle` migration history table
2. Run down migration: `pnpm drizzle-kit down` (or project-specific command)
3. Verify schema state: `pnpm drizzle-kit check`
4. If down migration fails: Manually execute the reverse SQL (documented in each migration file)

**Pre-flight (CI validation)**:
- All migrations MUST have corresponding down/reverse migrations
- CI runs `up` then `down` on a test database to validate reversibility
- Data-destructive migrations (DROP COLUMN, ALTER TYPE) must be reviewed manually

**Data Recovery** (if data corrupted):
1. Stop application: Scale API containers to 0
2. Restore from backup: Railway dashboard → PostgreSQL → Backups → select backup → restore
3. Re-run migrations up to the last-known-good version
4. Restart application

**Notes**:
- Migration scripts are in `packages/database/drizzle/` (or project-specific path)
- Always take a backup before running migrations in production

### 9.3 Secret Rotation Rollback

**When**: Rotated secret causes authentication failures, API errors, or integration breakage.

**Procedure**:
1. **Dual-key window**: During rotation, both old and new secrets should be valid. If the new secret is not working:
   a. Revert the environment variable to the old secret value
   b. Redeploy: `railway up` (or Railway dashboard → redeploy)
   c. Verify functionality

2. **Per-secret rollback**:

   | Secret | Rollback Method |
   |--------|----------------|
   | Supabase JWT Secret | Supabase Dashboard → Settings → JWT → revert |
   | S3 Storage Key | Railway Dashboard → Variables → regenerate or use backup key |
   | Novu API Key | Novu Dashboard → regenerate previous key |
   | Inngest Signing Key | Inngest Dashboard → revert signing key |
   | HITL_SIGNING_SECRET | Set env var to old value, redeploy. Old HITL tokens become valid again. |
   | Webhook HMAC | Set env var to old value, redeploy. Notify webhook providers. |
   | LLM API Keys | Provider dashboard → use backup key |

3. **Post-rollback**: Investigate why the new secret didn't work before attempting rotation again.

**Notes**:
- Always maintain the old secret value for at least 24 hours after rotation (dual-key window)
- Document the old secret value securely before rotation (password manager, not plaintext)

#### 9.3.1 Step-by-Step Secret Rotation

**Prerequisites**: Access to environment variable management (Railway dashboard or `.env`).

**Procedure** (example: `HITL_SIGNING_SECRET`):

1. Generate new secret:
   ```bash
   openssl rand -base64 32
   ```
2. Set previous secret:
   ```bash
   railway variables set HITL_SIGNING_SECRET_PREVIOUS=$CURRENT_SECRET
   ```
3. Update current secret to new value
4. Deploy and verify no 5xx errors in logs
5. Monitor for 24 hours — `previous secret` log warnings are expected
6. After 24h with no warnings: remove `HITL_SIGNING_SECRET_PREVIOUS`
7. Final deploy and verify

**Rollback**: If validation failures spike, restore the old secret as `HITL_SIGNING_SECRET` and remove `_PREVIOUS`.

**Secrets requiring this procedure**: HITL_SIGNING_SECRET, MCP_SIGNING_KEY, webhook HMAC keys.

**Secrets NOT requiring dual-key rotation** (managed by Supabase): SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY — rotate via Supabase Dashboard → Settings → API Keys.

### 9.4 Infrastructure Rollback

**When**: Infrastructure change (railway.json, networking, scaling config) causes issues.

**Procedure (Railway)**:
1. Config is version-controlled in the repository (`railway.json`)
2. Revert the config change in git
3. Push to trigger redeployment: `git push`
4. Or redeploy directly: `railway up`

**Compute/Networking Changes**:
- Instance size change: Update Railway service settings via dashboard, redeploy
- Scaling config: Update service scaling via Railway dashboard
- Environment variables: `railway variables set` with previous values
- Database plan change: Cannot downgrade in-place. Restore from backup to smaller plan if needed.

**Notes**:
- Railway supports instant rollback via the dashboard deployments list
- Treat railway.json as infrastructure-as-code: always commit changes to git first

### 9.5 Inngest Workflow Rollback

**When**: New workflow version has bugs, incorrect logic, or performance issues.

**Behavior During Deployment**:
- Inngest supports **version coexistence**: in-flight workflows continue with the code version that started them
- New workflow invocations use the new code version
- There is NO automatic rollback of in-flight workflows

**Rollback Procedure**:
1. Revert the workflow code change in git and deploy (§9.1 application rollback)
2. In-flight workflows on the old (buggy) version will complete with that version's logic
3. New invocations will use the reverted (correct) version
4. If in-flight workflows are stuck: Cancel via Inngest Dashboard → Functions → Cancel Run
5. If data was corrupted by buggy workflow: Manual data fix required

**Drain Old Version**:
1. Monitor Inngest Dashboard for active runs of the old version
2. Wait for all old-version runs to complete (or cancel them)
3. Verify no new runs are using the old version

**Notes**:
- Inngest memoization means completed steps are NOT re-executed even after code change
- Rolling back code does not re-execute already-completed steps in in-flight workflows

### 9.6 Multi-Component Rollback Order

When multiple components need rollback simultaneously, follow this priority order:

| Priority | Component | Reason | Rollback Method |
|----------|-----------|--------|----------------|
| 1 (First) | Database migrations | Data integrity; must be correct before app can function | §9.2 |
| 2 | API Server | Serves user traffic; health checks validate database compatibility | §9.1 |
| 3 | Workflow Worker | Depends on correct DB schema and API availability | §9.1 |
| 4 | Secrets/Environment | Only if authentication/integration is broken | §9.3 |
| 5 | Infrastructure (railway.json) | Lowest risk; config changes rarely cause data issues | §9.4 |
| 6 (Last) | Inngest Workflows | In-flight workflows are isolated; new invocations affected by app rollback | §9.5 |

**Critical Rule**: ALWAYS rollback database migrations BEFORE rolling back application code. The application may depend on the old schema, and running new application code against a rolled-back schema (or vice versa) can cause data corruption.

---

## **10. Infrastructure as Code**

### 10.1 Railway Config Workflow

Infrastructure changes follow config-based GitOps:

```
Developer PR (railway.json) → Review → Merge → GitHub Actions → railway up
```

### 10.2 Infrastructure Repository Structure

```
railway.json              # Main Railway configuration

.github/workflows/
├── pr-validation.yml     # PR checks
├── build.yml             # Build SHA-tagged images
├── deploy-staging.yml    # Manual staging deploy
├── publish-docker.yml    # Tag release images
└── deploy-production.yml # Production deploy
```

### 10.3 Configuration Management

Railway configuration is version-controlled in `railway.json`:

```bash
# validate railway config
railway status

# apply changes (via GitHub Actions, not manual)
railway up

# view current deployment
railway status
```

Changes to infrastructure trigger PR review process before deployment.

### 10.4 Component-to-IaC Ownership Matrix

> **Added (Tier 3 re-evaluation IC-1/IC-4, 2026-03-13)**: Documents which production components are managed by IaC (`railway.json`) vs Railway console.

| Component | IaC (`railway.json`) | Console | Notes |
|-----------|---------------------|-------------------|-------|
| Web service config | Yes | — | Build and deploy settings in railway.json |
| Service scaling | — | Railway dashboard | Scaling configured via dashboard |
| PostgreSQL version | — | Railway dashboard | Provisioned via Railway PostgreSQL plugin |
| PostgreSQL plan/size | — | Railway dashboard | Vertical scaling requires manual approval to prevent cost overruns |
| PostgreSQL backups | — | Automated daily (Railway managed) | Retention per Railway plan; no IaC control over schedule |
| Redis | — | Upstash dashboard | External service; managed via Upstash |
| Storage (S3) | — | Railway dashboard | Bucket creation and lifecycle via Railway Volumes |
| ClamAV container | Yes | — | Defined as separate Railway service |
| Environment variables (non-secret) | — | Railway dashboard | `railway variables set` or dashboard |
| Secrets (API keys, signing keys) | — | Railway dashboard / CLI | Encrypted at rest by Railway; 90-day rotation cadence (§9.3) |
| DNS / routing | — | External (registrar) | Not managed by Railway |
| TLS certificates | — | Railway auto-renewed | Managed automatically by Railway |

### 10.5 Drift Detection Process (Automated)

> **Status**: Automated via GitHub Actions (INF-06). Manual fallback documented below.

**Automated Pipeline**: `.github/workflows/drift-detection.yml`
- Runs weekly (Monday 08:00 UTC) + on-demand via `workflow_dispatch`
- Exports live config via Railway API
- Compares against committed `railway.json`
- Creates GitHub issue with diff if drift detected

**Manual Fallback** (if CI unavailable):
1. Export live config: `railway status --json > /tmp/live.json`
2. Compare: `scripts/drift-check.sh railway.json /tmp/live.json`
3. Document drift and remediate per §10.6

### 10.6 Console-Managed Component Migration Plan

> **Added (Tier 3 re-evaluation IC-3, 2026-03-13)**: Documents path from ClickOps to IaC for console-managed components.

| Component | Current State | Migration Path | Target Phase |
|-----------|--------------|----------------|-------------|
| DB plan scaling | Railway dashboard | Railway API automation in CI | Phase 2 (Epic 6) |
| DB maintenance windows | Railway dashboard | Railway API automation when available | Phase 3+ |
| Redis plan scaling | Upstash dashboard | Upstash API automation | Phase 2 (Epic 6) |
| Storage bucket lifecycle | Railway dashboard | Railway API for bucket creation | Phase 2 |
| Secrets rotation | Railway dashboard / CLI | Dedicated secrets manager (Vault/AWS SM) | Phase 2 (Epic 6) |

### 10.7 Worker Scaling Procedures

> **Added (Sprint 10 INF-05, 2026-03-16)**: Documents auto-scaling configuration and manual override procedures for the Inngest worker component.

#### Auto-Scaling Configuration

The `inngest-worker` service in Railway is configured with CPU-based auto-scaling:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Min instances | 1 | Cost optimization — single worker sufficient for baseline load |
| Max instances | 4 | Cap scaling to control costs; increase via Railway dashboard if needed |
| Scale-up trigger | CPU > 70% for > 2 minutes | Standard threshold for compute-bound workers |
| Scale-down trigger | CPU < 30% for > 5 minutes | Conservative to prevent flapping |
| Cooldown period | 5 minutes | Prevents scale oscillation |

#### Manual Scaling Override

```bash
# temporarily scale to specific count via Railway dashboard
# Railway dashboard → inngest-worker service → Settings → Scaling

# check current deployment status
railway status
```

#### Monitoring Scaling Events

1. **Railway dashboard**: Project → inngest-worker service → Metrics tab shows resource usage
2. **Alerts**: Configure Railway usage alert at 80% of worker budget to detect runaway scaling
3. **Inngest dashboard**: Monitor queue depth — if growing despite max instances, consider increasing max instances or upgrading service resources

#### Scaling Decision Tree

```
Queue depth growing?
├── Yes → CPU < 70%? → Worker is I/O bound, not CPU bound → increase concurrency config, not instances
├── Yes → CPU > 70% and instances < max? → Auto-scaling should handle it; check cooldown timing
├── Yes → CPU > 70% and instances = max? → Increase max instances via Railway dashboard
└── No  → System is healthy; no action needed
```

---

## **11. Roles & Responsibilities (RACI Matrix)**

| Task                            | DevOps       | SRE          | Development | Management |
| ------------------------------- | ------------ | ------------ | ----------- | ---------- |
| **New Deployments**             | **R**        | C            | C           | **I**      |
| **System Monitoring**           | C            | **R**, **A** | I           | **I**      |
| **Incident Response (SEV-3/4)** | C            | **R**        | C           | **I**      |
| **Incident Response (SEV-1/2)** | **R**        | **R**, **A** | C           | **C**      |
| **Backup & Recovery**           | **R**, **A** | C            | I           | **I**      |
| **Maintenance & Patching**      | **R**, **A** | C            | I           | **A**      |
| **Security Compliance**         | C            | **A**        | C           | **R**      |
| **Capacity Planning**           | C            | **R**        | C           | **A**      |
| **DR Testing**                  | **R**        | **R**, **A** | I           | **I**      |
| **Post-Mortem Reviews**         | C            | **R**        | **R**       | **A**      |

**Legend:**

- **R** = Responsible (does the work)
- **A** = Accountable (final decision maker)
- **C** = Consulted (provides input)
- **I** = Informed (kept updated)

---

## **12. Vendor Escalation Contacts**

| Vendor | Service | Support Channel | SLA | Account Info |
|--------|---------|----------------|-----|-------------|
| **Railway** | Platform, Managed PostgreSQL, Volumes | [railway.app/help](https://railway.app/help) | Priority support on Pro plan | Team account required |
| **Supabase** | Auth, Database (if used) | [supabase.com/dashboard/support](https://supabase.com/dashboard/support) | Free: community only; Pro: email support | Project dashboard |
| **Novu** | Notification delivery | [docs.novu.co](https://docs.novu.co) / Discord community | Free: community only | Organization dashboard |
| **Inngest** | Workflow execution | [inngest.com/discord](https://inngest.com/discord) / support@inngest.com | Free: community; Pro: email | Account dashboard |
| **OpenAI** | LLM API | [help.openai.com](https://help.openai.com) | Varies by tier | API dashboard |
| **Anthropic** | LLM API | [support.anthropic.com](https://support.anthropic.com) | Email support | Console dashboard |
| **Google AI** | Gemini API | [ai.google.dev/support](https://ai.google.dev/support) | Standard Google Cloud support | Cloud console |
| **Sentry** | Error tracking | [sentry.io/support](https://sentry.io/support) | Free: community | Organization settings |

**Escalation Protocol**:
1. Check vendor status page first (saves time if known outage)
2. Search vendor documentation/community for known issue
3. File support ticket with: error details, timestamps, affected component, business impact
4. If SEV-1: Escalate via phone/chat if available; mention production impact

---

## **13. Disaster Recovery Test Procedure**

**Frequency**: Quarterly (or after major infrastructure changes)
**Objective**: Validate RTO <8h and RPO <24h claims

### 13.1 Pre-Drill Checklist
- [ ] Notify team members of scheduled drill
- [ ] Ensure recent backup exists (check Railway dashboard → PostgreSQL → Backups)
- [ ] Document current application version and deployment ID
- [ ] Prepare alternate region deployment configuration

### 13.2 Drill Procedure — Simulated Database Failure
1. **Simulate**: Create a new database from latest backup in alternate region
2. **Validate backup integrity**: Connect to restored DB, verify table counts and sample data
3. **Measure RPO**: Compare latest restored record timestamps to current time
4. **Deploy application**: Point staging environment to restored database
5. **Validate functionality**: Run smoke tests (health check, create workflow, HITL flow)
6. **Measure RTO**: Record time from "failure declared" to "application functional"
7. **Document results**: Record RPO achieved, RTO achieved, issues encountered

### 13.3 Drill Procedure — Simulated Regional Failure
1. **Simulate**: Deploy application to alternate Railway region (use staging config)
2. **Configure**: Point to new database, Redis, Volumes in alternate region
3. **Validate**: Run smoke tests
4. **Measure RTO**: Record total time from "region down" to "alternate region operational"
5. **Document results**: Record issues, missing configurations, manual steps required

### 13.4 Post-Drill Actions
- [ ] Clean up alternate-region resources (delete test database, app)
- [ ] File findings as issues for any RTO/RPO violations
- [ ] Update runbook with lessons learned
- [ ] Schedule next drill (quarterly)

**Success Criteria**: RPO < 24h AND RTO < 8h for database failure scenario.

### 13.5 Phase 2 DR Test Evidence (Sprint 10)

| Test | Target | Result | Date |
|------|--------|--------|------|
| HA database failover | < 30s interruption | PASS (dry-run validated) | 2026-03-16 |
| Application reconnection | Automatic (no restart) | PASS (HA connection string handling) | 2026-03-16 |
| Connection pool recovery | All domains recover | PASS (domain pool isolation in db.ts) | 2026-03-16 |
| RTO target | < 4h with automated failover | ACHIEVABLE (< 30s + pool recovery) | 2026-03-16 |

**Test Script**: `scripts/failover-test.sh`
**Dry-Run Command**: `scripts/failover-test.sh --dry-run`
**Full Test Command**: `RAILWAY_DB_SERVICE_ID=<id> scripts/failover-test.sh`

> Note: Full failover test requires Railway Managed PostgreSQL with Patroni HA. Dry-run validates connectivity and recovery monitoring logic.

---

## **14. Regional SaaS Isolation Map**

During a Railway regional failure, the following SaaS dependencies are affected:

| SaaS Service | Hosted Region | Affected by Railway Regional Failure? | Impact |
|-------------|---------------|---------------------------------------|--------|
| **Railway** | User-selected (e.g., us-west1) | **YES** — all containers down | Total platform outage |
| **Railway PostgreSQL** | Same region as app | **YES** — database unavailable | No data access |
| **Upstash Redis** | Upstash infrastructure | **NO** — independent infrastructure | Cache continues; BullMQ available |
| **Railway Volumes** | Region-specific | **YES** — file storage unavailable | File operations fail |
| **Supabase Auth** | Supabase Cloud (AWS) | **NO** — independent infrastructure | Auth continues if cached JWKS valid |
| **Novu Cloud** | Novu infrastructure | **NO** — independent | Notifications can be sent (but no app to trigger them) |
| **Inngest Cloud** | Inngest infrastructure | **NO** — independent | Events queued; workflows resume when app recovers |
| **OpenAI/Anthropic/Google** | Provider clouds | **NO** — independent | LLM available but no app to call them |
| **Sentry** | Sentry infrastructure | **NO** — independent | Error tracking continues for other apps |

**Key Insight**: A Railway regional failure takes down Railway-hosted services (platform, PostgreSQL, Volumes). However, Upstash Redis runs on independent infrastructure and is NOT affected. SaaS services hosted on other clouds (Supabase, Novu, Inngest, LLM providers) remain available but cannot be utilized because the application itself is down.

**Recovery**: See §13 DR Test Procedure. Recovery requires deploying to an alternate Railway region and restoring data from backups.

---

## **15. Phase 2 Service Operations (Sprints 13-14)**

### 15.1 Notification Failover (Sprint 13)

**Overview**: SMTP failback transport activates automatically when Novu is unavailable. Priority routing ensures critical notifications bypass quiet hours.

#### Health Check

- Monitor Novu delivery success rate via `/api/admin/notifications/health`
- SMTP fallback activates when Novu error rate exceeds 50% over 5-minute window
- Delivery monitoring tracks per-channel success/failure rates

#### Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| Notifications delayed | Novu degraded, SMTP failback active | Check Novu status page; verify SMTP credentials in secrets |
| Critical notifications not delivered | SMTP also failing | Verify SMTP host reachable; check approver webhook config |
| Duplicate notifications | Failback race condition | Check dedup window; verify transactionId uniqueness |

#### Recovery

1. Verify Novu status at `status.novu.co`
2. If Novu recovered, failback disengages automatically (next health check cycle)
3. If SMTP failing, rotate SMTP credentials via secrets provider
4. Monitor delivery monitoring dashboard for recovery confirmation

### 15.2 Workflow CRUD API (Sprint 13)

**Overview**: Runtime workflow definitions stored in database with version history. Visual builder serializes to the same format.

#### Health Check

- `GET /api/workflows` returns 200 with workflow list
- Workflow validation errors return RFC 7807 responses

#### Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| Workflow creation fails | Schema validation error | Check request body against WorkflowDefinitionSchema |
| Workflow execution fails after edit | Invalid step references | Verify all step IDs reference existing steps |
| Version conflict on update | Concurrent edits | Retry with latest version; use optimistic locking header |

#### Backup & Recovery

- Workflow definitions stored in PostgreSQL; covered by standard DB backup procedures (see section 8.6)
- Version history preserved; rollback to previous version via `PATCH /api/workflows/:id/rollback`

### 15.3 Feature Flags (Sprint 13)

**Overview**: Runtime feature flags with gradual rollout support. Flags are evaluated server-side and cached in Redis.

#### Health Check

- Feature flag evaluation should respond within 10ms (cached) or 50ms (cache miss)
- Redis cache miss rate should be below 5% under steady state

#### Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| Flag evaluation slow | Redis cache expired or unavailable | Check Redis health; flags fall back to default values |
| Flag not taking effect | Cache TTL not expired | Force cache invalidation via admin API |
| Unexpected behavior after flag change | Gradual rollout percentage | Verify rollout percentage and user segment targeting |

#### Emergency Override

- Set flag to `force_on` or `force_off` via admin API to bypass rollout logic
- All flag changes are audit-logged with actor and timestamp

### 15.4 Consent Management API (Sprint 13)

**Overview**: Data processing consent records for compliance. Consent decisions are immutable (append-only log).

#### Health Check

- `GET /api/consent/status` returns current consent state for authenticated user
- Consent records are append-only; no delete operation exists by design

#### Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| Consent check fails | Database unreachable | Check PostgreSQL health; consent defaults to deny |
| Consent granted but feature blocked | Cache stale | Invalidate consent cache; re-check |
| Audit gap in consent log | Write failure | Check DLQ for failed consent events |

#### Compliance Notes

- Consent records retained indefinitely (no TTL) per GDPR Article 7(1)
- Withdrawal of consent triggers data processing halt within 24 hours
- Export via audit query API for compliance audits

### 15.5 Approval SLA Metrics (Sprint 14)

**Overview**: Tracks approval request latency against configurable SLA targets. Surfaces metrics on admin dashboard.

#### Health Check

- SLA metrics computed on cron schedule (aligned with existing SLO cron)
- Dashboard available at `/admin/approval-sla`

#### Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| SLA metrics stale | Cron job not running | Check Inngest function status for SLA cron |
| High SLA breach rate | Approvers not responding | Review notification delivery; check quiet hours config |
| Dashboard shows no data | No approval requests in window | Verify date range filter; check HITL request volume |

### 15.6 Visual Workflow Builder (Sprint 14)

**Overview**: Client-side graph editor that serializes workflow definitions to the CRUD API format. Foundation only — full editor is Phase 3 scope.

#### Operational Notes

- Builder is client-side only; no additional backend services required
- Serialized workflow JSON validated server-side via WorkflowDefinitionSchema
- Invalid graph structures (cycles, orphan nodes) rejected at save time
- Builder state is ephemeral (browser memory); users must save to persist

---

## **16. Sprint 15 Production Deployment Checklist**

> **Status**: PENDING — code complete, infrastructure not provisioned
> **Owner**: DevOps + Senior Engineer
> **Prerequisite**: Sprint 15 commit `96a52fc` merged to main
> **Release gate**: All 9 steps must have evidence artifacts before GO decision

This checklist converts Sprint 15's simulated validations into real production readiness. Each step lists the human actions, the env vars to set, and verification steps that prove the step is complete.

**Authentication note**: In production, auth uses Supabase cookie-based sessions (not bearer tokens). Browser-based verification steps require SSO login first. For API-based verification in staging, use the dev-mode header `x-user-id: <user-uuid>` (only works when `NODE_ENV !== 'production'`).

**Existing routes** (verified in codebase):
- Health: `GET /health/live`, `GET /health/ready`
- Admin: `GET /api/admin/overview`, `/api/admin/feature-flags`, `/api/admin/approval-sla`, `/api/admin/hitl`, `/api/admin/audit`
- Auth: `GET /api/auth/sso/status`, `GET /api/auth/mfa/enroll`, `POST /api/auth/mfa/challenge`, `POST /api/auth/mfa/verify`
- Workflows: `GET /api/workflows`, `POST /api/workflows`, `GET /api/workflows/:id`
- MCP: `GET /api/mcp/servers`, `GET /api/mcp/servers/:id/health`

**Note**: There are no HITL request creation, LLM completion, or notification test endpoints in the current codebase. Steps 6 and 8 include manual alternatives.

---

### 16.0 Step 0 — Complete Env Var Inventory

Before starting, ensure ALL production env vars are planned. The composition root (`apps/web/src/lib/services.ts`) reads these vars at runtime:

**Required for Sprint 15 (this checklist):**
```
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=<from Step 1>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Step 1>
OIDC_PROVIDERS_CONFIG=<from Step 1>
DATABASE_URL_HA=<from Step 3>
DATABASE_URL=<from Step 3>
UPSTASH_REDIS_SESSION_URL=<from Step 5>
UPSTASH_REDIS_SESSION_TOKEN=<from Step 5>
UPSTASH_REDIS_JOBS_URL=<from Step 5>
UPSTASH_REDIS_JOBS_TOKEN=<from Step 5>
SMTP_HOST=<from Step 6>
SMTP_PORT=<from Step 6>
SMTP_USER=<from Step 6>
SMTP_PASS=<from Step 6>
SMTP_FROM=<from Step 6>
SMTP_SECURE=<from Step 6>
FEATURE_FLAGS=<from Step 7>
```

**Required for full production (not Sprint 15 scope but must be set):**
```
HITL_BASE_URL=https://<app-url>
HITL_SIGNING_SECRET=<min 32 chars, generate with: openssl rand -hex 32>
NOVU_API_KEY=<from Novu dashboard>
NOVU_WORKFLOW_ID=generic-notification
NOTIFICATION_FAILOVER_POLICY=novu_primary
OPENAI_API_KEY=<from OpenAI>
ANTHROPIC_API_KEY=<from Anthropic>
MCP_SERVER_URL=<if using MCP>
MCP_SIGNING_KEY=<generate with: openssl rand -hex 16>
S3_BUCKET=<from Railway Volumes>
S3_REGION=us-west1
S3_ACCESS_KEY=<from Railway>
S3_SECRET_KEY=<from Railway>
WEBAUTHN_RP_ID=yourdomain.com
WEBAUTHN_RP_NAME=Aptivo
WEBAUTHN_ORIGIN=https://yourdomain.com
```

**Runtime package dependencies** (verify installed in `apps/web/package.json`):
- `@supabase/supabase-js` — required by real MFA client
- `@supabase/ssr` — required by production auth extraction
- `@upstash/redis` — required by Redis clients
- `nodemailer` — required by SMTP adapter

---

### 16.1 Step 1 — Supabase Pro OIDC SSO + MFA (PR-01)

**Human actions:**
1. Upgrade Supabase project to Pro plan at https://supabase.com/dashboard
2. Navigate to Authentication → Providers → Enable OIDC (Okta)
   - Set Issuer URL, Client ID, Client Secret from your Okta admin console
   - Map Okta groups to Aptivo roles in the provider config
3. Navigate to Authentication → Providers → Enable OIDC (Azure AD) as secondary
4. Navigate to Authentication → MFA → Enable TOTP
   - Set enforcement: "Required for users with admin role"
5. Create break-glass local admin account:
   - Authentication → Users → Create user with email + password
   - Store credentials in secrets provider (1Password/Vault), not in code

**Env vars to set in deployment platform:**
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
OIDC_PROVIDERS_CONFIG='[{"providerId":"okta","displayName":"Okta SSO","issuerUrl":"https://<org>.okta.com","clientId":"<id>","groupToRoleMapping":{"admins":"admin","developers":"developer","viewers":"viewer"},"defaultRole":"user","domains":["company.com"]},{"providerId":"azure-ad","displayName":"Azure AD","issuerUrl":"https://login.microsoftonline.com/<tenant>/v2.0","clientId":"<id>","groupToRoleMapping":{"Admins":"admin"},"defaultRole":"user","domains":["company.com"]}]'
```

**Verification (browser-based):**
- [ ] SSO login via Okta produces authenticated session with mapped roles
- [ ] MFA enrollment prompts on first admin login
- [ ] Break-glass local login works when OIDC providers are unreachable
- [ ] Screenshot: Supabase Pro plan confirmation + provider config

**Evidence artifact**: `evidence/pr-01-sso-mfa.md` — screenshots, login trace, role mapping proof

---

### 16.2 Step 2 — MFA Stub Removal Verification (PR-02)

**Human actions:**
1. Verify `NEXT_PUBLIC_SUPABASE_URL` is set in production env (from Step 1)
2. Deploy the application with `NODE_ENV=production`
3. Confirm startup succeeds (no crash from missing Supabase URL)

**Verification:**
```bash
# verify the app starts and health endpoints respond
curl -s https://<app-url>/health/live | jq .
# should return { "status": "ok" }

curl -s https://<app-url>/health/ready | jq .
# should return { "status": "ok" }
```

**Browser-based MFA verification:**
1. Log in via SSO (from Step 1)
2. Navigate to a page that triggers `GET /api/auth/mfa/enroll`
3. Confirm enrollment flow starts (not a 503 error)

**Verification:**
- [ ] Application starts in production without MFA-related crash
- [ ] Health endpoints (`/health/live`, `/health/ready`) respond with `ok`
- [ ] MFA enrollment works via browser session (not 503)
- [ ] Check deployment logs — no `createMfaStubClient` calls in production

**Evidence artifact**: `evidence/pr-02-mfa-stub.md` — health responses, deployment logs

---

### 16.3 Step 3 — HA PostgreSQL Cluster (PR-03)

**Human actions:**
1. Go to Railway Dashboard → New → PostgreSQL
   - Engine: PostgreSQL 16
   - Enable Patroni HA (includes standby node)
   - Region: same as web service (e.g., us-west1)
   - Name: `aptivo-db-ha`
2. Note the connection string (connection pooler endpoint)
3. Link the PostgreSQL service to the web service in Railway

**Env vars to set:**
```
DATABASE_URL_HA=postgresql://<user>:<pass>@<host>:25060/<db>?sslmode=require
DATABASE_URL=postgresql://<user>:<pass>@<host>:25060/<db>?sslmode=require
```

**Verification — failover drill:**
```bash
# 1. record timestamp
date -u

# 2. trigger failover (Railway console → PostgreSQL → Actions → Promote standby)

# 3. measure RTO — time from failover trigger to first successful query
while true; do
  psql "$DATABASE_URL_HA" -c "SELECT 1" 2>/dev/null && echo "$(date -u) CONNECTED" && break
  echo "$(date -u) waiting..."
  sleep 1
done

# target: reconnect within 30 seconds
```

**Verification:**
- [ ] HA cluster provisioned with primary + standby (screenshot from Railway console)
- [ ] Application connects to HA cluster after deploy
- [ ] Failover drill executed: RTO measured at _____ seconds (target <30s)
- [ ] Application reconnects automatically after failover
- [ ] Post-failover queries succeed

**Evidence artifact**: `evidence/pr-03-ha-database.md` — cluster screenshot, failover timeline with timestamps, RTO measurement

---

### 16.4 Step 4 — Pool Config Enforcement (PR-04)

**Human actions:**
1. No infrastructure provisioning needed — uses the cluster from Step 3
2. Verify pool settings are applied by checking connection counts under load

**Verification:**
```bash
# check total active connections (application doesn't set application_name per domain,
# so verify total connection count stays within expected limits)
psql "$DATABASE_URL_HA" -c "SELECT count(*) FROM pg_stat_activity WHERE datname = '<db>';"

# verify pool config values are correct in code
# crypto: max 10, hr: max 10, platform: max 20 (defined in packages/database/src/pool-config.ts)
```

**Note**: Per-domain pool isolation is enforced in code (`DOMAIN_POOL_DEFAULTS` in `pool-config.ts`) but not distinguishable via `pg_stat_activity` because `application_name` is not set per domain. Verification is code-level, not infrastructure-level.

**Verification:**
- [ ] Total connection count stays within expected limits under load
- [ ] `pool-config.ts` domain defaults reviewed: crypto=10, hr=10, platform=20
- [ ] Connection exhaustion produces error, not hang

**Evidence artifact**: `evidence/pr-04-pool-config.md` — connection count output, code review confirmation

---

### 16.5 Step 5 — Split Redis Instances (PR-05)

**Human actions:**
1. Go to Upstash → Create Database → name: `aptivo-session` (region: same as app)
2. Go to Upstash → Create Database → name: `aptivo-jobs` (region: same as app)
3. Copy REST URLs and tokens for each

**Env vars to set:**
```
UPSTASH_REDIS_SESSION_URL=https://<session-id>.upstash.io
UPSTASH_REDIS_SESSION_TOKEN=<session-token>
UPSTASH_REDIS_JOBS_URL=https://<jobs-id>.upstash.io
UPSTASH_REDIS_JOBS_TOKEN=<jobs-token>
```

**Verification:**
```bash
# verify session redis is reachable
curl -s "$UPSTASH_REDIS_SESSION_URL/ping" -H "Authorization: Bearer $UPSTASH_REDIS_SESSION_TOKEN"
# should return "PONG"

# verify jobs redis is reachable (different instance)
curl -s "$UPSTASH_REDIS_JOBS_URL/ping" -H "Authorization: Bearer $UPSTASH_REDIS_JOBS_TOKEN"
# should return "PONG"

# verify they are different instances
echo "Session: $UPSTASH_REDIS_SESSION_URL"
echo "Jobs: $UPSTASH_REDIS_JOBS_URL"
```

**Verification:**
- [ ] Two separate Upstash databases created (screenshot)
- [ ] Both respond to PING
- [ ] Token blacklist writes go to session Redis (verified via `getTokenBlacklist` → `getSessionRedis` call chain in `services.ts`)

**Note**: `getJobsRedis()` is defined but not yet consumed by any runtime service. The jobs Redis instance is provisioned now for future use (Inngest workers, background jobs). Current verification is infrastructure-only — runtime wiring is a follow-up task.

**Evidence artifact**: `evidence/pr-05-redis-split.md` — Upstash dashboard screenshots, PING responses

---

### 16.6 Step 6 — SMTP Credentials + Failover (PR-06)

**Human actions:**
1. Sign up for SendGrid (or Mailgun) if not already configured
2. Create API key with "Mail Send" permission
3. Verify sending domain (SendGrid → Settings → Sender Authentication)
   - Add SPF record: `v=spf1 include:sendgrid.net ~all`
   - Add DKIM record: CNAME records from SendGrid wizard
4. Wait for DNS propagation (can take up to 48h, usually minutes)

**Env vars to set:**
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.<your-api-key>
SMTP_FROM=noreply@yourdomain.com
SMTP_SECURE=false
NOVU_API_KEY=<from Novu dashboard>
NOTIFICATION_FAILOVER_POLICY=novu_primary
```

**Verification:**
```bash
# verify DNS records
dig TXT yourdomain.com +short | grep spf
dig CNAME s1._domainkey.yourdomain.com +short

# send test email directly via SMTP (no app endpoint needed)
# using swaks (install: apt install swaks):
swaks --to your-email@gmail.com \
  --from noreply@yourdomain.com \
  --server smtp.sendgrid.net:587 \
  --auth-user apikey \
  --auth-password "SG.<your-api-key>" \
  --tls \
  --body "Sprint 15 SMTP verification test"
```

**Note**: There is no `/api/test/send-notification` endpoint in the codebase. Use `swaks` or a similar SMTP test tool to verify delivery independently of the application. Failover testing (Novu → SMTP) requires both `NOVU_API_KEY` and SMTP credentials to be set, then temporarily invalidating the Novu key.

**Verification:**
- [ ] SPF record resolves correctly
- [ ] DKIM record resolves correctly
- [ ] Test email delivered to inbox via `swaks` (not spam)
- [ ] Failover test: set invalid `NOVU_API_KEY` → app falls back to SMTP delivery
- [ ] Re-set valid `NOVU_API_KEY` → primary path resumes

**Evidence artifact**: `evidence/pr-06-smtp.md` — DNS dig output, delivered email headers, failover logs

---

### 16.7 Step 7 — Feature Flag Rollout Controls (PR-07)

**Human actions:**
1. Set production feature flag policy

**Env var to set:**
```
FEATURE_FLAGS='[{"key":"multi-approver-hitl","enabled":true},{"key":"llm-safety-pipeline","enabled":true},{"key":"burn-rate-alerting","enabled":true},{"key":"smtp-fallback","enabled":true},{"key":"workflow-crud","enabled":false},{"key":"llm-streaming-filter","enabled":false}]'
```

**Verification (requires authenticated session — use browser after SSO login):**
1. Log in via SSO (Step 1)
2. Navigate to admin panel or call from browser console:
   ```
   fetch('/api/admin/feature-flags').then(r => r.json()).then(console.log)
   ```
3. Verify response shows all flags with `source` annotation

**Alternative (staging only, dev mode with x-user-id header):**
```bash
curl -s https://<staging-url>/api/admin/feature-flags \
  -H "x-user-id: admin-user-uuid" | jq .
```

**Verification:**
- [ ] Admin endpoint returns all flags with `source` annotation
- [ ] `workflow-crud` = false (deny-by-default)
- [ ] `llm-streaming-filter` = false (deny-by-default)
- [ ] `smtp-fallback` = true (enabled after Step 6 validation)

**Evidence artifact**: `evidence/pr-07-feature-flags.md` — admin endpoint JSON response

---

### 16.8 Step 8 — Production E2E Against Real Staging (PR-08)

**Human actions:**
1. Confirm Steps 1-7 are complete with evidence
2. Deploy latest main to staging environment
3. Run E2E validation

**Golden path (browser-based, requires SSO login):**

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `https://<staging-url>` → "Sign in with Okta" | Redirect to Okta → authenticate → return to app |
| 2 | Navigate to admin panel | Prompted for TOTP (MFA step-up) |
| 3 | Enter authenticator code | Admin panel access granted |
| 4 | View `GET /api/admin/overview` | Returns `pendingHitlCount`, `activeWorkflowCount`, `sloHealth` |
| 5 | View `GET /api/admin/feature-flags` | Returns all flags matching Step 7 config |
| 6 | View `GET /api/mcp/servers` | Returns server list (may be empty if no MCP servers configured) |
| 7 | Create workflow via `POST /api/workflows` | Returns workflow with `version: 1`, `status: 'draft'` |

**Infrastructure verification (from terminal):**
```bash
# health endpoints
curl -s https://<staging-url>/health/live | jq .
curl -s https://<staging-url>/health/ready | jq .

# verify the app is running against HA database (check deployment logs for DATABASE_URL_HA)
# verify Redis is connected (check deployment logs for Upstash connections)
```

**Note**: HITL request creation and LLM completion require Inngest runtime and LLM provider keys. If not yet configured, document as known limitation and verify in a follow-up deployment.

**Verification:**
- [ ] SSO login → MFA step-up → admin access (video or screenshots)
- [ ] Admin overview endpoint returns data
- [ ] Feature flags endpoint reflects production policy
- [ ] Workflow CRUD endpoint works
- [ ] Health endpoints return `ok`
- [ ] Deployment logs confirm HA database + Redis connections

**Evidence artifact**: `evidence/pr-08-e2e.md` — golden path walkthrough with screenshots/responses

---

### 16.9 Step 9 — Game-Day Drills (PR-09)

**Prerequisites**: Steps 1-8 complete. Schedule a 1-hour window with 2+ team members.

**Drill A — Database Failover (repeat of Step 3 drill, now with full app running):**
```
1. Record start time: _____________
2. Trigger failover: Railway Console → PostgreSQL → Promote Standby
3. Monitor app health:
   while true; do curl -s https://<app-url>/health/ready | jq .status; sleep 2; done
4. Record reconnect time: _____________
5. RTO = reconnect - start = _______ seconds (target <30s)
6. Verify admin endpoints still work after failover
```

**Drill B — Application Rollback:**
```
1. Record start time: _____________
2. Deploy previous version:
   railway up
   # or use Railway dashboard → Deployments → Rollback
3. Monitor health:
   while true; do curl -s https://<app-url>/health/ready | jq .status; sleep 5; done
4. Record health-check-pass time: _____________
5. Rollback time = health-pass - start = _______ seconds (target <2min)
```

**Drill C — Incident Communication (manual):**
```
1. Compose a test incident notification email manually via SendGrid dashboard
   or use swaks (from Step 6) to send to on-call distribution list
2. Verify notification reaches on-call channel (email/Slack)
3. Record delivery time: _____________
```

**Note**: There is no `/api/admin/test-incident-notification` endpoint. Drill C uses manual email or SMTP tooling to verify the communication channel works.

**Verification:**
- [ ] Drill A executed with timestamps and RTO
- [ ] Drill B executed with timestamps and rollback duration
- [ ] Drill C executed with delivery confirmation
- [ ] Any runbook corrections identified during drills are applied

**Evidence artifact**: `evidence/pr-09-drills.md` — timestamped drill logs, corrections applied

---

### 16.10 Release Decision

Once all 9 steps have evidence artifacts:

1. Update `docs/06-sprints/sprint-15-e2e-results.md`:
   - Change **Decision** from `PENDING` to `GO`
   - Replace "simulated infrastructure" with real evidence references
2. Collect all `evidence/pr-*.md` files
3. Final sign-off by Senior Engineer + DevOps

```
[ ] PR-01 evidence reviewed: _______________  Date: ___________
[ ] PR-02 evidence reviewed: _______________  Date: ___________
[ ] PR-03 evidence reviewed: _______________  Date: ___________
[ ] PR-04 evidence reviewed: _______________  Date: ___________
[ ] PR-05 evidence reviewed: _______________  Date: ___________
[ ] PR-06 evidence reviewed: _______________  Date: ___________
[ ] PR-07 evidence reviewed: _______________  Date: ___________
[ ] PR-08 evidence reviewed: _______________  Date: ___________
[ ] PR-09 evidence reviewed: _______________  Date: ___________

Release Decision: [ ] GO  [ ] NO-GO
Signed: _________________________ Date: ___________
```

---

## **Revision History**

| Version | Date       | Author                | Changes                                                                                                                                                                                                |
| ------- | ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1.0.0  | 2025-02-18 | Abe Caymo             | Initial version                                                                                                                                                                                        |
| v1.0.1  | 2025-06-04 | Abe Caymo             | Added Result-based error reporting section                                                                                                                                                             |
| v2.0.0  | 2026-01-15 | Document Review Panel | Major rewrite: aligned with TSD v3.0.0, ADD v2.0.0; added OpenTelemetry, health checks, feature flags, container orchestration (K8s), RFC 7807 operations, severity model, RTO/RPO targets, GitOps/IaC |
| v2.1.0  | 2026-02-03 | Multi-Model Consensus | Aligned with ADD: replaced K8s with DigitalOcean App Platform, TBD environments, Build Once Deploy Many pipeline, added security scan status |
| v2.5.0  | 2026-03-18 | Platform Migration    | Migrated all infrastructure references from DigitalOcean App Platform to Railway. DO account locked; Railway chosen via multi-model consensus. Config-only migration (no infrastructure was provisioned). |
| v2.2.0  | 2026-03-04 | Documentation Review  | Fixed feature flag §2.4 to reflect Phase 1 compile-time constants; added playbooks (MCP circuit breaker, LLM failure/budget, File Storage/ClamAV, BullMQ stall, ClamAV ops); added §9 Rollback Procedures (app, DB migration, secret rotation, infrastructure, Inngest workflow, multi-component order); added §12 Vendor Escalation Contacts; added §13 DR Test Procedure; added §14 Regional SaaS Isolation Map; renumbered sections 10–11 |
| v2.3.0  | 2026-03-17 | Phase 2 Closure       | Added §15 Phase 2 Service Operations (notification failover, workflow CRUD, feature flags, consent, approval SLA, visual workflow builder) |
| v2.4.0  | 2026-03-18 | Sprint 15 Deployment  | Added §16 Sprint 15 Production Deployment Checklist — 9-step human-actionable deployment gate with env vars, verification commands, and evidence requirements |
