# Tier 3 + New Concerns — Multi-Model Review

**Date**: 2026-04-20
**Concerns**: 4 — horizontal-traceability, infrastructure-change-control, requirement-test-mapping, realtime-connection-lifecycle

---

## Executive Summary

- **Total findings**: 15 (8 ERROR, 7 WARN, 0 NOTE)
- **Pattern**: Structural tier surfaces baseline gaps — new realtime-connection-lifecycle concern reveals MCP WebSocket has no documented connection lifecycle
- **New baseline concerns** performed well except for realtime-connection which is 0/3 fully documented
- **Requirement-test-mapping flagged self-contained file as stale** (real RTM added 2026-03-04 not in embedded docs)

---

## 1. horizontal-traceability (Gemini): 3 gaps

Evaluates whether components trace BRD → FRD → ADD → TSD → API_SPEC.

| Severity | Finding |
|----------|---------|
| **ERROR** | ADD §15 (Admin Dashboard) and §16 (Observability/SLO) have NO corresponding FRD entries — architecture exists without acceptance criteria |
| WARN | Admin endpoints violate `/api/v1/` versioning mandate (same as Tier 2 API C1, C6) |
| WARN | New TSDs (admin-ops-api.md, audit.md) not fully embedded in eval file — traceability inferred only |

## 2. infrastructure-change-control (Codex) [NEW BASELINE]: 5 gaps

Evaluates IaC source, promotion path, drift detection for production components.

| Severity | Finding |
|----------|---------|
| **ERROR** | **Supabase Auth** (identity service) has NO IaC source or controlled configuration — session/MFA/JWT settings are dashboard-only |
| WARN | **Drift detection**: No documented mechanism for DO App Platform, PostgreSQL, Redis — manual changes can silently diverge |
| WARN | **DO Spaces** bucket not mapped to IaC — CORS, lifecycle, access policies unreproducible |
| WARN | **Novu/Inngest/Grafana/Sentry** configurations not version-controlled — templates, dashboards, alert rules can drift |
| WARN | **ClamAV** deployment not clearly mapped to `.do/app.yaml` |

### Components covered (11):
✅ DO App Platform (IaC via `.do/app.yaml`), Workflow worker, Managed PostgreSQL, Managed Redis, App Platform secrets
❌ Spaces, Supabase Auth, Novu, Inngest, Grafana/Sentry, ClamAV

## 3. requirement-test-mapping (Gemini): 4 gaps ⚠️ acknowledged stale baseline

| Severity | Finding |
|----------|---------|
| **ERROR** | Systemic lack of formal RTM linking FR-CORE IDs to test specifications (in embedded docs) |
| **ERROR** | FR-CORE-ADM-* and FR-CORE-OBS-* requirements missing — admin/observability implemented without FRD |
| **ERROR** | FR-CORE-AUD-001 "tamper-evident" contradicts ADD §1.2 deferring hash-chain to Phase 3+ (same as Tier 1 C8, Tier 2 API gap-3) |
| WARN | HR Domain Traceability Matrix maps to BRD only, not test specs |

**⚠️ Gemini note**: "The self-contained concern-1 package is stale. Actual repository (docs/05-guidelines/05b-Testing-Strategies.md) has RTM added 2026-03-04." Gaps 1-2 may already be resolved in current docs.

## 4. realtime-connection-lifecycle (Codex) [NEW BASELINE]: 3 gaps, all ERROR

### Items evaluated (3 connection types) — all have 0/4 lifecycle fields documented:

| Connection | Auth | Heartbeat | Reconnect | Backpressure |
|-----------|------|-----------|-----------|--------------|
| MCP WebSocket transport | ❌ | ❌ | ❌ | ❌ |
| Crypto API WebSocket events | ❌ | ❌ | ❌ | ❌ |
| Inngest SDK worker connection | ❌ | ✅ | ❌ | ❌ |

| Severity | Finding |
|----------|---------|
| **ERROR** | **MCP WebSocket lifecycle**: ADD §5.1 lists WebSocket as MCP transport option but defines no handshake auth, channel authorization, heartbeat timeout, reconnection/resume, or backpressure |
| **ERROR** | **Crypto WebSocket events**: Referenced in TSD §2 and crypto/api.md but lifecycle contract missing — risks stale trading decisions on reconnect |
| **ERROR** | **Inngest SDK connection**: Heartbeat documented but reconnection strategy, connect-time auth, and backpressure behavior absent |

---

## Cross-Cutting Patterns Confirmed

This cluster confirms 3 patterns identified earlier:

1. **Admin API versioning saga** — now cited in horizontal-traceability too
2. **Audit hash-chain contradiction** — 4th time surfaced (Tier 1 C8, Tier 2 API gap-3, Tier 2 durable-persistence ERROR, Tier 3 requirement-test-mapping gap-3)
3. **FR-CORE-ADM/OBS gap** — architecture without requirements

---

## Delta Against Previous Evaluations

| Prior concern eval | Status |
|-------------------|--------|
| `horizontal-traceability` (concerns-3/) | Mostly resolved by new FRD sections, but admin/obs still orphaned |
| `requirement-test-mapping` (concerns-3/) | Partially resolved via RTM addition (2026-03-04); evaluation file is stale |
| `infrastructure-change-control` | **NEW** — no prior baseline |
| `realtime-connection-lifecycle` | **NEW** — no prior baseline |

---

## Priority Actions

### ERROR (8) — baseline gaps for Phase 2 planning

1. **Add FR-CORE-ADM-\* and FR-CORE-OBS-\*** to FRD (or verify 2026-03-04 RTM covers these)
2. **Document MCP WebSocket lifecycle** — auth, heartbeat, reconnect, backpressure
3. **Document crypto WebSocket event contract** — or remove from TSD if not implemented
4. **Document Inngest SDK connection lifecycle** — reconnect, auth, backpressure
5. **Supabase Auth IaC/change-control** — either IaC it or document manual change procedure with evidence
6. **Resolve audit hash-chain status** (4th mention) — Phase 1 or Phase 3+?
7. **Admin API versioning** (continues from earlier tiers)

### WARN (7) — Phase 2 planning

- Drift detection for DO resources
- DO Spaces IaC mapping
- SaaS config version control (Novu/Inngest/Grafana/Sentry)
- ClamAV IaC mapping
- HR traceability matrix test-spec column
- TSD content inclusion in eval package
