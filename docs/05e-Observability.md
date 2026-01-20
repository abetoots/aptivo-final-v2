---
title: Observability Architecture & Implementation
service: Cross-cutting
stack:
  - OpenTelemetry
  - Prometheus
  - Grafana
  - Jaeger
  - Pino
pattern:
  - Distributed Tracing
  - Metrics
  - Structured Logging
audience:
  - Backend Dev
  - DevOps
  - SRE
status: Draft
id: UNKNOWN-MKJP625B
version: 1.0.0
owner: '@owner'
last_updated: '2026-01-18'
---

# 5.e Observability Architecture

*Outsourcing Digital Agency – Integrated Internal Systems Ecosystem*

*v2.0.1 – [January 15, 2026]*

*Aligned with: ADD v2.0.0, TSD v3.0.0, Coding Guidelines v3.0.0, Testing Strategies v2.0.0, Deployment Operations v2.0.0, Change Management v2.0.0*

---

## 1. Introduction

### 1.1 Purpose
This document defines the observability strategy for the Integrated Internal Systems Ecosystem. It establishes standards for the three pillars of observability—**logs**, **metrics**, and **traces**—using OpenTelemetry (OTel) as the unified collection framework.

### 1.2 Observability Goals
1. **Detect issues** before users report them (proactive monitoring)
2. **Diagnose problems** quickly with correlated telemetry (MTTR < 1 hour)
3. **Validate deployments** automatically using metrics (P95 < 500ms)
4. **Support risk monitoring** with real-time dashboards (Change Management v2.0.0)

### 1.3 Related Documents
- **ADD v2.0.0** - Section 8: Observability Architecture requirements
- **[specs/observability.md](04-specs/observability.md)** - Implementation checklist (quick reference)
- **Coding Guidelines v3.0.0** - Section 6: Observability integration, ReaderResult wrapper
- **Testing Strategies v2.0.0** - Performance testing with P95 < 500ms targets
- **Deployment Operations v2.0.0** - Metrics/alerts table, health checks, OTel sidecars
- **Change Management v2.0.0** - Risk monitoring dashboards, validation queries

---

## 2. Architecture Overview

### 2.1 Four Pillars of Observability

| Pillar | Tool | Purpose | Backend |
|--------|------|---------|---------|
| **Logs** | Pino + Fluent Bit | Structured application logs with trace correlation | Loki |
| **Metrics** | prom-client + OTel | Application and infrastructure metrics | Prometheus |
| **Traces** | OpenTelemetry SDK | Distributed request tracing | Jaeger |
| **Errors** | Sentry | Exception aggregation and alerting | Sentry Cloud |

### 2.2 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application Layer                               │
├─────────────┬─────────────┬─────────────┬─────────────┬─────────────────────┤
│   Traefik   │  Next.js    │  Next.js    │    NATS     │    PostgreSQL       │
│  (Gateway)  │  (App 1)    │  (App N)    │ (Messaging) │    (Database)       │
└──────┬──────┴──────┬──────┴──────┬──────┴──────┬──────┴──────────┬──────────┘
       │             │             │             │                  │
       │ traces      │ traces      │ traces      │ traces           │ metrics
       │ metrics     │ metrics     │ metrics     │                  │
       │             │ logs        │ logs        │                  │
       ▼             ▼             ▼             ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OTel Collector (Sidecar per Pod)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                          │
│  │  Receivers  │─▶│ Processors  │─▶│  Exporters  │                          │
│  │ OTLP, Prom  │  │ Batch, Attr │  │ Prom, Jaeger│                          │
│  └─────────────┘  └─────────────┘  └─────────────┘                          │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│  Prometheus   │           │    Jaeger     │           │     Loki      │
│   (Metrics)   │           │   (Traces)    │           │    (Logs)     │
└───────┬───────┘           └───────┬───────┘           └───────┬───────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    ▼
                          ┌───────────────────┐
                          │     Grafana       │
                          │   (Dashboards)    │
                          │   (Alerting)      │
                          └───────────────────┘
```

### 2.3 Sidecar Pattern

Per **Deployment Operations v2.0.0**, each application pod includes an OTel Collector sidecar:

```yaml
# k8s/deployment.yaml (excerpt)
spec:
  template:
    spec:
      containers:
        - name: app
          image: registry.aptivo.com/app:${VERSION}
          # ... app config
        - name: otel-collector
          image: otel/opentelemetry-collector-contrib:0.96.0
          args: ["--config=/etc/otel-collector-config.yaml"]
          volumeMounts:
            - name: otel-config
              mountPath: /etc/otel-collector-config.yaml
              subPath: otel-collector-config.yaml
```

**Why Sidecars?**
- Lower network latency for telemetry
- Isolation: collector failure doesn't affect other pods
- Simplified configuration per service
- Better resource management

---

## 3. Metrics Implementation

### 3.1 Application Metrics with prom-client

All services expose metrics via the Prometheus client library:

```typescript
// lib/observability/metrics.ts
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// create a registry for this service
export const metricsRegistry = new Registry();

// collect Node.js default metrics (CPU, memory, event loop)
collectDefaultMetrics({ register: metricsRegistry });

// HTTP request metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

// Business metrics
export const candidatesCreatedTotal = new Counter({
  name: 'aptivo_candidates_created_total',
  help: 'Total number of candidates created',
  labelNames: ['source', 'module'],
  registers: [metricsRegistry],
});

export const activeWorkflowsGauge = new Gauge({
  name: 'aptivo_active_workflows',
  help: 'Number of currently active workflows',
  labelNames: ['workflow_type'],
  registers: [metricsRegistry],
});

// Result type error metrics (per Coding Guidelines v3.0.0)
export const resultErrorsTotal = new Counter({
  name: 'aptivo_result_errors_total',
  help: 'Total Result.Err occurrences by error tag',
  labelNames: ['operation', 'error_tag', 'module'],
  registers: [metricsRegistry],
});
```

### 3.2 Metrics Endpoint

Expose metrics at `/metrics` for Prometheus scraping:

```typescript
// app/api/metrics/route.ts
import { NextResponse } from 'next/server';
import { metricsRegistry } from '@/lib/observability/metrics';

export async function GET() {
  const metrics = await metricsRegistry.metrics();
  return new NextResponse(metrics, {
    headers: {
      'Content-Type': metricsRegistry.contentType,
    },
  });
}
```

### 3.3 HTTP Middleware for Metrics

```typescript
// middleware/metrics.ts
import { NextRequest, NextResponse } from 'next/server';
import { httpRequestDuration, httpRequestsTotal } from '@/lib/observability/metrics';

export async function metricsMiddleware(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const start = performance.now();
  const route = request.nextUrl.pathname;
  const method = request.method;

  try {
    const response = await handler();
    const duration = (performance.now() - start) / 1000;
    const statusCode = response.status.toString();

    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpRequestsTotal.inc({ method, route, status_code: statusCode });

    return response;
  } catch (error) {
    httpRequestsTotal.inc({ method, route, status_code: '500' });
    throw error;
  }
}
```

### 3.4 Key Metrics Reference

Per **Deployment Operations v2.0.0**, these metrics power alerts:

| Metric | Type | Labels | Alert Threshold |
|--------|------|--------|-----------------|
| `http_request_duration_seconds` | Histogram | method, route, status_code | P95 > 500ms |
| `http_requests_total` | Counter | method, route, status_code | 5xx rate > 1% |
| `aptivo_result_errors_total` | Counter | operation, error_tag, module | New error type |
| `pg_stat_activity_count` | Gauge | state | > 80% of max |
| `nodejs_heap_size_used_bytes` | Gauge | - | > 85% of limit |

---

## 4. Distributed Tracing

### 4.1 OpenTelemetry SDK Setup

Use the shared Node.js SDK bootstrap pattern from **Coding Guidelines v3.0.0**:

```typescript
// lib/observability/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { env } from '@/lib/env';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: env.SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: env.npm_package_version,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: env.NODE_ENV,
    'service.namespace': 'aptivo',
  }),
  traceExporter: new OTLPTraceExporter({
    url: env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // enable HTTP, Express, pg, and other auto-instrumentations
      '@opentelemetry/instrumentation-fs': { enabled: false }, // disable noisy fs
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingPaths: ['/health/live', '/health/ready', '/metrics'],
      },
    }),
  ],
});

sdk.start();

// graceful shutdown
process.on('SIGTERM', () => {
  sdk.shutdown().then(() => process.exit(0));
});
```

### 4.2 Next.js Instrumentation

```typescript
// instrumentation.ts (Next.js 15.x - no experimental flag needed)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/observability/tracing');
  }
}
```

```javascript
// next.config.js
module.exports = {
  // instrumentationHook is stable in Next.js 15.x
  // no experimental flag required
};
```

### 4.3 ReaderResult Span Wrapper

Per **Coding Guidelines v3.0.0**, wrap ReaderResult operations with spans:

```typescript
// lib/observability/traced-reader-result.ts
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { Result, ReaderResult } from '@/lib/functional/result';
import { resultErrorsTotal } from './metrics';

const tracer = trace.getTracer('aptivo-app');

export function traceReaderResult<D, T, E extends { _tag: string }>(
  name: string,
  operation: ReaderResult<D, T, E>
): ReaderResult<D, T, E> {
  return (deps: D) =>
    tracer.startActiveSpan(
      name,
      { kind: SpanKind.INTERNAL },
      async (span) => {
        try {
          const result = await operation(deps);

          if (result.success) {
            span.setStatus({ code: SpanStatusCode.OK });
          } else {
            // record error in span
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: result.error._tag,
            });
            span.setAttribute('error.tag', result.error._tag);

            // increment error metric
            resultErrorsTotal.inc({
              operation: name,
              error_tag: result.error._tag,
              module: 'unknown', // override in caller if needed
            });
          }

          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      }
    );
}
```

### 4.4 Traefik Gateway Tracing

```yaml
# traefik.yml (Traefik 3.x)
tracing:
  serviceName: "api-gateway"
  sampleRate: 1.0  # 100% in dev/staging, reduce in production
  addInternals: true

  otlp:
    grpc:
      endpoint: "otel-collector:4317"
      insecure: true

  # SECURITY: only capture safe headers - NEVER capture Authorization
  capturedRequestHeaders:
    - X-Request-ID
    - X-Correlation-ID

  capturedResponseHeaders:
    - X-Response-Time
```

> **SECURITY WARNING**: Never capture `Authorization`, `Cookie`, or other sensitive headers in traces. This leaks credentials to the observability backend.

### 4.5 NATS Messaging Tracing

Use auto-instrumentation for NATS when available, or wrap with context propagation:

```typescript
// lib/observability/nats-tracing.ts
import { context, propagation, trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { NatsConnection, Msg, MsgHdrs } from 'nats';

const tracer = trace.getTracer('nats');

export function createTracedPublish(nats: NatsConnection) {
  return async (subject: string, data: unknown, headers?: MsgHdrs) => {
    return tracer.startActiveSpan(
      `NATS SEND ${subject}`,
      { kind: SpanKind.PRODUCER, attributes: { 'messaging.system': 'nats', 'messaging.destination': subject } },
      async (span) => {
        const hdrs = headers ?? nats.headers();
        propagation.inject(context.active(), hdrs);

        try {
          nats.publish(subject, JSON.stringify(data), { headers: hdrs });
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      }
    );
  };
}

export function wrapMessageHandler(
  subject: string,
  handler: (msg: Msg) => Promise<void>
): (err: Error | null, msg: Msg) => void {
  return async (err, msg) => {
    if (err) return;

    const parentContext = propagation.extract(context.active(), msg.headers);

    await context.with(parentContext, async () => {
      const span = tracer.startSpan(`NATS RECEIVE ${subject}`, {
        kind: SpanKind.CONSUMER,
        attributes: { 'messaging.system': 'nats', 'messaging.destination': subject },
      });

      try {
        await handler(msg);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  };
}
```

---

## 5. Structured Logging

### 5.1 Pino Configuration with OpenTelemetry

Per **TSD v3.0.0**, use Pino with automatic trace context injection:

```typescript
// lib/observability/logger.ts
import pino from 'pino';
import { trace } from '@opentelemetry/api';
import { env } from '@/lib/env';

// custom mixin to inject trace context into every log
const traceMixin = () => {
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags,
    };
  }
  return {};
};

export const logger = pino({
  level: env.LOG_LEVEL || 'info',
  mixin: traceMixin,
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: env.SERVICE_NAME,
    version: env.npm_package_version,
    environment: env.NODE_ENV,
  },
  // redact sensitive fields
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'secret'],
    censor: '[REDACTED]',
  },
});
```

### 5.2 Structured Log Format

All logs are JSON with consistent structure:

```json
{
  "level": "info",
  "time": 1705334400000,
  "service": "candidate-service",
  "version": "1.2.0",
  "environment": "production",
  "traceId": "abc123def456789",
  "spanId": "xyz987654321",
  "msg": "Candidate created successfully",
  "candidateId": "uuid-here",
  "source": "web-form"
}
```

### 5.3 Log Collection with Fluent Bit

Logs are collected from stdout by Fluent Bit and forwarded to Loki:

```yaml
# k8s/fluent-bit-config.yaml
[INPUT]
    Name              tail
    Path              /var/log/containers/*.log
    Parser            docker
    Tag               kube.*
    Mem_Buf_Limit     5MB
    Skip_Long_Lines   On

[FILTER]
    Name              kubernetes
    Match             kube.*
    Merge_Log         On
    Keep_Log          Off
    K8S-Logging.Parser On

[OUTPUT]
    Name              loki
    Match             *
    Host              loki.monitoring.svc.cluster.local
    Port              3100
    Labels            job=fluent-bit, namespace=$kubernetes['namespace_name'], pod=$kubernetes['pod_name']
```

### 5.4 Log Levels & Usage

| Level | Usage | Example |
|-------|-------|---------|
| `error` | Unrecoverable errors, exceptions | Database connection failed |
| `warn` | Recoverable issues, degraded state | Retry succeeded after failure |
| `info` | Business events, state changes | Candidate created, workflow started |
| `debug` | Detailed debugging (dev only) | Request payload, query results |
| `trace` | Fine-grained tracing (dev only) | Function entry/exit |

---

## 6. Error Tracking (Sentry)

Error tracking provides exception visibility beyond what logs and traces capture. Sentry aggregates, deduplicates, and alerts on application errors.

### 6.1 Sentry Configuration

```typescript
// lib/observability/sentry.ts
import * as Sentry from '@sentry/nextjs';
import { env } from '@/lib/env';

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  release: `${env.SERVICE_NAME}@${env.npm_package_version}`,

  // sample rate (traces handled by OTel, this is for error sampling)
  tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // filter sensitive data before sending
  beforeSend(event) {
    if (event.request?.data) {
      delete event.request.data.password;
      delete event.request.data.token;
      delete event.request.data.authorization;
    }
    return event;
  },

  // ignore expected/handled errors
  ignoreErrors: [
    'NotFoundError',
    'ValidationError',
    'AbortError',
    'NEXT_NOT_FOUND', // Next.js notFound() calls
  ],
});
```

### 6.2 Result Error Capture

Per **Coding Guidelines v3.0.0** and **Deployment Operations v2.0.0**, always report `Result.Err` to Sentry:

```typescript
// lib/observability/error-reporting.ts
import * as Sentry from '@sentry/nextjs';
import { logger } from './logger';
import { resultErrorsTotal } from './metrics';

export function reportResultError<E extends { _tag: string; message: string }>(
  error: E,
  context: { operation: string; module: string; input?: unknown }
): void {
  // create a trackable error for Sentry
  const trackableError = new Error(`[${error._tag}] ${error.message}`);
  trackableError.name = error._tag;

  Sentry.withScope((scope) => {
    scope.setTags({
      errorType: error._tag,
      operation: context.operation,
      module: context.module,
    });
    if (context.input) {
      scope.setExtra('input', sanitizeForLogging(context.input));
    }
    Sentry.captureException(trackableError);
  });

  // increment metric
  resultErrorsTotal.inc({
    operation: context.operation,
    error_tag: error._tag,
    module: context.module,
  });

  // log for correlation
  logger.error({ err: trackableError, ...context }, `Result error: ${error._tag}`);
}

function sanitizeForLogging(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const sanitized = { ...input } as Record<string, unknown>;
  const sensitiveKeys = ['password', 'token', 'secret', 'authorization'];
  for (const key of sensitiveKeys) {
    if (key in sanitized) sanitized[key] = '[REDACTED]';
  }
  return sanitized;
}
```

### 6.3 Usage in Handlers

```typescript
// example: API route handler
export async function POST(request: Request) {
  const result = await createCandidate(input)(deps);

  if (!result.success) {
    reportResultError(result.error, {
      operation: 'createCandidate',
      module: 'candidates',
      input,
    });
    return mapErrorToHttpResponse(result.error);
  }

  return NextResponse.json(result.value, { status: 201 });
}
```

---

## 7. OpenTelemetry Collector Configuration

### 7.1 Sidecar Collector Config

```yaml
# config/otel-collector-sidecar.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

  prometheus:
    config:
      scrape_configs:
        - job_name: 'app-metrics'
          scrape_interval: 15s
          static_configs:
            - targets: ['localhost:3000']  # app metrics endpoint

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

  attributes:
    actions:
      - key: environment
        value: ${ENVIRONMENT}
        action: upsert

  resource:
    attributes:
      - key: service.namespace
        value: aptivo
        action: insert

  # tail-based sampling for production
  tail_sampling:
    decision_wait: 10s
    num_traces: 100000
    policies:
      - name: errors-always
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: slow-traces
        type: latency
        latency:
          threshold_ms: 500
      - name: probabilistic-sample
        type: probabilistic
        probabilistic:
          sampling_percentage: 10

exporters:
  otlp/jaeger:
    endpoint: "jaeger-collector.monitoring.svc.cluster.local:4317"
    tls:
      insecure: true

  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: aptivo
    send_timestamps: true

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, attributes, resource, tail_sampling]
      exporters: [otlp/jaeger]

    metrics:
      receivers: [otlp, prometheus]
      processors: [batch, attributes, resource]
      exporters: [prometheus]
```

### 7.2 Sampling Strategy

| Environment | Strategy | Rate | Rationale |
|-------------|----------|------|-----------|
| Development | Head-based | 100% | Full visibility for debugging |
| Staging | Head-based | 100% | Catch issues before production |
| Production | Tail-based | 10% + all errors | Balance cost vs visibility |

**Tail-based sampling** ensures:
- All error traces are captured (100%)
- All slow traces (> 500ms) are captured (100%)
- 10% random sample of successful traces

---

## 8. Grafana Dashboards

### 8.1 Standard Dashboards

| Dashboard | Purpose | Key Panels |
|-----------|---------|------------|
| **Service Overview** | Health at a glance | Request rate, error rate, P95 latency |
| **API Performance** | Endpoint analysis | Latency by route, status code distribution |
| **Database** | PostgreSQL health | Connections, query latency, replication lag |
| **NATS Messaging** | Message flow | Publish/subscribe rates, consumer lag |
| **Business Metrics** | Domain KPIs | Candidates created, workflows completed |
| **Risk Monitoring** | Change Management | Risk dashboard links, validation queries |

### 8.2 Post-Deployment Validation Dashboard

Per **Change Management v2.0.0**, this dashboard validates deployments:

```json
{
  "title": "Post-Deployment Validation",
  "panels": [
    {
      "title": "Error Rate (5xx)",
      "type": "timeseries",
      "targets": [{
        "expr": "sum(rate(http_requests_total{status_code=~\"5..\"}[5m])) / sum(rate(http_requests_total[5m]))",
        "legendFormat": "5xx rate"
      }],
      "thresholds": [{ "value": 0.01, "color": "red" }]
    },
    {
      "title": "P95 Response Time",
      "type": "timeseries",
      "targets": [{
        "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))",
        "legendFormat": "P95"
      }],
      "thresholds": [{ "value": 0.5, "color": "red" }]
    },
    {
      "title": "Result Errors",
      "type": "timeseries",
      "targets": [{
        "expr": "sum(rate(aptivo_result_errors_total[5m])) by (error_tag)",
        "legendFormat": "{{error_tag}}"
      }]
    }
  ]
}
```

### 8.3 PromQL Queries for Alerting

Per **Deployment Operations v2.0.0**, these queries power alerts:

```promql
# P95 response time > 500ms for 5 minutes
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
) > 0.5

# 5xx error rate > 1% over 5 minutes
(
  sum(rate(http_requests_total{status_code=~"5.."}[5m]))
  /
  sum(rate(http_requests_total[5m]))
) > 0.01

# Database connection pool > 80%
pg_stat_activity_count{state="active"}
/
pg_settings_max_connections > 0.8

# New Result error type detected
increase(aptivo_result_errors_total[5m]) > 0
  unless on(error_tag)
  (aptivo_result_errors_total offset 1h > 0)
```

---

## 9. Alerting Configuration

### 9.1 Alert Rules

```yaml
# prometheus/alerts.yaml
groups:
  - name: aptivo-slo
    rules:
      - alert: HighErrorRate
        expr: |
          (
            sum(rate(http_requests_total{status_code=~"5.."}[5m]))
            /
            sum(rate(http_requests_total[5m]))
          ) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High 5xx error rate detected"
          description: "Error rate is {{ $value | humanizePercentage }} (threshold: 1%)"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
          ) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P95 latency exceeds 500ms"
          description: "P95 latency is {{ $value | humanizeDuration }}"

      - alert: DatabaseConnectionsHigh
        expr: pg_stat_activity_count{state="active"} / pg_settings_max_connections > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database connection pool near capacity"
```

### 9.2 Alert Routing

| Alert | Severity | Channel | Escalation |
|-------|----------|---------|------------|
| HighErrorRate | Critical | PagerDuty P1 | On-call SRE → Engineering Manager |
| HighLatency | Warning | Slack #ops-alerts | On-call SRE |
| DatabaseConnectionsHigh | Warning | PagerDuty P2 | On-call SRE |
| NewResultErrorType | Info | Slack #ops-errors | On-call Support |

---

## 10. Development Environment

### 10.1 Local Observability Stack

```yaml
# docker-compose.observability.yml
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.96.0
    command: ["--config=/etc/otel-collector-config.yaml"]
    volumes:
      - ./config/otel-collector-dev.yaml:/etc/otel-collector-config.yaml
    ports:
      - "4317:4317"   # OTLP gRPC
      - "4318:4318"   # OTLP HTTP
      - "8889:8889"   # Prometheus metrics

  prometheus:
    image: prom/prometheus:v2.50.0
    volumes:
      - ./config/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  jaeger:
    image: jaegertracing/all-in-one:1.54
    ports:
      - "16686:16686"  # UI
      - "4317"         # OTLP gRPC (internal)

  loki:
    image: grafana/loki:2.9.4
    ports:
      - "3100:3100"

  grafana:
    image: grafana/grafana:10.3.0
    ports:
      - "3001:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
    volumes:
      - ./config/grafana/provisioning:/etc/grafana/provisioning
```

### 10.2 Environment Variables

```bash
# .env.local
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SERVICE_NAME=aptivo-app
LOG_LEVEL=debug
```

---

## 11. Security & Privacy

### 11.1 Data Classification

| Data Type | Allowed in Telemetry | Handling |
|-----------|---------------------|----------|
| Request IDs | ✅ Yes | Include in all signals |
| User IDs | ✅ Yes (hashed) | Hash before logging |
| Error messages | ✅ Yes | Sanitize PII |
| Request bodies | ⚠️ Conditional | Only non-sensitive fields |
| Passwords/tokens | ❌ Never | Redact completely |
| PII (names, emails) | ❌ Never | Redact completely |

### 11.2 Redaction Configuration

```typescript
// ensure sensitive data is never logged
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'token',
  'secret',
  'apiKey',
  'creditCard',
  'ssn',
];
```

### 11.3 Access Control

| Role | Grafana Access | Data Access |
|------|---------------|-------------|
| Developer | Viewer | Own service dashboards |
| SRE | Editor | All dashboards, alerts |
| Security | Admin | Full access, audit logs |

### 11.4 Retention Policies

| Signal | Hot Storage | Warm Storage | Archive |
|--------|-------------|--------------|---------|
| Traces | 7 days | 30 days | None |
| Metrics | 15 days | 90 days | 1 year |
| Logs | 30 days | 90 days | 1 year |

---

## 12. Audit Logging

Audit logging provides compliance and security visibility for sensitive operations. This is separate from application logs and has longer retention requirements.

### 12.1 Audit Events

| Event | When | Retention |
|-------|------|-----------|
| User login | Authentication | 2 years |
| Data access | PII viewed | 2 years |
| Data modification | Entity CRUD | 7 years |
| Permission change | Role assignment | 7 years |
| Export | Data export | 7 years |

### 12.2 Audit Log Schema

```typescript
// lib/observability/audit.ts
interface AuditEvent {
  id: string;                // ULID for ordering
  timestamp: string;         // ISO 8601
  actor: {
    id: string;
    email: string;
    ip: string;
    userAgent: string;
  };
  action: string;            // e.g., "candidate.status.update"
  resource: {
    type: string;            // e.g., "candidate"
    id: string;
  };
  changes?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}
```

### 12.3 Audit Log Example

```json
{
  "id": "01HXYZ123",
  "timestamp": "2026-01-15T10:30:00Z",
  "actor": {
    "id": "user-456",
    "email": "recruiter@company.com",
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0..."
  },
  "action": "candidate.status.update",
  "resource": {
    "type": "candidate",
    "id": "candidate-789"
  },
  "changes": {
    "before": { "status": "screening" },
    "after": { "status": "interviewing" }
  }
}
```

### 12.4 Audit Implementation

Audit events are written to a separate PostgreSQL table with immutable append-only writes:

```typescript
// lib/observability/audit-writer.ts
import { db } from '@/lib/db';
import { ulid } from 'ulid';

export async function writeAuditEvent(
  event: Omit<AuditEvent, 'id' | 'timestamp'>
): Promise<void> {
  await db.auditLog.create({
    data: {
      id: ulid(),
      timestamp: new Date().toISOString(),
      ...event,
      actor: JSON.stringify(event.actor),
      resource: JSON.stringify(event.resource),
      changes: event.changes ? JSON.stringify(event.changes) : null,
      metadata: event.metadata ? JSON.stringify(event.metadata) : null,
    },
  });
}
```

> **Note:** Audit logs are never deleted. Use database partitioning for large-scale retention.

---

## 13. Troubleshooting Guide

### 13.1 Common Issues

**Problem:** Missing traces between services
**Checklist:**
1. Verify trace headers propagate: `curl -v http://service/endpoint | grep traceparent`
2. Check collector is receiving: `kubectl logs -l app=otel-collector`
3. Ensure service names match in configuration
4. Verify NATS messages include trace headers

**Problem:** Logs not correlating with traces
**Solution:** Verify Pino mixin is injecting trace context:
```typescript
// check logger output includes traceId
logger.info('test message');
// should output: {"traceId":"abc123",...}
```

**Problem:** High cardinality causing storage issues
**Solution:** Normalize high-cardinality labels (don't filter histogram buckets!):
```yaml
processors:
  metricstransform:
    transforms:
      - include: http_request_duration_seconds
        action: update
        operations:
          - action: aggregate_labels
            label_set: [method, status_code]  # remove route
            aggregation_type: sum
```

> **WARNING**: Never filter `.*_bucket` metrics. This breaks P95/P99 percentile calculations required for SLO monitoring.

---

## 14. Performance Considerations

- **Sampling:** Use tail-based sampling in production (10% + all errors/slow)
- **Batching:** Configure collector batch processor for efficiency
- **Storage:** Implement retention policies to manage growth
- **Cardinality:** Limit label values, normalize URLs, avoid UUIDs in labels
- **Overhead:** Target < 2% CPU overhead from instrumentation

---

## **Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0.0 | 2025-02-18 | Abe Caymo | Initial version |
| v1.0.1 | 2025-06-13 | Abe Caymo | Added manual instrumentation examples |
| v2.0.0 | 2026-01-15 | Document Review Panel | Major rewrite: aligned with Prometheus/Grafana/Jaeger stack, removed security vulnerabilities, added prom-client metrics, Pino logging, ReaderResult wrapper, tail-based sampling, risk monitoring dashboards |
| v2.0.1 | 2026-01-15 | Document Review Panel | Consolidation: Added Section 6 (Sentry Error Tracking), Section 12 (Audit Logging), updated pillars table, cross-referenced specs/observability.md checklist |
