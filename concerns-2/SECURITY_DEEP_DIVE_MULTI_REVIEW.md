# Security Deep-Dive — Multi-Model Review (Session 1)

**Concerns Evaluated**: auth-boundary-consistency, auth-scheme-compliance, secrets-management, input-validation
**Date**: 2026-03-01
**Reviewers**: Gemini (gemini-3-flash-preview), Codex (o3), Claude (opus-4-6 lead expert)

---

## Executive Summary

Four security concerns were evaluated in a single bundled session against 6 core Aptivo platform documents. The platform demonstrates strong security fundamentals — global BearerAuth with deny-by-default RBAC, Zod schema validation at all boundaries, HMAC webhook signatures, ClamAV malware scanning, and append-only audit logging. The STRIDE-based threat analysis added in tier-1 (ADD §14) significantly strengthens the security posture documentation.

**Verdict: CONDITIONAL PASS — 1 ERROR (hard block), 14 consolidated WARNINGs.**

The single ERROR is an inventory gap: LLM provider API keys are referenced in the ADD but absent from all secrets inventories. The WARNINGs cluster around three themes: (A) auth details deferred to Supabase without explicit configuration documentation, (B) secrets lifecycle gaps (rotation inconsistencies, missing access control), and (C) payload size limits not uniformly documented.

| Concern | Gemini | Codex | Claude | Consensus |
|---------|--------|-------|--------|-----------|
| auth-boundary-consistency | 0E/1W | 1E/2W | 0E/5W/1N | 0E/5W |
| auth-scheme-compliance | 0E/1W | 1E/2W | 0E/6W | 0E/5W |
| secrets-management | 2E/0W | 3E/1W | 1E/8W | 1E/7W |
| input-validation | 0E/1W | 0E/3W | 0E/6W/2N | 0E/4W |
| **Total** | **2E/3W** | **5E/8W** | **1E/25W** | **1E/14W** (deduplicated) |

---

## Consensus ERROR — Hard Block

### E1: LLM Provider API Keys Missing from Secrets Inventory
**Consensus**: Claude (high confidence). Gemini and Codex missed.
**Verified**: ADD §7.1 documents a multi-provider LLM Gateway (OpenAI, Anthropic, Google). ADD §14.5 documents prompt injection threats. But `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_AI_API_KEY` do NOT appear in:
- Configuration spec §1.1 (required env variables) — absent
- Runbook §4.3 (secrets rotation table) — absent
- Any secrets inventory document

These are critical API keys for paid external services. A leaked key bypasses all application-level budget controls (ADD §7.2). ADD §14.4 RR-1 identifies that MCP processes inherit all env vars — including these keys.

**Trigger**: secrets-management failure_condition §1: `storage_documented is FALSE for a referenced secret`

---

## Consensus WARNINGs — By Theme

### Theme A: Auth Details Deferred to Supabase (5 WARNINGs)

The ADD delegates many auth details to "Supabase handles this" without documenting specific configurations, creating gaps between FRD requirements and ADD implementation.

| ID | Warning | Flagged By | FRD Source |
|----|---------|------------|------------|
| W1 | **Access control matrix missing** — FRD defines roles but no explicit mapping of roles to endpoints exists. API Spec shows 403 responses but doesn't specify which role is required. | All 3 | FR-CORE-ID-002 |
| W2 | **MFA enforcement not designed** — FRD requires MFA for elevated permissions. TSD mentions TOTP Phase 1. But ADD has no technical MFA enforcement flow. | All 3 | FR-CORE-ID-001 |
| W3 | **Session controls deferred** — FRD requires configurable timeouts, concurrent session limits, token rotation on privilege change. ADD says "Supabase handles it." | Codex + Claude | FR-CORE-ID-003 |
| W4 | **JWT token lifetimes / refresh details undocumented** — Token expiry, refresh rotation, storage location (HttpOnly vs localStorage) all deferred to Supabase defaults. | Claude | FR-CORE-ID-003 |
| W5 | **Session revocation lacks app-level API** — FRD requires admin revocation. ADD says "via Supabase dashboard or API" but no application endpoint exists. | Claude | FR-CORE-ID-003 |

### Theme B: Secrets Lifecycle Gaps (5 WARNINGs)

| ID | Warning | Flagged By | Evidence |
|----|---------|------------|----------|
| W6 | **Rotation cadence inconsistent across docs** — Config spec: API keys 180d, JWT 365d. Runbook: API keys 90d, JWT 180d. Two conflicts in the same table. | All 3 | Config spec §3.2 vs Runbook §4.3 |
| W7 | **BRD says "Vault or equivalent"**, ADD/Runbook say DO App Platform env vars — unreconciled contradiction | Gemini | BRD line 339 vs ADD §10, Runbook §4.3 |
| W8 | **Zero-downtime rotation procedures absent** — Rotation cadences exist but no dual-key support, grace periods, or step-by-step rotation procedures documented for any secret. | All 3 | Runbook §4.3 |
| W9 | **Webhook HMAC + INNGEST_SIGNING_KEY + NOVU/S3/Redis keys** — no rotation policies. 6 secrets have storage documented but no rotation cadence. | Codex + Claude | ADD §12.2-12.3, §14.8; Config spec §1.1 |
| W10 | **Per-secret access control undocumented** — No secret documents who/what can access it (DO team roles, service accounts, CI/CD scope). MCP env inheritance (RR-1) amplifies this. | Codex + Claude | All secrets |

### Theme C: Payload Size & Validation Gaps (4 WARNINGs)

| ID | Warning | Flagged By | Evidence |
|----|---------|------------|----------|
| W11 | **Inbound webhook payload size** — `additionalProperties: true` with no body size limit specified in API Spec or ADD. | Codex + Claude | API Spec §webhooks/inbound |
| W12 | **Global API body size limit** — Individual field constraints exist but no gateway-level JSON body size/depth limit documented. | Codex + Claude | API Spec, Coding Guidelines |
| W13 | **LLM output validation** — LLM responses are untrusted external input but no structural or content validation documented. ADD §14.5 marks this as accepted residual risk. | Claude | ADD §7.1, §14.5 |
| W14 | **MCP tool response size limits** — Zod schema validation exists but no max response size or memory limits for MCP processes. | Claude | ADD §5.3, §14.4 |

---

## Debated Items & Verdicts

### Debate 1: Service-to-Service Auth — ERROR or WARNING?

**Codex**: ERROR — FRD requires "Internal API keys for S2S auth" but ADD has no implementation.
**Claude**: WARNING — Phase 1 monolith has no internal service boundaries. Only real S2S boundary is Inngest Cloud → app (secured via INNGEST_SIGNING_KEY, ADD §14.8).
**Gemini**: Not flagged.
**Evidence**: ADD §10.1-10.2 documents a single-container monolith deployment on DO App Platform. There are no separate microservices requiring internal API keys. The Inngest Cloud → app boundary IS documented (§14.8).
**Verdict**: **WARNING (W-ABC-4, not included above as separate item — folded into Theme A as architectural note).** The FRD requirement is premature for Phase 1 monolith. Document in ADD §8 that S2S auth is deferred because Phase 1 is a monolith, and list which boundaries ARE secured (Inngest signing key, webhook HMAC).

### Debate 2: MFA Enforcement — ERROR or WARNING?

**Codex**: ERROR — FRD mandates MFA but ADD is "non-compliant."
**Claude**: WARNING — Supabase Auth supports TOTP MFA natively. TSD §3.4 mentions "MFA: TOTP Phase 1." The gap is in ADD's technical design, not a fundamental non-compliance.
**Gemini**: WARNING — Same reasoning.
**Evidence**: Supabase Auth does support TOTP MFA enrollment and verification. The FRD says "MFA enforced for users with elevated permissions." The TSD acknowledges it. The ADD just doesn't document how it's technically enforced.
**Verdict**: **WARNING.** The implementation path exists (Supabase MFA). The gap is documentation, not architecture. Document which operations require MFA step-up and how Supabase's MFA API is integrated.

### Debate 3: Async Auth Context Propagation

**Claude only**: WARNING — Inngest workflow steps, BullMQ jobs, and notification dispatch access protected resources but auth context propagation is undocumented.
**Codex/Gemini**: Not identified.
**Evidence**: ADD §3.2 shows Inngest `step.run()` activities executing with system-level access. ADD §4.5.1 records `decidedBy` in HITL decisions. But no documentation describes how the initiating user's identity flows through async operations.
**Verdict**: **WARNING accepted.** Valid architectural concern. Background jobs accessing domain data without user-scoped authorization could bypass RBAC. Document whether workflows use system credentials (with audit trail) or user-scoped credentials.

### Debate 4: Gemini's Low Gap Count

**Gemini**: 2E/3W total across all 4 concerns (much lower than Codex/Claude).
**Root cause**: Gemini evaluated fewer items per concern (3-6 vs Claude's 10-15) and accepted "Supabase handles it" as sufficient documentation.
**Verdict**: Gemini undercounted. The concern schemas require EXPLICIT documentation, not implied Supabase defaults. However, Gemini correctly identified the BRD Vault contradiction that other models missed.

---

## Well-Documented Security Controls

| Control | Location | Status |
|---------|----------|--------|
| Global BearerAuth with deny-by-default | API Spec line 2384 | Fully documented |
| Public endpoint opt-outs (health, auth, inbound webhooks) | API Spec `security: []` | Fully documented |
| RBAC with core + domain roles | ADD §8.3 | Fully documented (missing endpoint mapping) |
| Zod validation at all boundaries | Coding Guidelines §2.2, §4.5 | Fully documented |
| HMAC webhook signatures | ADD §12.2-12.3 | Fully documented |
| ClamAV malware scanning | ADD §9.8 | Fully documented |
| HITL JWT token security | ADD §4.2, §14.2 | Fully documented (claims TBD) |
| STRIDE threat analysis | ADD §14.1-14.9 | Fully documented (tier-1 addition) |
| Secret storage (DO encrypted env vars) | Runbook §4.3 | Documented (access control TBD) |
| Gitleaks scanning | Runbook §6.2 | Fully documented |

---

## Resolution Status

- [x] E1: Add LLM provider API keys to secrets inventory
- [x] W6: Reconcile rotation cadence conflicts (config spec vs runbook)
- [x] W7: Reconcile BRD Vault reference with DO env var reality
- [x] W1: Add access control matrix to ADD §8.3
- [x] W8: Add rotation procedure notes to Runbook §4.3
- [x] External model sign-off

## Sign-Off

| Model | Verdict | Notes |
|-------|---------|-------|
| Gemini (gemini-3-flash-preview) | **PASS** (all 5) | Verified all files, confirmed rotation alignment, noted ACL has 17 operations |
| Codex (o3) | **PASS** (all 5) | All fixes confirmed |
| Claude (opus-4-6 lead expert) | **PASS** (all 5) | Authored fixes |

---

*Generated by multi-model consensus review. Models: Gemini (gemini-3-flash-preview), Codex (o3), Claude (opus-4-6 lead expert).*
