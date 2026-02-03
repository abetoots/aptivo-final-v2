---
id: TSD-CORE-OBSERVABILITY
title: Observability Implementation Checklist
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
parent: ../03-architecture/platform-core-add.md
---
# Observability Implementation Checklist
**Full Guide:** [05d-Observability.md](../05-guidelines/05d-Observability.md)

*v2.0.0 – January 15, 2026*

---

This document serves as a quick reference checklist for implementing observability. For complete architecture, patterns, and code examples, see **[05d-Observability.md](../05-guidelines/05d-Observability.md)**.

---

## 1. Four Pillars Checklist

| Pillar | Required | Tool | Verification |
|--------|----------|------|--------------|
| **Logs** | ✅ | Pino → Loki | `curl -s localhost:3000/api/health \| jq .` shows JSON |
| **Metrics** | ✅ | prom-client → Prometheus | `curl localhost:3000/metrics` returns metrics |
| **Traces** | ✅ | OTel SDK → Jaeger | Jaeger UI shows service spans |
| **Errors** | ✅ | Sentry | Sentry dashboard shows errors |

---

## 2. Logging Requirements

### 2.1 Required Log Fields

```typescript
// every log entry MUST include:
interface RequiredLogFields {
  timestamp: string;        // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  service: string;
  version: string;
  traceId?: string;         // from OTel active span
  spanId?: string;          // from OTel active span
}
```

### 2.2 Logging Checklist

- [ ] Use Pino with `mixin` for automatic trace context injection
- [ ] Configure redaction for sensitive fields: `password`, `token`, `secret`, `authorization`, `cookie`
- [ ] Set log level via `LOG_LEVEL` environment variable
- [ ] Include service name and version in base config
- [ ] Never log PII (names, emails, addresses) - use IDs instead

**See:** [05d-Observability.md Section 5](../05-guidelines/05d-Observability.md#5-structured-logging) for full implementation.

---

## 3. Metrics Requirements

### 3.1 Required Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `http_request_duration_seconds` | Histogram | method, route, status_code | Latency SLO |
| `http_requests_total` | Counter | method, route, status_code | Error rate SLO |
| `aptivo_result_errors_total` | Counter | operation, error_tag, module | Functional errors |
| `aptivo_candidates_created_total` | Counter | source, module | Business metric |
| `aptivo_active_workflows` | Gauge | workflow_type | Capacity metric |

### 3.2 Metrics Checklist

- [ ] Use `prom-client` with shared Registry
- [ ] Collect default Node.js metrics (`collectDefaultMetrics`)
- [ ] Expose metrics at `/metrics` endpoint
- [ ] Use histogram buckets: `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`
- [ ] Never filter `.*_bucket` metrics (breaks P95/P99)
- [ ] Increment `aptivo_result_errors_total` on every `Result.Err`

**See:** [05d-Observability.md Section 3](../05-guidelines/05d-Observability.md#3-metrics-implementation) for full implementation.

---

## 4. Distributed Tracing Requirements

### 4.1 Tracing Checklist

- [ ] Bootstrap OTel SDK in `instrumentation.ts`
- [ ] Configure service name, version, and namespace
- [ ] Enable auto-instrumentations (HTTP, pg, Redis)
- [ ] Ignore health/metrics endpoints in HTTP instrumentation
- [ ] Wrap `ReaderResult` operations with `traceReaderResult`
- [ ] Propagate context in NATS messages

### 4.2 Sampling Policy

| Environment | Strategy | Rate |
|-------------|----------|------|
| Development | Head-based | 100% |
| Staging | Head-based | 100% |
| Production | Tail-based | 10% + all errors + all slow (>500ms) |

**See:** [05d-Observability.md Section 4](../05-guidelines/05d-Observability.md#4-distributed-tracing) for full implementation.

---

## 5. Error Tracking Requirements

### 5.1 Sentry Checklist

- [ ] Initialize Sentry with DSN, environment, release
- [ ] Configure `beforeSend` to filter PII
- [ ] Set `ignoreErrors` for expected errors (NotFoundError, ValidationError)
- [ ] Report all `Result.Err` to Sentry with `errorType` tag
- [ ] Include operation and module context in error reports

### 5.2 Result Error Pattern

```typescript
// ALWAYS report Result.Err to Sentry
if (!result.success) {
  reportResultError(result.error, {
    operation: 'operationName',
    module: 'moduleName',
    input: sanitizedInput,
  });
}
```

**See:** [05d-Observability.md Section 6](../05-guidelines/05d-Observability.md#6-error-tracking-sentry) for full implementation.

---

## 6. Alerting Requirements

### 6.1 Required Alerts

| Alert | Threshold | Severity |
|-------|-----------|----------|
| HighErrorRate | 5xx rate > 1% for 5m | Critical |
| HighLatency | P95 > 500ms for 5m | Warning |
| DatabaseConnectionsHigh | > 80% pool usage | Warning |
| NewResultErrorType | New error_tag detected | Info |

### 6.2 Alert Routing

| Severity | Channel |
|----------|---------|
| Critical | PagerDuty P1 |
| Warning | Slack #ops-alerts |
| Info | Slack #ops-errors |

**See:** [05d-Observability.md Section 9](../05-guidelines/05d-Observability.md#9-alerting-configuration) for full implementation.

---

## 7. Audit Logging Requirements

### 7.1 Audit Events

| Event | Retention |
|-------|-----------|
| User login | 2 years |
| Data access (PII) | 2 years |
| Data modification | 7 years |
| Permission change | 7 years |
| Data export | 7 years |

### 7.2 Audit Checklist

- [ ] Write audit events to separate PostgreSQL table
- [ ] Use ULID for audit event IDs (ordered)
- [ ] Include actor (id, email, ip, userAgent)
- [ ] Include resource (type, id)
- [ ] Include changes (before/after) for modifications
- [ ] Never delete audit records

**See:** [05d-Observability.md Section 12](../05-guidelines/05d-Observability.md#12-audit-logging) for full implementation.

---

## 8. Security Checklist

### 8.1 Data Classification

| Data | Allowed in Telemetry |
|------|---------------------|
| Request IDs, trace IDs | ✅ Yes |
| User IDs (hashed) | ✅ Yes |
| Error messages | ✅ Yes (sanitized) |
| Passwords, tokens | ❌ Never |
| PII (names, emails) | ❌ Never |
| Authorization headers | ❌ Never |

### 8.2 Security Checklist

- [ ] Never capture Authorization, Cookie headers in traces
- [ ] Redact sensitive fields in Pino config
- [ ] Filter PII in Sentry beforeSend
- [ ] Hash user IDs before logging
- [ ] Review telemetry data for PII leakage

**See:** [05d-Observability.md Section 11](../05-guidelines/05d-Observability.md#11-security--privacy) for full implementation.

---

## 9. Deployment Verification

### 9.1 Pre-Deployment

- [ ] OTel Collector sidecar configured
- [ ] `/metrics` endpoint accessible
- [ ] `/health/live` and `/health/ready` endpoints working
- [ ] Sentry DSN configured
- [ ] Environment variables set (OTEL_EXPORTER_OTLP_ENDPOINT, LOG_LEVEL)

### 9.2 Post-Deployment

- [ ] Verify traces appear in Jaeger
- [ ] Verify metrics scraped by Prometheus
- [ ] Verify logs appear in Loki
- [ ] Verify errors appear in Sentry
- [ ] Check P95 latency < 500ms
- [ ] Check 5xx rate < 1%

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0.0 | 2025-02-18 | Abe Caymo | Initial version |
| v2.0.0 | 2026-01-15 | Document Review Panel | Converted to implementation checklist, added cross-references to 05d-Observability.md |

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Observability requirements | [platform-core-frd.md](../../02-requirements/platform-core-frd.md) | Section 7 (Observability) |
| SLO definitions | [platform-core-add.md](../../03-architecture/platform-core-add.md) | Section 8 (Observability Architecture) |
| Audit log requirements | [platform-core-frd.md](../../02-requirements/platform-core-frd.md) | Section 7.4 |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Full observability guide | [05d-Observability.md](../05-guidelines/05d-Observability.md) | All Sections |
| Alert response procedures | [01-runbook.md](../06-operations/01-runbook.md) | Incident Response |
