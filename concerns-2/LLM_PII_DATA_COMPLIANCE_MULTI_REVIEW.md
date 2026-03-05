# LLM + PII + Data Compliance — Multi-Model Review (Session 2)

**Concerns Evaluated**: llm-safety-envelope, logging-pii-compliance, data-retention-compliance, cost-budget-enforcement
**Date**: 2026-03-01
**Reviewers**: Gemini (gemini-3-flash-preview), Codex (o3), Claude (opus-4-6 lead expert)

---

## Executive Summary

Four concerns were evaluated in a bundled session against 7 Aptivo platform documents (BRD, FRD, ADD, Runbook, Coding Guidelines, API Spec, Config Spec). The platform has strong LLM cost controls (ADD §7.2: daily/monthly budgets with enforcement) and comprehensive audit logging (ADD §9.2-9.5), but critical gaps exist in LLM security, PII handling in logs, and data lifecycle management.

**Verdict: CONDITIONAL PASS — 10 ERRORs (hard blocks), 12 WARNINGs.**

The ERRORs cluster around three themes:
- **(A) LLM safety gaps**: Prompt injection and output validation are explicitly unmitigated (ADD §14.5 acknowledges this)
- **(B) PII exposure in logs**: Application logs, audit logs, and third-party exports contain PII without complete redaction
- **(C) Data lifecycle absent**: No retention periods, deletion procedures, or legal basis documented for any PII data type (except audit logs)

| Concern | Gemini | Codex | Claude | Consensus |
|---------|--------|-------|--------|-----------|
| llm-safety-envelope | 2E/0W/1N | 2E/1W/1N | 2E/1W/1N | 2E/1W/1N |
| logging-pii-compliance | 1E/2W | 2E/1W/1N | 3E/4W | 3E/4W |
| data-retention-compliance | 3E/1W | 3E/1W/1N | 5E/3W | 4E/3W |
| cost-budget-enforcement | 0E/2W/1N | 1E/2W/1N | 1E/5W | 1E/4W |
| **Total** | **6E/5W** | **8E/5W** | **11E/13W** | **10E/12W** (deduplicated) |

---

## Consensus ERRORs — Hard Blocks

### Theme A: LLM Safety Gaps (2 ERRORs)

#### E1: Prompt Injection Defenses Unmitigated
**Consensus**: All 3 models (high confidence).
**Verified**: ADD §14.5 explicitly states: "**UNMITIGATED at input layer** — no prompt hardening documented." Direct prompt injection (user text manipulates LLM) and indirect prompt injection (MCP data contains adversarial instructions) are both acknowledged as unmitigated. Compensating controls exist (HITL gates, MCP idempotency, schema validation) but are not structural prompt defenses.

**Trigger**: `prompt_injection_defense_documented is FALSE for user-facing LLM integration`

#### E2: LLM Output Validation Missing
**Consensus**: All 3 models (high confidence).
**Verified**: ADD §14.5: "**UNMITIGATED for semantic content** — valid schema but adversarial text." MCP tool outputs receive Zod schema validation (ADD §5.3), but LLM completion responses have no documented content filtering, hallucination detection, or structured output enforcement. These outputs influence business-critical workflow decisions (trade signals, hiring recommendations).

**Trigger**: `output_validation_documented is FALSE and LLM output is used in business-critical decisions`

### Theme B: PII Exposure in Logs (3 ERRORs)

#### E3: Application Log PII Redaction Incomplete
**Consensus**: All 3 models (high confidence).
**Verified**: ADD §14.3 RR-5 explicitly flags this as a "**pre-production blocker**": "PII leakage in application logs — Pino log redaction covers `password`, `token`, `secret` but not PII fields (email, phone)." The Observability guideline §11.1 says PII should "Never" be logged, but the `sanitizeForLogging` function (§6.2, line 643) only redacts `password, token, secret, authorization` — NOT email, name, phone, or address.

**Trigger**: `pii_fields_present is TRUE and redaction_documented is FALSE`

#### E4: Audit Log Schema Stores PII Without Anonymization
**Consensus**: Claude (high confidence). Codex partially flagged (outcome completeness). Gemini missed.
**Verified**: ADD §9.2 audit_logs table explicitly stores `ip_address` (INET) and `user_agent` (TEXT) — both PII/quasi-PII under GDPR. These are retained for 7 years (ADD §9.4) with no documented anonymization. FRD FR-CORE-AUD-001 states "Sensitive PII in metadata is automatically masked or hashed based on configuration" but no implementation details exist in the ADD.

**Trigger**: `pii_fields_present is TRUE and redaction_documented is FALSE`

#### E5: PII Exported to Third-Party Platforms Without Filtering
**Consensus**: Codex + Claude (medium-high confidence). Gemini classified as WARNING.
**Verified**: Runbook §5.1 documents OTLP export to Grafana Cloud/Honeycomb. Runbook §5.5 shows Sentry error reporting with request context. No PII filtering is documented at the export pipeline level. Since application-level PII redaction is itself incomplete (E3), PII flows to third-party platforms unredacted.

**Trigger**: `Logs containing PII are exported to third-party platforms without documented PII filtering`

### Theme C: Data Lifecycle Absent (4 ERRORs)

#### E6: No Retention Period for User/Domain PII Data Types
**Consensus**: All 3 models (high confidence).
**Verified**: Audit logs have a 7-year retention policy (ADD §9.4, FRD FR-CORE-AUD-003). But NO retention period is documented for any PII in primary data stores: `users` (email, name), `candidates` (email, phone, address, salary), `contracts` (salary, compensation), or `files` (resumes, identity documents).

**Note**: The HR domain addendum (hr-domain-addendum.md §3.3) defines retention per data type (contracts: 7 years, candidate PII: consent withdrawal + 30 days, interview feedback: 2 years). But this is domain-specific — the platform core lacks a data retention framework for PII.

**Trigger**: `retention_period_documented is FALSE` for PII data types

#### E7: No Deletion Procedure for Any PII Data Type
**Consensus**: All 3 models (high confidence).
**Verified**: No documented deletion or anonymization procedure exists for any PII data type. No right-to-be-forgotten implementation. No DSAR (data subject access request) process. ADD §9.4 covers audit log retention enforcement only. BRD §2.2 mentions "consent withdrawal" but no cascading deletion procedure exists.

**Trigger**: `deletion_procedure_documented is FALSE`

#### E8: "Indefinite Retention for Analytics Data" Without Justification
**Consensus**: Codex (high confidence). Claude flagged as part of broader retention gap. Gemini missed.
**Verified**: BRD §2.2 line 109: "Domain override: Longer/indefinite retention for analytics data." This blanket authorization for indefinite retention contradicts the GDPR storage limitation principle if the analytics data contains PII or is derived from PII.

**Trigger**: `Data described as "retained indefinitely" with no justification`

#### E9: Auto-Scaling Infrastructure Has No Budget Cap
**Consensus**: Codex + Claude (high confidence). Gemini classified as WARNING.
**Verified**: Runbook §3.2 documents DO App Platform auto-scaling 1-3 containers with CPU/memory triggers. No budget cap, cost alert, or exceed behavior is documented for this auto-scaling resource.

**Trigger**: `auto-scaling resource has budget_documented = FALSE`

### Standalone ERROR

#### E10: No Retention Period for Uploaded Files
**Consensus**: Claude (high confidence). Codex implicitly included in E6. Gemini missed as distinct item.
**Verified**: ADD §9.6-9.7 documents file uploads including resumes, identity documents, and contracts stored in S3/Minio. The `files` table has no retention period documented. Identity documents stored indefinitely in object storage create significant compliance liability.

**Trigger**: `retention_period_documented is FALSE` for PII data type

---

## Consensus WARNINGs — By Theme

### Theme D: LLM Safety Incomplete (1 WARNING)

| ID | Warning | Flagged By | Evidence |
|----|---------|------------|----------|
| W1 | **Per-user/session token limits missing** — Daily ($50) and monthly ($500) budget caps exist per domain, but no per-user or per-session rate limits are documented. A single user could exhaust the entire domain budget. | Codex + Claude | ADD §7.2 |

### Theme E: Log Handling Gaps (4 WARNINGs)

| ID | Warning | Flagged By | Evidence |
|----|---------|------------|----------|
| W2 | **`sanitizeForLogging` function incomplete** — Function is defined (Observability guideline §6.2) but only redacts `password, token, secret, authorization`, not PII fields despite §11.1 saying PII should "Never" be logged. | Claude | 05d-Observability.md line 643-651 |
| W3 | **Access log PII not addressed** — DO App Platform load balancer generates access logs with IP addresses, URLs (potential query params with PII), and user agents. Not covered by Pino redaction. | Claude | Runbook §3.1 |
| W4 | **Application log retention not aligned with PII retention** — Application logs have 30d/90d/1yr retention (Runbook §5.4), but if they contain PII (per E3), retention should be justified and erasure requests may be infeasible. | Claude | Runbook §5.4 |
| W5 | **Data access audit trail incomplete** — Audit events cover HITL decisions, file access, role changes, and workflow transitions, but no audit trail for general PII data access (who queried/viewed what candidate records). | Claude | ADD §9.2 |

### Theme F: Data Compliance Gaps (3 WARNINGs)

| ID | Warning | Flagged By | Evidence |
|----|---------|------------|----------|
| W6 | **Legal basis not documented per data type** — BRD mentions Philippine DPA, DOLE, BIR compliance; FRD defines data categories; but no legal basis (consent, contractual necessity, legal obligation) is mapped to specific PII data types. | All 3 | BRD §8.2, FRD §8, ADD §9.1 |
| W7 | **Consent collection/withdrawal mechanism undocumented** — HR domain addendum §3.2 requires "consent recording" and "right to be forgotten," but no platform-level consent management mechanism is documented. | Claude + Gemini | HR addendum §3.2, BRD §2.2 |
| W8 | **Deletion cascade across systems undocumented** — Even if deletion procedures are added, no mention of cascading across: PostgreSQL (multiple schemas), Redis cache, S3/Minio files, Elasticsearch/Loki logs, Sentry, Grafana/Honeycomb, Novu, Inngest. | Claude | All docs |

### Theme G: Cost/Budget Gaps (4 WARNINGs)

| ID | Warning | Flagged By | Evidence |
|----|---------|------------|----------|
| W9 | **No budget documentation for infrastructure resources** — PostgreSQL ($15/mo), Redis ($15/mo), Spaces ($5/mo+usage), ClamAV (~$6/mo) — none have documented budget caps or exceed behavior. | All 3 | Runbook §3.2 |
| W10 | **No budget documentation for third-party SaaS** — Novu (10K events/mo free), Inngest (function runs), Supabase Auth (50K MAU free), Sentry, Grafana Cloud — no budget caps or free-tier-exceed behavior documented. | Claude | ADD §3.1, §6.1, §8.1 |
| W11 | **No cost attribution for non-LLM resources** — LLM costs are attributed by domain/workflow (ADD §7.2), but no other resource has cost attribution to a team or cost center. | Codex + Claude | All docs |
| W12 | **LLM spend observability limited** — Budget caps exist with 90% threshold warning, but no dashboard or alerting workflow documented for monitoring current spend vs. budget. | Codex | ADD §7.2 |

---

## Debated Items & Verdicts

### Debate 1: Third-Party Log Export — ERROR or WARNING?

**Codex + Claude**: ERROR — failure condition explicitly states "Logs containing PII are exported to third-party platforms without documented PII filtering."
**Gemini**: WARNING — classified as secondary to the application-level redaction gap.
**Verdict**: **ERROR.** The failure condition is unambiguous. PII flowing to Sentry, Grafana Cloud, and Elasticsearch without documented filtering constitutes an undocumented data transfer.

### Debate 2: Audit Log ip_address/user_agent — ERROR or WARNING?

**Claude**: ERROR — ip_address and user_agent are PII under GDPR, stored for 7 years in audit logs.
**Codex**: Partially flagged (audit schema completeness concern, not PII-specific).
**Gemini**: Not flagged.
**Verdict**: **ERROR.** IP addresses are explicitly PII under GDPR. Storing them for 7 years in audit logs without documented anonymization violates the data minimization principle and makes erasure requests impossible for this field.

### Debate 3: BRD "Indefinite Analytics Retention" — ERROR or WARNING?

**Codex**: ERROR — "Data described as retained indefinitely with no justification."
**Claude**: Folded into broader retention gap.
**Gemini**: Not flagged.
**Verdict**: **ERROR.** BRD line 109 blanket-authorizes "longer/indefinite retention for analytics data" without specifying what analytics data contains, whether it includes PII, or what the justification is. This contradicts GDPR Article 5(1)(e) storage limitation.

### Debate 4: Auto-Scaling Budget Cap — ERROR or WARNING?

**Codex + Claude**: ERROR — schema explicitly states "auto-scaling resource has budget_documented = FALSE" is ERROR.
**Gemini**: WARNING — classified as infrastructure concern, not critical.
**Verdict**: **ERROR.** The concern schema is explicit: auto-scaling without a budget cap is ERROR severity. DO App Platform scales 1-3 containers automatically.

### Debate 5: Gemini's Gap Count (Pattern)

**Gemini**: 6E/5W total (lowest again, consistent with Session 1 pattern).
**Root cause**: Gemini consistently evaluates fewer items and accepts implicit documentation. Missed audit log PII (E4), BRD indefinite retention (E8), auto-scaling budget (E9), and file retention (E10).
**Verdict**: Gemini undercounts. Use Codex/Claude for calibration (same pattern as Session 1).

---

## Well-Documented Controls

| Control | Location | Status |
|---------|----------|--------|
| LLM cost tracking with daily/monthly caps | ADD §7.2 | Fully documented |
| LLM provider fallback strategy | ADD §7.1, FRD FR-CORE-LLM-003 | Fully documented |
| Audit service (append-only, deterministic IDs) | ADD §9.2-9.3 | Fully documented |
| Audit log retention (7-year default + domain overrides) | ADD §9.4, FRD FR-CORE-AUD-003 | Fully documented |
| HITL decision audit trail | ADD §4.6 | Fully documented |
| LLM usage attribution by domain/workflow | ADD §7.2 | Fully documented |
| Credential redaction in logs | Coding Guidelines §6.1, 05d §11.2 | Documented (incomplete for PII) |
| HR domain retention policies | hr-domain-addendum §3.3 | Documented (domain-level only) |

---

## Resolution Status

- [x] E1: Document prompt injection defenses — ADD §14.5.1
- [x] E2: Document LLM output validation — ADD §14.5.1
- [x] E3: Extend Pino redaction to cover all PII fields — ADD §14.3.1
- [x] E4: Document audit log IP anonymization and user_agent handling — ADD §14.3.1
- [x] E5: Document PII filtering for third-party log exports — ADD §14.3.1
- [x] E6: Add retention periods for all PII data types — ADD §9.4.2
- [x] E7: Document PII deletion/anonymization procedure with cascade — ADD §9.4.2
- [x] E8: Qualify BRD "indefinite analytics retention" — BRD §2.2
- [x] E9: Add budget cap for DO App Platform auto-scaling — Runbook §3.2.1
- [x] E10: Add retention period for uploaded files — ADD §9.4.2
- [x] External model sign-off

## Sign-Off

| Model | Verdict | Notes |
|-------|---------|-------|
| Gemini (gemini-3-flash-preview) | **PASS** (all 10) | Verified all sections, confirmed retention matrix, PII redaction, and cost controls |
| Codex (o3) | **PASS** (all 10) | Verified with line-level citations for each fix |
| Claude (opus-4-6 lead expert) | **PASS** (all 10) | Authored fixes |

---

*Generated by multi-model consensus review. Models: Gemini (gemini-3-flash-preview), Codex (o3), Claude (opus-4-6 lead expert).*
