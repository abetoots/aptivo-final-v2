# Cross-Document Contradiction Scanner — Multi-Model Review

**Date**: 2026-02-26
**Concern**: `contradiction-scanner`
**Models**: Gemini 3 Flash Preview, OpenAI Codex, Claude Opus 4.6 (Lead Expert)
**Documents Scanned**: BRD, FRD, ADD, Runbook, TSD (index.md), API Spec (OpenAPI 3.1)

---

## Executive Summary

Three independent AI models performed a cross-document contradiction scan of the 6 core Aptivo platform documents. The scan identified **4 ERROR-severity**, **8 WARNING-severity**, and **4 NOTE-severity** contradictions. All ERROR items require immediate resolution before implementation can begin.

The most critical finding is a **three-way health check endpoint path conflict** (Runbook vs API Spec vs configuration.md TSD) that would cause deployment failures on DigitalOcean App Platform. Additionally, the **HITL approval idempotency contract** disagrees between ADD and API Spec, the **BRD claims database replication** that doesn't exist in the specified Basic-tier infrastructure, and **ClamAV is missing from deployment configurations** despite being specified in the ADD.

Most contradictions stem from the recent feasibility-check edits (NATS removal, K8s→DO migration) that updated some documents but left stale references in others.

---

## Model Agreement Matrix

| Finding | Gemini | Codex | Claude | Consensus |
|---------|--------|-------|--------|-----------|
| Health check endpoint paths | - | WARN | ERROR | 2/3 (escalated to ERROR) |
| HITL 409 vs 200 idempotency | - | ERROR | - | 1/3 (validated → ERROR) |
| BRD database replication vs Basic-tier | - | - | ERROR | 1/3 (validated → ERROR) |
| ClamAV missing from deploy configs | ERROR | - | - | 1/3 (validated → ERROR) |
| PostgreSQL 18 vs 16 | - | WARN | WARN | 2/3 |
| BRD "Message Queue: Buy" ghost ref | WARN | - | WARN | 2/3 |
| File size 50MB vs 100MB | - | WARN | WARN | 2/3 |
| Traefik vs DO managed LB | - | WARN | WARN | 2/3 |
| File scan status enums differ | - | WARN | - | 1/3 (validated) |
| K8s Probes section in configuration.md | - | - | WARN | 1/3 (validated) |
| OTel health path filters differ | - | - | WARN | 1/3 (validated) |
| DR playbook stale references | - | WARN | WARN | 2/3 |
| NATS in project-structure Phase 2 | WARN | - | NOTE | 2/3 |
| Novu dedup window internal note | NOTE | - | NOTE | 2/3 |
| Worker fleet claim vs docker-compose | WARN | - | - | 1/3 (debated → NOTE) |
| RTO <1min vs <4hr (different modes) | - | - | NOTE | 1/3 |

---

## Consensus Findings

### ERROR Severity (Fix Immediately)

#### E1: Health Check Endpoint Paths — Three-Way Conflict

| Source | Liveness Path | Readiness Path |
|--------|---------------|----------------|
| **Runbook** (§2.3, §3.3, §5.3) | `/health/live` | `/health/ready` |
| **API Spec** (paths) | `/api/health` | `/api/ready` |
| **configuration.md** (§4.3) | `/api/health/live` | `/api/health/ready` |
| **05d-Observability.md** (§4) | `/health/live` | `/health/ready` |
| **05a-Coding-Guidelines.md** (§OTel) | `/api/health` | — |

**Impact**: The DO App Platform `health_check.http_path` is set to `/health/live`. If the application implements the OpenAPI paths (`/api/health`), the health check will 404 and containers will be killed in a restart loop.

**Found by**: Codex (WARN), Claude (ERROR)
**Lead Expert Verdict**: ERROR — deployment-breaking inconsistency

#### E2: HITL Approval Idempotency — ADD 200 OK vs API Spec 409

| Source | Duplicate Approval Response |
|--------|----------------------------|
| **ADD** §4.5.1 | `200 OK` with `{ idempotent: true }` |
| **API Spec** `/approve` | `409 Conflict` ("Decision already recorded") |

**Impact**: The ADD correctly defines idempotent behavior (duplicate same-action = success), while the API spec incorrectly uses 409 for the duplicate case. This breaks idempotency contracts — clients retrying an approve after timeout would get 409 instead of 200.

**Found by**: Codex (ERROR)
**Lead Expert Verdict**: ERROR — approval workflow contract conflict. ADD is correct, API spec needs fixing.

#### E3: BRD Database Replication vs Basic-Tier Infrastructure

| Source | Claim |
|--------|-------|
| **BRD** §7.1 | "Stateless services; database replication" as SPOF mitigation |
| **Runbook** §3.2 | PostgreSQL Basic ($15/mo), Vertical scaling; Redis Basic ($15/mo), Single node |
| **Runbook** §8.6 | DR prerequisites: "Database replication to secondary region active" |

**Impact**: DO Basic-tier managed databases do NOT include replication or standby nodes. The BRD's SPOF mitigation and the Runbook's DR playbook prerequisites are unachievable with the specified infrastructure. The DR playbook also references "Route53/CloudFlare" and secondary regions, which are stale from the K8s era.

**Found by**: Claude (ERROR)
**Lead Expert Verdict**: ERROR — availability/durability guarantee conflict

#### E4: ClamAV Missing from Deployment Configurations

| Source | ClamAV Status |
|--------|---------------|
| **ADD** §9.8.2 | Fully specified: container image, RAM requirements, API protocol, ports |
| **ADD** §10.2 | Docker-compose: NOT listed (only api, workflow-worker, postgres, redis, minio) |
| **Runbook** §3.3 | DO app.yaml: NOT listed |

**Impact**: ClamAV is specified as a required Phase 1 component for malware scanning (security boundary) but omitted from all deployment configurations. Files would be accepted without scanning.

**Found by**: Gemini (ERROR)
**Lead Expert Verdict**: ERROR — security boundary gap

---

### WARNING Severity (Present to User)

#### W1: PostgreSQL Version 18 vs 16

- **ADD** §1.2, **TSD** §3.1, **project-structure.md**: PostgreSQL 18.x
- **ADD** §10.2 docker-compose, **Runbook** §3.3 app.yaml, **Testing Strategies** docker-compose: `postgres:16`

PostgreSQL 18 is not yet released (PostgreSQL 17 was released September 2025). Deployment configs use the actually-available version 16.

**Found by**: Codex + Claude

#### W2: BRD "Message Queue: Buy" Ghost Reference

- **BRD** §6.2: Lists "Message Queue | Buy | Managed message queue service"
- **TSD** §4.1: "Event-Driven | Async communication via Inngest event system"
- **TSD** Appendix A: "Removed: NATS JetStream from Phase 1"

The BRD still lists a standalone message queue as infrastructure to buy, but NATS was removed and Inngest now handles Phase 1 async communication.

**Found by**: Gemini + Claude

#### W3: Maximum File Size 50MB vs 100MB

- **FRD** §8.5 FR-CORE-BLOB-001: "Maximum file size configurable (default: 50MB)"
- **API Spec** UploadUrlRequest.size: `maximum: 104857600` (100MB)

**Found by**: Codex + Claude

#### W4: Traefik vs DO Managed Load Balancer

- **TSD** §3.2: "API Gateway | Traefik | 3.x | Edge routing, TLS termination"
- **Runbook** §3.1: DO App Platform managed load balancer handles TLS and routing

Traefik may be relevant for local development but the TSD lists it as general infrastructure without development-only scoping.

**Found by**: Codex + Claude

#### W5: File Scan Status Enums Differ

- **ADD** §9.6-9.8: `scanStatus: 'pending' | 'clean' | 'infected' | 'error'`
- **API Spec** FileMetadata.status: `enum: [pending, uploaded, scanned, quarantined]`

These are different lifecycle models. The ADD tracks malware scan state; the API spec tracks upload lifecycle. They need unification.

**Found by**: Codex

#### W6: Kubernetes Probes Section in configuration.md

- **configuration.md** §4.3: Contains "Kubernetes Probes" section with `deployment.yaml` examples
- **Runbook** §3, **ADD** §10: DigitalOcean App Platform (not Kubernetes)

Stale K8s content that should reference DO App Platform health check configuration.

**Found by**: Claude

#### W7: OTel Health Path Filters Differ

- **05a-Coding-Guidelines.md**: `ignoreIncomingPaths: ['/api/health', '/api/metrics']`
- **05d-Observability.md**: `ignoreIncomingPaths: ["/health/live", "/health/ready", "/metrics"]`

Part of the broader health check path inconsistency (E1).

**Found by**: Claude

#### W8: DR Playbook Stale References

- **Runbook** §8.5: References "RDS/CloudSQL dashboard" for database outage
- **Runbook** §8.6: References "Route53/CloudFlare" for DNS failover, "secondary region"
- **Actual infra**: DigitalOcean single-region, Basic-tier

Runbook incident procedures reference non-selected providers and infrastructure.

**Found by**: Codex + Claude

---

### NOTE Severity (Document Only)

#### N1: NATS in project-structure.md Phase 2 Evaluation

`project-structure.md:546` lists "evaluate NATS vs Inngest native events" for Phase 2 `@aptivo/events` package. This is consistent with the "deferred to Phase 2+" decision but creates mild ambiguity alongside the BRD's "Message Queue: Buy" entry (W2).

**Found by**: Gemini + Claude

#### N2: Novu Dedup Window — Internal ADD Consistency

ADD §6.2.1 correctly states the Novu transactionId dedup window is "not publicly documented". Section 6.4's verification note references validating a former "24-hour claim" during integration testing. These are consistent — the note acknowledges the correction.

**Found by**: Gemini + Claude

#### N3: Worker Fleet Claim vs Docker-Compose Worker Container

ADD §3.1 claims "No separate worker fleet (critical for 3-dev team)" but §10.2 includes a `workflow-worker` container. Gemini flagged this as WARN. Lead expert downgrades to NOTE: the "no worker fleet" claim refers to avoiding Temporal's dedicated worker management overhead, not that zero separate containers exist. The Inngest worker is just the function-serving endpoint, not a separately-managed worker fleet.

**Found by**: Gemini (debated → downgraded by lead expert)

#### N4: RTO <1 Minute vs <4 Hours

FRD §10.2 defines "System RTO (process restart) < 1 minute". Runbook §8.6 defines "RTO Target < 4 hours" for regional disaster recovery. These apply to different failure modes and are not contradictory.

**Found by**: Claude

---

## Debated Items

| Item | Gemini | Codex | Claude | Resolution |
|------|--------|-------|--------|------------|
| Worker fleet claim | WARN | — | — | Downgraded to NOTE. The "no worker fleet" refers to Temporal-style worker management, not zero containers. BullMQ workers are Redis-backed lightweight workers, not a dedicated fleet. |
| Health check severity | — | WARN | ERROR | Escalated to ERROR. The DO App Platform health check config directly uses `/health/live` — a path mismatch causes container restart loops, making this deployment-breaking. |
| Inngest licensing note | — | — | NOTE | Dropped. Not a contradiction — Inngest (Elastic License) and Novu (MIT) correctly labeled in ADD. |

---

## Resolution Status

| ID | Severity | Status | Resolution |
|----|----------|--------|------------|
| E1 | ERROR | FIXED | Standardized health check paths to `/health/live`, `/health/ready` across all docs |
| E2 | ERROR | FIXED | Updated API Spec: duplicate same-action returns 200, cross-action conflict returns 409 |
| E3 | ERROR | FIXED | Updated BRD SPOF mitigation and Runbook DR playbook to reflect Basic-tier reality |
| E4 | ERROR | FIXED | Added ClamAV to ADD docker-compose and noted in Runbook |
| W1 | WARNING | FIXED | PostgreSQL 18 → 16 in ADD, TSD, project-structure.md (18 unreleased) |
| W2 | WARNING | FIXED | BRD Message Queue row updated to "Buy (Phase 2+)" with Inngest note |
| W3 | WARNING | FIXED | API Spec file size max aligned to 50MB (FRD default) |
| W4 | WARNING | FIXED | TSD Traefik scoped to local development; production uses DO managed LB |
| W5 | WARNING | FIXED | API Spec FileMetadata status enum aligned with ADD scanStatus values |
| W6 | WARNING | FIXED | (Resolved with E1) K8s Probes → DO App Platform health checks |
| W7 | WARNING | FIXED | (Resolved with E1) OTel ignore paths aligned to /health/live, /health/ready |
| W8 | WARNING | FIXED | configuration.md K8s DNS → DO App Platform service discovery |
| N1–N4 | NOTE | DOCUMENTED | No action required |

---

## Sign-Off

| Model | Role | Sign-Off | Date |
|-------|------|----------|------|
| Gemini 3 Flash Preview | Independent Reviewer | APPROVED | 2026-02-26 |
| OpenAI Codex | Independent Reviewer | APPROVED | 2026-02-26 |
| Claude Opus 4.6 | Lead Expert | APPROVED | 2026-02-26 |

All three models verified the 4 ERROR fixes and approved the final state of the documents.
