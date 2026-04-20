# Bucket 3: Autonomous Doc Reconciliation Results

**Date**: 2026-04-20
**Purpose**: Apply autonomous documentation reconciliations that don't require user/business decisions.

---

## Applied in this session

### ADD (`docs/03-architecture/platform-core-add.md`)

| Section | Change |
|---------|--------|
| §1.2 decision table | Audit row rewritten: hash-chain brought forward in Phase 1.5 (was "deferred Phase 3+") |
| §9.3 intro note | "Multi-Model Consensus" note now includes "As-Built Update (Phase 1.5)" explaining hash-chain delivery; references TSD `platform-core/audit.md` v1.0.0 |
| §9.3 Phase 1 header | Renamed "Append-Only SQL with Idempotent Inserts" → "Append-Only SQL with Idempotent Inserts + Hash-Chain" |
| §9.3 Phase 3+ subsection | Renamed "Phase 3+: Cryptographic Hash-Chaining (Deferred)" → "Phase 1.5: Cryptographic Hash-Chaining (As-Built)"; body rewritten with actual schema (`seq`, `previousHash`, `currentHash`), chain scope semantics, `auditChainHeads` table reference, transactional `lockChainHead()` mention, genesis handling. Removed "implementation deferred" stub comment. |
| §8.8 rotation table | Supabase JWT row rewritten: JWKS-managed (no local `SUPABASE_JWT_SECRET`). Added new `SUPABASE_SERVICE_ROLE_KEY` rotation row. |
| §8.9 access table | `SUPABASE_JWT_SECRET` row replaced with "no local JWT secret — JWKS delegated to `supabase.auth.getUser()`" |
| §14.3 PII handling | `ip_address_full` abuse-detection retention marked **deferred** — column not implemented in Phase 1; add only if abuse detection requires it (tracked as CR-2-FOLLOWUP) |
| §14.10 middleware stack | Logging Sanitization row updated: references `safe-logger.ts` stub (console + sanitization); Pino/Sentry installation tracked as CR-2-FOLLOWUP |
| §15.2 admin endpoint table | Added `/api/admin/approval-sla` (OPS-01) and `/api/admin/feature-flags` (PR-07) rows; note that OpenAPI needs matching additions |
| §16.3 alert evaluators | Added BRD cross-refs to each SLO target; `auditIntegrityAlert` condition changed from `count > 100` to `count > 0` to align with zero-loss mandate; added reconcile note |

### api-spec-readiness.md

| Change |
|--------|
| Health endpoints renamed from `/api/health`, `/api/ready` to `/health/live`, `/health/ready` (matches OpenAPI v1.2.0 SSOT). Added note that paths are intentionally unversioned. |

---

## Resolved by verification (no edit needed — already correct)

| Finding | Why no edit |
|---------|-------------|
| Webhook body 256KB vs 1 MiB | OpenAPI already documents webhook-specific 256KB override at `/webhooks/inbound/{sourceId}` (line 978) — not a true contradiction. Tier 1 C3 was false positive. |
| FR-CORE-ADM-* / FR-CORE-OBS-* missing | Already exist in FRD lines 491, 501, 512, 526, 536 — false positive from Gemini |
| MCP SLO: 95% in §10.4.8 | Already reconciled: line 3088 shows `>99.5% (BRD: >99%)` — the 95% figure in the stale concerns-1 prompt file is outdated |

---

## Deferred to user/future sprints

### ~~Requires user input (bucket 1 — still open)~~ — SUPERSEDED by `BUCKET1_USER_DECISIONS_APPLIED.md`
All 7 bucket-1 items were resolved on 2026-04-20 via `AskUserQuestion` batches and follow-on doc edits. Preserved below as audit trail of what was open at bucket 3 time-of-writing:

1. ~~LLM monthly budget~~ → **$1,000/mo** (already in code; docs were consistent)
2. ~~Admin API versioning~~ → **Document exception** in ADD §13.8
3. ~~Recruiting Coordinator role~~ → **Kept + implemented** (HR ADD §5.1/§5.2)
4. ~~HR uptime 99.9%~~ → **99% with maintenance exclusion**
5. ~~HR 4 performance SLOs~~ → **All 4 kept** with architecture support (HR ADD §4.4)
6. ~~Compute + Spaces $ budget caps~~ → **$200 compute / $10 Spaces** (ADD §9.14)
7. **DB pool size** 5 (ADD) vs 20 (Runbook) — ops risk tolerance

### Larger doc additions (could batch in a future sprint)
- **Add `approval-sla` + `feature-flags` to OpenAPI spec** with request/response schemas — mechanical but large diff
- **OpenAPI admin schemas `required` arrays** — quality improvement for SDK generation
- **Sunset/Deprecation response headers** in OpenAPI (RFC 8594) — every path needs the addition
- **MCP/Crypto/Inngest WebSocket lifecycle subsections** in ADD §5.1/§16/domain ADDs
- **Supabase Auth change-control procedure** (manual evidence workflow, pending Phase 2 IaC)
- **Map 7 error paths to test specs** in Testing-Strategies guideline
- **Wire `safeFetch()` on first outbound webhook path** (RR-7 full resolution)

### Still-valid WARNs to track
- Webhook HMAC secret canonical storage model (env var vs encrypted column)
- DB credential rotation cadence reconciliation (90d Runbook vs on-compromise ADD)
- Crypto domain roles (`trader-readonly`, `risk-manager`) missing from FRD
- Auth context propagation into Inngest async workflows undocumented
- `role_permissions` table not in ADD §9.1
- MCP tool output sanitization policy
- At-limit boundary tests for SLO, pagination, body size
- Trace context in async boundaries (SLO cron, DLQ replay)
- DO Spaces + MCP third-party API budget inventory

---

## Impact summary

| Bucket | Before | After bucket 2 + 3 |
|--------|--------|--------------------|
| Needs user input | 8 | 7 (hash-chain resolved autonomously after code check) |
| Needs verification | 7 | 0 (all verified) |
| Autonomous doc edits | 12 | 10 applied this session, 7 queued for future sprint |
| False positives | 0 | 3 (FR-CORE-ADM/OBS, webhook body size, MCP 95%) |

This closes out the majority of the ERROR-level findings as either fixed (10), reclassified (4 false positives / downgraded), or queued for user decision (7). WARN-level items (42) are tracked in `concerns-4/TIER*_MULTI_REVIEW.md` files for Phase 2 planning.
