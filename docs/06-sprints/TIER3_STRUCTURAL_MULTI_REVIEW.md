# Concern Re-Evaluation — Tier 3 (Structural)

**Date**: 2026-03-13
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (via PAL clink), OpenAI Codex (via Codex MCP)
**Concerns**: `horizontal-traceability`, `infrastructure-change-control`, `requirement-test-mapping`

---

## Executive Summary

Tier 3 structural evaluation reveals gaps in cross-document coherence. The most significant finding: new architecture content (§15 Admin Dashboard, §16 Observability) has no corresponding functional requirements in the FRD. Infrastructure IaC ownership is incomplete for the persistence tier. Domain-specific requirement-to-test mapping is absent.

---

## horizontal-traceability

| ID | Severity | Finding | Gemini | Codex | Source |
|----|----------|---------|--------|-------|--------|
| HT-1 | **WARN** | ADD §15 (Admin Dashboard) and §16 (Observability/SLO) lack corresponding FR-CORE-* requirements in the FRD — architecture exists without traceable requirements | Found | Found | ADD §15-16, FRD §§3-12 |
| HT-2 | **WARN** | No unified BRD→FRD→ADD traceability matrix at platform level — only domain-local matrices exist | — | Found | FRD §12, HR FRD §11 |

## infrastructure-change-control

| ID | Severity | Finding | Gemini | Codex | Source |
|----|----------|---------|--------|-------|--------|
| IC-1 | **ERROR** | Managed PostgreSQL and Redis lifecycle not fully covered by IaC — unclear if `.do/app.yaml` manages maintenance windows, upgrades, backups or just connections | Found | — | Runbook §3.3, §10 |
| IC-2 | **WARN** | No drift detection process documented — no procedure to detect when live infra diverges from version-controlled App Spec | Found | Found | Runbook §5, §10 |
| IC-3 | **WARN** | Console-managed components (DB scaling, Redis plan changes) are ClickOps with no documented IaC migration plan | — | Found | Runbook infra sections |
| IC-4 | **WARN** | No component-to-IaC inventory table mapping all production components to source files | — | Found | Infra docs |

## requirement-test-mapping

| ID | Severity | Finding | Gemini | Codex | Source |
|----|----------|---------|--------|-------|--------|
| RT-1 | **ERROR** | FR-CORE-ID-* (Identity Service) auth tests not mapped to specific test specifications | — | Found | FRD §9, Guidelines §7.3 |
| RT-2 | **ERROR** | FR-HR-COMP-* (Philippine compliance) requirements have no test mapping — critical for audit evidence | — | Found | HR FRD §5 |
| RT-3 | **WARN** | Domain FRDs (FR-CRYPTO-*, FR-HR-*) lack RTM — only Platform Core FR-CORE-* is mapped in Testing Strategies | Found | — | Testing Strategies §13 |
| RT-4 | **WARN** | NFR performance thresholds (latency, success rate) have no explicit performance/load test specifications | — | Found | FRD §10.1-10.2, HR FRD §9 |

---

## Tier 3 Summary

| Severity | Count | Key themes |
|----------|-------|------------|
| ERROR | 3 | DB/Redis IaC ownership, auth test mapping, compliance test mapping |
| WARN | 6 | Traceability gaps, drift detection, domain RTM, NFR test specs |

### Recommended Actions

1. ~~**Add FRD requirements** for Admin Dashboard and Observability (HT-1) — FR-CORE-ADM-* and FR-CORE-OBS-*~~ — **RESOLVED**: Added FR-CORE-ADM-001/002/003 and FR-CORE-OBS-001/002 to FRD §11.2/§11.3; added TSD links; added to RTM §13.1 (2026-03-13)
2. ~~**Document DB/Redis IaC ownership** explicitly — managed lifecycle vs App Spec (IC-1)~~ — **RESOLVED**: Added Runbook §10.4 Component-to-IaC Ownership Matrix, §10.5 Drift Detection Process, §10.6 Console-Managed Migration Plan (2026-03-13)
3. ~~**Create domain RTMs** mapping FR-CRYPTO-* and FR-HR-* to test specs (RT-3)~~ — **RESOLVED**: Added Testing Strategies §13.4 with Crypto RTM (13 requirements) and HR RTM (12 requirements including FR-HR-COMP-*) (2026-03-13)
4. ~~**Add auth-path test specs** mapped to FR-CORE-ID-* (RT-1)~~ — **RESOLVED**: FR-CORE-ID-001/002/003 already mapped in RTM §13.1 with error path cross-references (§11: expired JWT, JWKS cache stale, insufficient permissions). Finding confirmed as a false positive — mapping existed.
5. ~~**Add compliance test specs** mapped to FR-HR-COMP-* with audit evidence artifacts (RT-2)~~ — **RESOLVED**: Added FR-HR-COMP-001 through 005 to §13.4.2 HR Domain RTM with compliance-specific test specifications (DPA consent, subject rights, DOLE, BIR retention, tax export) (2026-03-13)
