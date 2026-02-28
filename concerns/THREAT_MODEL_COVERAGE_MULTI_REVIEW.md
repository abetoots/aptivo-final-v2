# Threat Model Coverage — Multi-Model Review

**Concern**: `threat-model-coverage` v1.0
**Severity**: ERROR (blocking)
**Date**: 2026-02-28
**Reviewers**: Gemini (gemini-3-flash-preview), Codex (o3), Claude (opus-4-6 lead expert)

---

## Executive Summary

Three independent AI models evaluated the Aptivo platform documentation for threat model coverage: whether every documented attack surface has a corresponding threat model that enumerates threats using a recognized methodology (STRIDE, DREAD, attack trees) and maps each threat to a documented mitigation or accepted residual risk.

**Verdict: FAIL — systemic gap. No formal threat model exists for any attack surface.**

The Aptivo documentation demonstrates strong **informal security engineering** — JWT-signed approval tokens, HMAC webhook verification, ClamAV malware scanning, idempotency keys for financial operations, append-only audit logs. These are excellent implementation patterns. However, they are documented as resilience/correctness features, never as mitigations mapped to enumerated threats. No document uses STRIDE, DREAD, attack trees, or any formal threat modeling methodology. `rg "STRIDE|DREAD|attack.tree|threat.model"` returns zero matches across all 6 reviewed documents.

The distinction matters: having security controls is not the same as having a threat model. Without enumerated threats, the team cannot verify control completeness, identify gaps, or reason about residual risk. This is especially critical because the platform handles PII (HR domain candidates), enables financial operations (crypto trade execution via MCP), and routes user-controlled data through LLM prompts.

| Metric | Gemini | Codex | Claude | Consensus |
|--------|--------|-------|--------|-----------|
| Attack surfaces identified | 5 | 11 | 16 | **14** (canonical) |
| Surfaces with formal threat model | 5 (overcounted) | 0 | 0 | **0** |
| ERROR gaps | 2 | 7 | 8 | **8** |
| WARNING gaps | 1 | 4 | 5 | **5** |

---

## Attack Surface Inventory (Canonical — 14 Surfaces)

| # | Attack Surface | Type | Gemini | Codex | Claude | Notes |
|---|---------------|------|--------|-------|--------|-------|
| 1 | REST API (~30 endpoints) | api-endpoint | — | ✓ | ✓ | Codex + Claude. Full OpenAPI spec documented |
| 2 | Authentication Flow (magic link, OAuth) | auth-flow | — | ✓ | ✓ | Codex + Claude. Delegates to Supabase Auth |
| 3 | RBAC Authorization | auth-flow | — | — | ✓ | Claude only. Role assignment and domain roles |
| 4 | HITL Approval Gateway | api-endpoint | ✓ | ✓ | ✓ | All 3. Best-documented security controls |
| 5 | Inbound Webhooks | other | ✓ | ✓ | ✓ | All 3. HMAC + dedup documented |
| 6 | Inngest Webhook Endpoint | other | — | — | ✓ | Claude only. Not in API spec at all |
| 7 | PostgreSQL PII Data Store | data-store | ✓ | ✓ | ✓ | All 3. Schema isolation + data classification |
| 8 | Redis Cache | data-store | — | — | ✓ | Claude only. Idempotency + sessions |
| 9 | Secrets/Credentials | data-store | — | ✓ | ✓ | Codex + Claude. DO encrypted env vars |
| 10 | File Upload/Storage | file-upload | ✓ | ✓ | ✓ | All 3. ClamAV scanning documented |
| 11 | MCP Tool Execution | other | ✓ | ✓ | ✓ | All 3. Highest-risk external boundary |
| 12 | LLM Gateway (Prompt Injection) | other | — | — | ✓ | Claude only. OWASP LLM #1 |
| 13 | Outbound Webhooks | other | — | ✓ | ✓ | Codex + Claude. SSRF risk via user-supplied URLs |
| 14 | Notification Bus | other | — | ✓ | ✓ | Codex + Claude. Email/Telegram delivery |

---

## Consensus Findings

### ERRORS — Blocking (must fix before sign-off)

#### E1: No Formal Threat Model Methodology Applied Anywhere
**Consensus**: All 3 (Gemini high, Codex high, Claude high).
**Verified**: `rg "STRIDE|DREAD|attack.tree|threat.model|threat.analysis"` returns zero matches in all 6 reviewed documents. Sprint 0 SP-06 references "Threat model stdio MCP server execution" as a planned spike deliverable — not a completed artifact. The documentation suite contains zero formal threat models using any recognized methodology.
**Trigger**: failure_condition §1 — `threat_model_exists is FALSE for any attack surface` (applies to all 14 surfaces)

#### E2: PII Data Stores — No Threat-to-Mitigation Mapping
**Consensus**: All 3 (Gemini partial, Codex high, Claude high).
**Verified**: TSD §5.2 defines data classification categories (PII, Sensitive, Internal, Public) with generic controls ("Encryption at rest, audit logging, retention limits"). ADD §9.1 lists all tables with owner annotations. But no document enumerates threats against PII stores: SQL injection paths, unauthorized access vectors, bulk exfiltration, cross-schema access, backup exposure, PII leakage via logs.
**Trigger**: failure_condition §2 — `surface_type is "data-store" with PII and mitigations_documented is NULL` (generic controls without threat mapping)

#### E3: MCP Tool Execution — Adversarial Threat Model Absent
**Consensus**: All 3 (Gemini: SSRF specifically, Codex high, Claude high).
**Verified**: ADD §5.1-5.5 documents resilience patterns (circuit breakers, schema validation, idempotency keys, rate limiting). Sprint 0 SP-06 identifies risks: supply-chain compromise, secret exfiltration via stdio servers, process isolation, over-privileged secrets. But SP-06 is a spike plan, not a completed threat model. `rg "SSRF|server.side.request"` returns zero in reviewed docs. MCP servers execute with environment secrets and make arbitrary network calls.
**Trigger**: failure_condition §1 — no completed threat model; §5 — threats identified (in SP-06) but mitigations not documented

#### E4: LLM Gateway — Prompt Injection Surface Completely Unaddressed
**Consensus**: Claude only. Gemini and Codex missed.
**Verified**: ADD §7.1-7.2 treats the LLM Gateway purely as a cost-control and provider-abstraction layer. LangGraph.js runs inside Inngest `step.run()` for AI reasoning tasks (ADD line 282: "sentiment analysis, narrative clustering"). User-controlled data (candidate resumes, webhook payloads, trade signals) flows into LLM prompts. `rg "prompt.injection"` returns zero matches in all docs. No analysis of: direct prompt injection, indirect injection via MCP-retrieved data, output manipulation affecting HITL decisions, data exfiltration via model responses.
**Trigger**: failure_condition §1 — `threat_model_exists is FALSE` for a surface processing untrusted user input through AI models with tool-calling capabilities. OWASP Top 10 for LLM Applications ranks prompt injection as #1.

#### E5: Authentication & Authorization — No Threat Enumeration
**Consensus**: Codex high + Claude high. Gemini missed.
**Verified**: ADD §8.1-8.4 documents Supabase Auth integration, JWKS caching, RBAC model. API Spec shows magic link and OAuth callback endpoints. FRD §9 requires MFA for elevated permissions. But no threats enumerated: magic link interception, OAuth redirect manipulation, session fixation, token replay, account enumeration, privilege escalation, Supabase trust boundary.
**Trigger**: failure_condition §1 — `threat_model_exists is FALSE` for authentication endpoints

#### E6: HITL Approval Gateway — No Formal Threat Model
**Consensus**: Codex high + Claude high. Gemini classified as having a threat model (overcounted).
**Verified**: ADD §4.2 documents JWT signing with HS256 symmetric secret (`HITL_SECRET`). ADD §4.5.1 documents idempotent decision recording with race condition guards. These are strong implementation controls — but NOT a threat model. No document enumerates: token theft via notification channels, HITL_SECRET compromise (single symmetric key = forge any approval), token replay, approver impersonation, social engineering via manipulated approval context.
**Trigger**: failure_condition §1 — implementation controls ≠ threat model. The HITL Gateway controls financial operations (trade approval) and hiring decisions — highest business impact surface.

#### E7: File Upload — No Formal Threat Model
**Consensus**: Codex high + Claude high. Gemini classified as having threat model (overcounted).
**Verified**: ADD §9.6-9.8 documents ClamAV scanning, presigned URLs, quarantine flow, scan-before-download gate. API Spec specifies 50MB max file size. Good defensive design. But no threat enumeration: path traversal via filename (API Spec accepts `maxLength: 255` with no character restriction), content-type spoofing, decompression bombs, presigned URL leakage, race condition between upload and scan completion, ClamAV bypass techniques.
**Trigger**: failure_condition §1 — file-upload is an explicitly listed attack surface type in the concern schema

#### E8: Inngest Webhook Endpoint — Undocumented and Unanalyzed
**Consensus**: Claude only (medium confidence). Codex and Gemini missed.
**Verified**: Inngest requires an HTTP endpoint (typically `/api/inngest`) served by the application to receive events. This endpoint controls ALL workflow execution. `rg "inngest.*sign|INNGEST_SIGNING|api/inngest"` returns zero matches across all docs. The endpoint is not in the OpenAPI spec. No security analysis exists.
**Trigger**: failure_condition §1 — `threat_model_exists is FALSE` for a critical endpoint. Marked `requires_human_review: true` — the Inngest SDK likely validates a signing key automatically, but this is not documented.

### WARNINGS — Advisory (require acknowledgment)

#### W1: Security Controls Scattered Without Threat-to-Mitigation Mapping
**Consensus**: All 3 models.
Security controls exist throughout the docs (Zod validation, JWT auth, rate limiting, HMAC signatures, ClamAV, RBAC) but are documented as implementation patterns. None are framed as mitigations for specific enumerated threats. The team cannot verify control completeness without a threat inventory to check against.

#### W2: No Security Residual Risk Acknowledged Anywhere
**Consensus**: Claude high.
`rg "residual.risk|accepted.risk"` returns only operational accepted risks (PostgreSQL single instance, Redis single node in ADD §2.3.2). No security-related residual risk is documented. Every surface implicitly claims full mitigation. The concern schema notes this is "unrealistic for complex systems."

#### W3: Outbound Webhook SSRF Risk
**Consensus**: Codex high + Claude high.
When users configure outbound webhooks (POST /api/v1/webhooks), they specify a URL. The system makes HTTP POST requests to this URL. No documented URL validation prevents specifying internal/private IP addresses, cloud metadata endpoints (169.254.169.254), or localhost.

#### W4: Inbound Webhook Incomplete Threat Coverage
**Consensus**: Codex high + Claude high.
HMAC signature verification and deduplication are documented, but: request body schema is `additionalProperties: true` (arbitrary JSON accepted), no body size limit documented, HMAC algorithm strength not specified, webhook secret rotation procedure not documented for inbound sources.

#### W5: Health Check Information Disclosure
**Consensus**: Claude high.
Health endpoints (`/health/live`, `/health/ready`) are unauthenticated (API Spec `security: []`) and return dependency status including database and Redis health, component names, and latency. Infrastructure fingerprinting risk.

---

## Debated Items & Verdicts

### Debate 1: Gemini's Generous Threat Model Classification

**Gemini's position**: HITL Gateway, Audit Service, File Storage, MCP Layer, and Inbound Webhooks all have threat models. Assessment: 2 errors, 1 warning.
**Codex/Claude's position**: None of these have formal threat models. They have strong implementation controls documented alongside features, but no STRIDE analysis, no threat enumeration, no threat-to-mitigation mapping.
**Evidence**: The concern schema states: "A threat model should use a recognized methodology (STRIDE, attack trees, DREAD, or equivalent risk assessment) and explicitly map each identified threat to a mitigation strategy." ADD §4.2 documents JWT signing code — that's an implementation pattern, not a threat model. It never states "Spoofing: an attacker impersonates an approver → Mitigation: JWT signature verification."
**Verdict**: **Codex/Claude correct.** Gemini conflated "has security controls" with "has a threat model." This is the exact pattern the concern schema's poorly_documented example warns about: "Standard security best practices are followed" is not a threat model.

### Debate 2: Is the Financial Flow a Separate Attack Surface?

**Codex's position**: Yes — trade execution and funds transfer via MCP tools constitute a payment-flow surface (ERROR). BRD §8.2 mentions financial transaction logging.
**Claude's position**: The platform core is domain-agnostic. Trade execution is handled by domain-specific MCP servers, not the platform itself. The platform's financial controls ARE the MCP idempotency layer and HITL approval gates, which are separate surfaces.
**Evidence**: ADD §3.4 has a `transferFunds` workflow example. ADD §5.1 lists `executeTrade` as a critical tool requiring idempotency. But these are examples of platform capabilities, not dedicated payment processing.
**Verdict**: **Merge into MCP (E3) and HITL (E6).** The platform doesn't process payments directly — it enables financial operations through MCP tool execution with HITL approval gates. The financial threat analysis belongs within the MCP and HITL threat models, not as a separate surface. If a dedicated crypto domain threat model is needed, it should be in domain-specific docs.

### Debate 3: LLM Prompt Injection — Is This Really an ERROR?

**Gemini**: Not identified.
**Codex**: Not identified.
**Claude**: ERROR — OWASP #1 for LLM applications.
**Evidence**: The platform explicitly routes user-controlled data through LLM prompts. ADD §7.1 describes LangGraph.js running inside Inngest for AI reasoning. The platform connects LLM outputs to workflow decisions (trade execution via HITL, hiring recommendations). BRD §3.1.4 describes "AI-augmented workflows" as a core capability. `rg "prompt.injection"` returns zero matches.
**Verdict**: **Claude correct. ERROR.** The platform's core value proposition is AI-augmented automation. LLM prompt injection is OWASP's #1 vulnerability for LLM applications. User-supplied data (resumes, webhook payloads) flowing into prompts that influence HITL approval recommendations and trade decisions creates a high-impact attack chain. The complete absence of any prompt injection analysis is a significant gap.

### Debate 4: Inngest Endpoint — ERROR or NOTE?

**Context**: Only Claude identified this. The Inngest SDK almost certainly validates a signing key on incoming requests by default.
**Verdict**: **ERROR with `requires_human_review: true`.** Even if the SDK handles signing key verification, this is a critical endpoint that controls all workflow execution and it is completely absent from the API spec and security documentation. The concern schema requires EXPLICIT documentation, not implicit SDK behavior. However, the fix may be as simple as documenting the existing Inngest signing key verification and adding the endpoint to the API spec.

---

## Well-Documented Security Controls (No Formal Threat Model)

The following security controls are thoroughly documented but NOT structured as threat models:

| Control | Location | What It Addresses |
|---------|----------|-------------------|
| JWT-signed HITL approval tokens (HS256) | ADD §4.2 | Token tampering, unauthorized approval |
| Idempotent decision recording + race guards | ADD §4.5.1, §4.6.1 | Duplicate submissions, race conditions |
| MCP idempotency keys (Redis deterministic key) | ADD §5.1.1 | Duplicate side-effecting tool calls |
| Circuit breaker + retry composition (Cockatiel) | ADD §5.2 | Cascading failures, resource exhaustion |
| Zod schema validation (MCP responses) | ADD §5.3 | Malformed external data |
| HMAC webhook signatures | ADD §12.2, §12.3 | Webhook spoofing, payload tampering |
| Redis deduplication (inbound webhooks, 7d TTL) | ADD §12.3.1 | Replay attacks |
| ClamAV malware scanning + quarantine | ADD §9.8 | Malware distribution via file upload |
| Presigned URLs with TTL (S3/Minio) | ADD §9.6, FRD §8.5 | Unauthorized file access |
| Append-only audit logs (REVOKE UPDATE/DELETE) | ADD §9.3 | Log tampering |
| RBAC with deny-by-default | ADD §8.3, FRD §9 | Unauthorized access |
| JWKS caching with stale-if-error | ADD §2.3.2 | Auth service outage |
| Data classification (PII/Sensitive/Internal/Public) | TSD §5.2 | Data handling policy |
| Secret rotation schedules | Runbook §4.3 | Credential compromise |
| Gitleaks scanning | Runbook §6.2 | Secret leakage |

---

## Actionable Recommendations

### Priority 1: Add Security Threat Analysis Section to ADD (new §14)

Create a STRIDE-based threat model covering the 9 highest-priority attack surfaces:
1. Authentication & Authorization (auth flows, RBAC)
2. HITL Approval Gateway (token security, approval integrity)
3. PII Data Stores (PostgreSQL, regulatory compliance)
4. MCP Tool Execution (external boundary, supply chain, SSRF)
5. LLM Gateway (prompt injection, output manipulation)
6. File Upload (malware, path traversal, resource exhaustion)
7. Inbound Webhooks (spoofing, replay, payload abuse)
8. Outbound Webhooks (SSRF via user-supplied URLs)
9. Inngest Webhook Endpoint (workflow trigger security)

Each surface should include: STRIDE threat enumeration, specific mitigations (referencing existing ADD sections), and residual risk acknowledgment.

### Priority 2: Document Inngest Endpoint

Add the Inngest serve endpoint to the API spec or document its security properties (signing key verification, event validation) in the ADD §3 Workflow Engine section.

### Priority 3: Add Residual Risk Register

Document security residual risks with likelihood/impact justification and acceptance authority. Currently only operational risks are acknowledged.

---

## Resolution Status

- [x] ADD §14 — Security Threat Analysis with STRIDE-based threat models for 9 attack surfaces
- [x] ADD §14.9 — Residual Risk Register with 9 risks, likelihood/impact, pre-production blockers
- [x] ADD §3.2 — Inngest serve endpoint security note with signing key requirement
- [x] ADD §15 — References updated with OWASP/STRIDE methodology links
- [x] External model sign-off obtained (see below)

---

## Sign-Off

### Gemini (gemini-3-flash-preview) — PASS

All 8 ERROR-level gaps resolved:
- E1 (Formal methodology): §14 adopts STRIDE framework with structured analysis
- E2 (PII stores): §14.3 provides PII inventory, STRIDE threats, and residual risk register
- E3 (MCP execution): §14.4 addresses SSRF, supply chain, env secret exfiltration as pre-production blocker
- E4 (LLM prompt injection): §14.5 models direct/indirect injection with HITL compensating controls
- E5 (Auth & authorization): §14.1 covers magic link, OAuth, JWT, RBAC threats
- E6 (HITL gateway): §14.2 models token forgery, race conditions, bypass scenarios
- E7 (File upload): §14.6 covers path traversal, malware, ClamAV bypass
- E8 (Inngest endpoint): §14.8 models /api/inngest surface with INNGEST_SIGNING_KEY

Noted positive practice: Residual Risk Register (§14.9) distinguishes mitigated threats from accepted risks with Phase 2 upgrade paths.

### Codex (o3) — PASS

All 8 ERROR-level gaps verified resolved. Noted remaining risk items (documented, not gaps):
- RR-1: MCP env secret exfiltration — pre-production blocker until SP-06 (§14.4, §14.9)
- RR-5: PII log redaction incompleteness — pre-production blocker (§14.3, §14.9)
- RR-7: Outbound webhook SSRF — pre-production blocker (§14.7, §14.9)
- Prompt injection modeled but accepted with compensating controls in Phase 1 (§14.5, §14.9)

**Overall Verdict: PASS.** All 8 ERROR-level gaps resolved. 5 WARNINGs addressed through §14 threat models and residual risk register. 3 pre-production blockers (RR-1, RR-5, RR-7) documented for implementation tracking.

---

*Generated by multi-model consensus review. Models: Gemini (gemini-3-flash-preview), Codex (o3), Claude (opus-4-6).*
