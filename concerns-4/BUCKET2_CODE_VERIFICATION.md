# Bucket 2: Code Verification Results

**Date**: 2026-04-20
**Purpose**: Verify docs-vs-code reality for 7 findings where truth was unclear from docs alone
**Method**: Direct code inspection (schema, package.json, source files, route directories)

---

## Results

### ✅ VERIFIED: Gemini was right on 4 items

| # | Finding | Ground truth | Action |
|---|---------|--------------|--------|
| 9 | Pino/Sentry installed in apps/web? | **NOT installed**. No pino/sentry/otel deps. `safe-logger.ts` is explicit stub ("until Pino + Sentry are wired... tracked as CR-2-FOLLOWUP") | Acknowledged gap. Reclassify ERROR → WARN — PII redaction still works via `sanitizeForLogging`, but aggregation is missing. |
| 10 | `ip_address_full` column present? | **NOT in schema** (`packages/database/src/schema/audit-logs.ts`) | ERROR confirmed. Either implement or remove the 24h anonymization claim from ADD §14.3/§14.10. |
| 11 | `outcome` field in AuditEventInput? | **NOT in code** (`packages/audit/src`) | WARN confirmed. Schema addition needed if auditors require it. |
| 12 | `safeFetch()` actually wired? | **Exported, only used in test file** (`p1.5-06-security-integration.test.ts`). Zero production imports. | RR-7 correctly flagged as "partial" — implementation exists but not called from any outbound webhook path. |

### ✅ VERIFIED: Code matches the NEW TSD (contradicts old ADD)

| # | Finding | Ground truth | Action |
|---|---------|--------------|--------|
| 13 | `audit_write_dlq` table + hash-chain active? | **YES — both fully implemented**. `auditWriteDlq` table in schema, `dlq-store-drizzle.ts` adapter, `computeAuditHash()` in `hashing.ts`, `chainHead` locking and `previousHash` in `audit-service.ts`. | **Resolves Tier 1 C7, C8 + all 4 hash-chain contradictions**. TSD audit.md (v1.0.0) is correct. Update **ADD §2.3.2 and §9.3** to remove "deferred Phase 3+" language and reflect as-built. This also reconciles `durable-persistence` ERROR (moves from human-review to autonomous). |

### ✅ VERIFIED: Supabase JWT — Runbook was right, ADD §8.9 was wrong

| # | Finding | Ground truth | Action |
|---|---------|--------------|--------|
| 14 | Supabase JWT: symmetric env var or JWKS-only? | **JWKS-only** via Supabase SDK. `rbac-resolver.ts` uses `supabase.auth.getUser()`. No `SUPABASE_JWT_SECRET` usage, no `jwtVerify` or `createRemoteJWKSet`. | Update **ADD §8.9** to remove `SUPABASE_JWT_SECRET` from per-secret access control table. Runbook §4.3 ("Supabase-managed") is correct. |

### ⚠️ NEW FINDING: Admin endpoints in code ≠ admin endpoints in OpenAPI

| # | Finding | Ground truth | Action |
|---|---------|--------------|--------|
| 15 | Admin paths in code match OpenAPI? | **NO — 2 undocumented endpoints in code** | **NEW ERROR** |

**Code has 7 admin routes**:
- `/api/admin/overview`
- `/api/admin/audit`
- `/api/admin/hitl`
- `/api/admin/llm-usage`
- `/api/admin/llm-usage/budget`
- `/api/admin/approval-sla` ← **not in OpenAPI**
- `/api/admin/feature-flags` ← **not in OpenAPI**

**OpenAPI documents only 5**. `approval-sla` and `feature-flags` route handlers exist in code but are missing from OpenAPI, ADD §15.2 endpoint table, and admin-ops-api.md TSD.

---

## Impact on Earlier Classification

Before verification: 27 ERRORs, 8 needed user input, 7 needed verification, 12 autonomous.

**After verification, reclassification**:

- **Resolves autonomously** (no user input needed):
  - Audit hash-chain status → update ADD §2.3.2/§9.3 to reflect as-built (was bucket #2)
  - Supabase JWT storage → update ADD §8.9 to match Runbook (was in secrets WARN)
  - Pino/Sentry gap → downgrade to WARN, reference CR-2-FOLLOWUP
- **New items surfaced**:
  - Admin endpoints `approval-sla` and `feature-flags` undocumented in OpenAPI/ADD (new ERROR)
- **Still requires user input** (bucket 1 items 1, 3, 4, 5, 6, 7, 8 — 7 items, down from 8)

---

## Next Steps

1. Proceed with **bucket 3 autonomous reconciliation** on these verified items + the original 12 autonomous items
2. Return to user with the **narrowed bucket 1** (7 business decisions) plus recommendations on each

### Bucket 3 expanded list (now 17 items)

1. MCP success rate → 99% (BRD SSOT)
2. Audit DLQ alert threshold → DLQ > 0 (or low value) to match zero-loss
3. Webhook body 256KB canonical
4. LLM retry budget text vs code
5. Service-to-service API keys → FRD Phase 2+ mark
6. Health check path → `/health/live` (OpenAPI SSOT)
7. OpenAPI admin schemas missing `required`
8. Sunset/Deprecation headers → add to OpenAPI
9. FR-CORE-ADM-*/OBS-* coverage verification against 2026-03-04 RTM
10. MCP/Crypto/Inngest WebSocket lifecycle docs
11. Supabase Auth change-control documentation
12. 7 error paths test spec mapping
13. **NEW** Audit hash-chain status → update ADD §2.3.2/§9.3 (as-built)
14. **NEW** Supabase JWT mechanism → update ADD §8.9 (remove env var)
15. **NEW** Admin endpoints `approval-sla`/`feature-flags` → add to OpenAPI + ADD §15.2
16. **NEW** Downgrade Pino/Sentry finding (stub is documented as CR-2-FOLLOWUP)
17. Decide whether to implement or remove `ip_address_full` claim
