# Tier 2 Security Cluster — Multi-Model Review

**Date**: 2026-04-20
**Concerns**: 7 — auth-boundary-consistency, auth-scheme-compliance, input-validation, logging-pii-compliance, secrets-management, llm-safety-envelope, error-path-coverage

---

## Executive Summary

- **Total findings**: 23 (4 ERROR, 14 WARN, 5 NOTE)
- **New findings vs previous eval (`concerns-2/`)**: ~10 new issues surfaced, most related to as-built Phase 1.5 documentation gaps and contradictions
- **Notable**: Gemini proactively inspected source code beyond the self-contained prompt for `logging-pii-compliance`, revealing actual implementation gaps (Pino/Sentry not installed). These warrant validation.
- **Confirmed resolved**: RR-1 MCP env exfiltration (sanitizeEnvForMcp), S2-W12 LLM Usage Dashboard

---

## 1. auth-boundary-consistency (Gemini): 4 gaps

| Severity | Finding | Source |
|----------|---------|--------|
| **ERROR** | "Recruiting Coordinator" role in HR FRD §6.1 has NO implementation in HR Domain ADD §5.1 or Platform ADD §8.3 | HR FRD vs ADD §8.3/§5.1 |
| WARN | Crypto ADD §5.1 implements `trader-readonly` and `risk-manager` roles NOT defined in Crypto FRD | Crypto FRD vs ADD |
| WARN | Auth context propagation into Inngest async workflows not documented — background jobs may lose actor context | ADD §3.5, §5.4.1, §14.10 |
| WARN | `role_permissions` table missing from Data Architecture §9.1 despite being critical to RBAC resolver | ADD §9.1 vs §14.10 |

## 2. auth-scheme-compliance (Codex): 0 gaps

All 5 auth schemes fully documented: Magic Link, JWT/Supabase, RBAC (checkPermission), MFA step-up, Inngest signing key. Service-to-service API keys correctly declared as Phase 2 exclusion.

## 3. input-validation (Gemini): 1 gap

| Severity | Finding |
|----------|---------|
| WARN | MCP tool outputs have Zod validation but sanitization not explicitly documented (unlike LLM outputs) — potential injection vector |

## 4. secrets-management (Codex): 7 gaps

| Severity | Finding |
|----------|---------|
| **ERROR** | **Data-at-Rest Encryption Keys undocumented**: storage, rotation, cryptoperiod, access control all missing |
| WARN | **Webhook HMAC Secrets storage inconsistent**: Runbook says PostgreSQL encrypted column; ADD §8.8/§8.9 say WEBHOOK_SECRET_* env vars; API Spec says write-only request data |
| WARN | **Supabase JWT Secret storage inconsistent**: Runbook says Supabase-managed; ADD §8.9 says `process.env` |
| WARN | **SUPABASE_SERVICE_ROLE_KEY** missing from rotation table (§8.8) and Runbook §4.3 inventory |
| WARN | **AUTH_SECRET** in env validation but absent from secrets inventory |
| WARN | **TLS certificate access control** not documented (who can manage DO App Platform certs) |
| WARN | **DATABASE_URL rotation cadence** conflict: Runbook "90 days" vs ADD §8.8 "on compromise only" |

## 5. logging-pii-compliance (Gemini): 5 gaps ⚠️ includes code inspection

| Severity | Finding |
|----------|---------|
| **ERROR** | Pino/Sentry **not installed in apps/web** — package.json lacks dependencies. Documented redaction stack is aspirational, not enforced. |
| **ERROR** | `ip_address_full` column missing from audit-logs schema — 24h anonymization policy unimplementable |
| WARN | `outcome` field missing from `AuditEventInput` type (schema requires explicit success/failure) |
| WARN | DO Load Balancer access logs contain unredacted IPs — Phase 2 deferred |
| NOTE | `DEFAULT_MASKING_CONFIG` missing fields present in Pino redact list (password, token, secret, creditCard) |

**⚠️ Gemini went beyond the prompt** and inspected `apps/web/package.json`, `packages/audit/src/types.ts`, etc. These findings about actual code state are valuable but should be manually verified — they are outside the "documentation validation" concern scope.

## 6. llm-safety-envelope (Codex): 2 gaps

| Severity | Finding |
|----------|---------|
| WARN | Per-user/session rate limits deferred to Phase 2 (acknowledged exclusion, but schema wants it documented) |
| NOTE | Monthly budget inconsistency — $500 in §7.2/§7.4/§14.5.1 vs $1,000 in §7.2.2/§15.4 (also C1 from contradiction-scanner) |

## 7. error-path-coverage (Gemini): 4 gaps, all ERROR

| Severity | Finding |
|----------|---------|
| **ERROR** | SSRF validator lacks documented test specification |
| **ERROR** | Admin API auth failure paths (401/403) lack test specs |
| **ERROR** | LLM budget enforcement caps lack test coverage docs |
| **ERROR** | **Systemic: 7/7 error paths have no documented test specifications** — no `05b-Testing-Strategies.md` mapping |

---

## Delta Against Previous Evaluations

| Prior finding | Status now |
|---------------|-----------|
| S2-W12 LLM Usage Dashboard missing | **RESOLVED** |
| RR-1 MCP env exfiltration | **RESOLVED** |
| S2-W17 burn-rate alerting deferred | Still deferred (Phase 2) |
| S3-W10 event schema rollout | **RESOLVED** (Sprint 9) |
| RBAC middleware missing | **RESOLVED** via §14.10 |

New findings not in prior evaluations:
- Recruiting Coordinator role mismatch (FRD vs ADD)
- Monthly LLM budget inconsistency ($500 vs $1000)
- Data-at-rest encryption keys undocumented
- Webhook secret storage inconsistency
- Supabase JWT secret storage inconsistency
- Pino/Sentry not installed (if verified)
- Error path test specifications missing

---

## Priority Actions

### ERROR (4) — Address before Tier 2 completion
1. **Recruiting Coordinator role**: Add to HR Domain ADD §5.1 permission matrix
2. **Encryption keys**: Document key manager, rotation, access control in §8.8
3. **Pino/Sentry installation**: Verify gap; if real, install and wire (else update docs)
4. **Error path test specs**: Create mapping document or add test specs section

### WARN (14) — Address in Phase 2 planning
- Webhook secret storage canonical model
- Supabase JWT secret mechanism clarity
- DATABASE_URL rotation cadence reconciliation
- Auth context propagation through Inngest (P2)
- role_permissions table documentation
- MCP output sanitization policy
- ip_address_full column implementation
- `outcome` field in audit schema
- DO access log anonymization strategy

### NOTE (5) — Track in WARNINGS_REGISTER
- DEFAULT_MASKING_CONFIG alignment
- Monthly LLM budget normalization
