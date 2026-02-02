---
id: RUNBOOK-MKJP625C
title: 6.a Deployment & Operations
status: Draft
version: 1.0.0
owner: "@owner"
last_updated: "2026-01-18"
---

# 5.c Deployment & Operations

Created by: Abe Caymo
Created time: February 18, 2025 5:24 PM
Category: Engineering, Strategy doc
Last edited by: Document Review Panel
Last updated time: January 15, 2026

# **Deployment & Operations Guide**

_Outsourcing Digital Agency – Integrated Internal Systems Ecosystem_

_v2.0.0 – [January 15, 2026]_

_Aligned with: TSD v3.0.0, ADD v2.0.0, Coding Guidelines v3.0.0, Testing Strategies v2.0.0_

---

## **1. Introduction**

### 1.1 Purpose

This document is the central operational runbook for the Integrated Internal Systems Ecosystem. It defines the standard operating procedures (SOPs) for deployment, monitoring, maintenance, and incident response.

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
- **05e-Observability.md** - Detailed observability architecture

---

## **2. Deployment Process**

### 2.1 Deployment Strategy

The system uses a container-based deployment model with progressive delivery:

| Component            | Strategy                           | Rollback Time |
| -------------------- | ---------------------------------- | ------------- |
| Application Services | Blue-Green / Canary                | < 5 minutes   |
| Database Migrations  | Forward-only with rollback scripts | < 15 minutes  |
| Feature Releases     | Feature flags (instant toggle)     | Immediate     |

### 2.2 Environments

| Environment     | Branch     | Deployment     | Purpose                                           |
| --------------- | ---------- | -------------- | ------------------------------------------------- |
| **Development** | feature/\* | Manual         | Local developer environments using Docker Compose |
| **Staging**     | develop    | Automatic      | Production-like environment for final testing     |
| **Production**  | main       | Manual (gated) | Live environment after QA sign-off                |

### 2.3 Standard Deployment Checklist

#### Pre-Deployment Gates

- [ ] All CI/CD pipeline checks passed:
  - [ ] Lint & format (ESLint flat config, Prettier)
  - [ ] Type check (TypeScript strict mode)
  - [ ] Unit tests with tiered coverage (Domain 100%, Application 80%, Interface 60%)
  - [ ] Integration tests passed
  - [ ] Security scans passed:
    - [ ] SAST (CodeQL/Semgrep)
    - [ ] SCA (npm audit, Snyk)
    - [ ] Secrets scanning (TruffleHog)
    - [ ] Container image scanning (Trivy)
  - [ ] SBOM generated (CycloneDX format)
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
  - [ ] Container orchestrator dashboard
  - [ ] OpenTelemetry traces for deployment spans
- [ ] Verify health check endpoints return healthy status:
  - [ ] `/health/live` - Liveness probe
  - [ ] `/health/ready` - Readiness probe
- [ ] Perform post-deployment smoke tests on critical endpoints
- [ ] Monitor error rates and latency for 15 minutes post-deploy
- [ ] Announce deployment completion in #ops-deployments channel

#### Post-Deployment Validation

- [ ] Confirm all pods/containers are running
- [ ] Verify no spike in error rates (Sentry, OpenTelemetry)
- [ ] Check P95 response times remain < 500ms
- [ ] Validate feature flags are functioning correctly

### 2.4 Feature Flag Management

Feature flags enable safe, incremental rollouts and instant rollback without code deployment.

#### Flag Lifecycle

```
Created → Staging Test → Gradual Rollout → Full Release → Cleanup
```

#### Rollout Strategy

| Phase    | Audience        | Duration | Success Criteria            |
| -------- | --------------- | -------- | --------------------------- |
| Canary   | 1% of traffic   | 1 hour   | No error spike, P95 < 500ms |
| Limited  | 10% of traffic  | 4 hours  | Error rate < 0.1%           |
| Expanded | 50% of traffic  | 24 hours | No degradation              |
| Full     | 100% of traffic | -        | Stable for 1 week           |

#### Flag Operations

```bash
# enable feature for percentage of users
aptivo-cli feature enable user-dashboard-v2 --percent 10

# disable feature immediately (emergency)
aptivo-cli feature disable user-dashboard-v2 --immediate

# check flag status
aptivo-cli feature status user-dashboard-v2
```

---

## **3. Container Orchestration & Infrastructure**

### 3.1 Production Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer                            │
│                    (Traefik Ingress)                            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                   Kubernetes Cluster                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ App Pod 1   │  │ App Pod 2   │  │ App Pod N   │             │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │             │
│  │ │ App     │ │  │ │ App     │ │  │ │ App     │ │             │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │             │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │             │
│  │ │ OTel    │ │  │ │ OTel    │ │  │ │ OTel    │ │             │
│  │ │ Sidecar │ │  │ │ Sidecar │ │  │ │ Sidecar │ │             │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  PostgreSQL   │ │    Redis      │ │    Minio      │
│  (Managed)    │ │   (Cluster)   │ │   (Cluster)   │
└───────────────┘ └───────────────┘ └───────────────┘
```

### 3.2 Resource Specifications

| Service            | vCPUs | RAM   | Storage   | Scaling             | Notes                          |
| ------------------ | ----- | ----- | --------- | ------------------- | ------------------------------ |
| **App Services**   | 2-4   | 4-8GB | 50GB SSD  | HPA (2-10 replicas) | CPU > 70% triggers scale       |
| **PostgreSQL**     | 4     | 16GB  | 500GB SSD | Vertical            | Managed service (RDS/CloudSQL) |
| **Redis**          | 2     | 4GB   | -         | Cluster (3 nodes)   | In-memory caching              |
| **Minio**          | 2     | 8GB   | 1TB       | Cluster (4 nodes)   | S3-compatible object storage   |
| **OTel Collector** | 1     | 2GB   | 10GB      | DaemonSet           | One per node                   |

### 3.3 Kubernetes Deployment Configuration

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aptivo-app
  labels:
    app: aptivo
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: aptivo
  template:
    metadata:
      labels:
        app: aptivo
    spec:
      containers:
        - name: app
          image: registry.aptivo.com/app:${VERSION}
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
          envFrom:
            - secretRef:
                name: aptivo-secrets
            - configMapRef:
                name: aptivo-config
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2000m"
              memory: "4Gi"
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 0
            periodSeconds: 5
            failureThreshold: 30
```

### 3.4 Horizontal Pod Autoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: aptivo-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: aptivo-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

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
    NATS_URL: z.string().url(),
    AUTH_ISSUER: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url(),
    SENTRY_DSN: z.string().url(),
    FEATURE_FLAG_API_KEY: z.string().min(1),
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

1. Kubernetes Secrets (for sensitive values)
2. Kubernetes ConfigMaps (for non-sensitive config)
3. Environment variables in container spec
4. `.env` file (development only)

### 4.3 Secrets Management

All secrets must be managed through a secrets manager:

| Secret Type          | Storage                               | Rotation              |
| -------------------- | ------------------------------------- | --------------------- |
| Database credentials | HashiCorp Vault / AWS Secrets Manager | 90 days               |
| API keys             | HashiCorp Vault / AWS Secrets Manager | 90 days               |
| JWT signing keys     | HashiCorp Vault / AWS Secrets Manager | 180 days              |
| TLS certificates     | cert-manager (auto-renewal)           | 30 days before expiry |

```bash
# example: create secret in Kubernetes from Vault
vault kv get -format=json secret/aptivo/database | \
  jq -r '.data.data | to_entries | map("\(.key)=\(.value)") | .[]' | \
  kubectl create secret generic aptivo-db-credentials --from-env-file=/dev/stdin
```

---

## **5. Observability & Monitoring**

### 5.1 OpenTelemetry Architecture

All services emit telemetry via OpenTelemetry SDK, collected by OTel Collector sidecars.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Application │────▶│    OTel     │────▶│   Backend   │
│   (SDK)     │     │  Collector  │     │  (Jaeger/   │
│             │     │  (Sidecar)  │     │  Prometheus)│
└─────────────┘     └─────────────┘     └─────────────┘
      │                                        │
      │         Traces, Metrics, Logs          │
      └────────────────────────────────────────┘
```

### 5.2 Key Metrics & Alerts

| Metric                       | Tool            | Threshold          | Alert             | Recipient       |
| ---------------------------- | --------------- | ------------------ | ----------------- | --------------- |
| **API P95 Response Time**    | Prometheus/OTel | > 500ms for 5 min  | PagerDuty P2      | On-Call SRE     |
| **HTTP 5xx Error Rate**      | Prometheus/OTel | > 1% over 5 min    | PagerDuty P1      | On-Call SRE     |
| **HTTP 4xx Error Rate**      | Prometheus/OTel | > 5% over 10 min   | Slack #ops-alerts | DevOps Team     |
| **CPU Utilization**          | Prometheus      | > 80% for 10 min   | Slack #ops-alerts | DevOps Team     |
| **Memory Utilization**       | Prometheus      | > 85% for 10 min   | PagerDuty P2      | On-Call SRE     |
| **Database Connections**     | Prometheus      | > 80% of max       | PagerDuty P2      | On-Call SRE     |
| **Database Replication Lag** | Prometheus      | > 30 seconds       | PagerDuty P1      | On-Call SRE     |
| **Health Check Failures**    | Kubernetes      | Pod unhealthy 3x   | PagerDuty P1      | On-Call SRE     |
| **Application Errors**       | Sentry/OTel     | New error type     | Slack #ops-errors | On-Call Support |
| **Feature Flag Errors**      | Custom metric   | Any toggle failure | Slack #ops-alerts | DevOps Team     |

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
    nats: "up" | "down";
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

- **Collection:** Fluent Bit DaemonSet on each node
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

```mermaid
graph LR
    A[Push/PR] --> B[Lint & Type Check]
    B --> C[Unit Tests]
    C --> D[Integration Tests]
    D --> E[Security Scans]
    E --> F[Build & Push Image]
    F --> G{Branch?}
    G -->|develop| H[Deploy Staging]
    H --> I[E2E Tests]
    I --> J[Performance Tests]
    G -->|main| K[Deploy Production]
    K --> L[Smoke Tests]
    L --> M[Monitor 15min]
```

### 6.2 Security Scan Requirements

| Scan Type     | Tool                  | Failure Threshold   | Frequency            |
| ------------- | --------------------- | ------------------- | -------------------- |
| **SAST**      | CodeQL / Semgrep      | Any high/critical   | Every PR             |
| **SCA**       | npm audit / Snyk      | Any high/critical   | Every PR             |
| **Secrets**   | TruffleHog / GitLeaks | Any detected secret | Every commit         |
| **Container** | Trivy                 | Any critical CVE    | Before registry push |
| **SBOM**      | Syft / CycloneDX      | Generate always     | Every release        |

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
- [ ] Test feature flag toggles in staging
- [ ] Review and clean up old feature flags (> 30 days enabled)

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

1. **Check managed service status** (RDS/CloudSQL dashboard)
2. **Assess scope:** Primary failure vs replication issue
3. **Page DBA** if not already notified

**Automated Failover (if enabled):**

- Managed database services handle automatic failover
- Application reconnects automatically via connection pooler

**Manual Failover (if required):**

1. Promote standby to primary
2. Update connection strings (via Kubernetes secret update)
3. Restart application pods to pick up new connection

**Recovery Validation:**

1. Verify database connectivity from all services
2. Check replication is re-established
3. Verify no data loss (compare transaction logs)

### 8.6 Playbook 3: Regional Disaster Recovery

**Trigger:** Complete regional outage or declared disaster

**RTO Target:** < 4 hours
**RPO Target:** < 1 hour

**Pre-Requisites:**

- [ ] Secondary region infrastructure provisioned
- [ ] Database replication to secondary region active
- [ ] DNS failover configured (Route53/CloudFlare)
- [ ] Runbook tested quarterly

**Recovery Steps:**

1. **Declare disaster** - Notify management, create incident channel
2. **Verify secondary region** - Confirm infrastructure is healthy
3. **Promote database replica** - Make secondary region primary
4. **Update DNS** - Point traffic to secondary region
5. **Verify services** - Run smoke tests against secondary
6. **Communicate** - Update status page, notify stakeholders
7. **Monitor** - Watch for issues in new primary region

**Failback Process (after primary recovery):**

1. Re-establish replication from new primary to original region
2. Plan maintenance window for failback
3. Execute reverse of recovery steps
4. Update runbook with lessons learned

---

## **9. Infrastructure as Code**

### 9.1 GitOps Workflow

All infrastructure changes follow GitOps principles:

```
Developer PR → Review → Merge → ArgoCD Sync → Apply to Cluster
```

### 9.2 Infrastructure Repository Structure

```
infrastructure/
├── terraform/
│   ├── modules/
│   │   ├── kubernetes/
│   │   ├── database/
│   │   ├── networking/
│   │   └── observability/
│   ├── environments/
│   │   ├── staging/
│   │   │   └── main.tf
│   │   └── production/
│   │       └── main.tf
│   └── backend.tf
├── kubernetes/
│   ├── base/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── hpa.yaml
│   └── overlays/
│       ├── staging/
│       └── production/
└── argocd/
    └── applications/
```

### 9.3 Drift Detection

Terraform drift detection runs daily:

```bash
# automated drift check (runs in CI)
terraform plan -detailed-exitcode

# exit codes:
# 0 = no changes
# 1 = error
# 2 = changes detected (drift)
```

Drift alerts are sent to #ops-infrastructure channel with detailed diff.

---

## **10. Roles & Responsibilities (RACI Matrix)**

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

## **Revision History**

| Version | Date       | Author                | Changes                                                                                                                                                                                                |
| ------- | ---------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1.0.0  | 2025-02-18 | Abe Caymo             | Initial version                                                                                                                                                                                        |
| v1.0.1  | 2025-06-04 | Abe Caymo             | Added Result-based error reporting section                                                                                                                                                             |
| v2.0.0  | 2026-01-15 | Document Review Panel | Major rewrite: aligned with TSD v3.0.0, ADD v2.0.0; added OpenTelemetry, health checks, feature flags, container orchestration (K8s), RFC 7807 operations, severity model, RTO/RPO targets, GitOps/IaC |
