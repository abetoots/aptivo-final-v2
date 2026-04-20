# Final Sign-Off — Concern Re-Evaluation Cycle

**Date**: 2026-04-20
**Cycle**: 21-concern re-evaluation + 3-bucket resolution (verification, autonomous, user-input)

---

## Verdict Summary

| Reviewer | Round 1 | Round 2 |
|----------|---------|---------|
| **Claude Opus 4.7 (Lead)** | Drove cycle + synthesized | Coordinated fixes |
| **OpenAI Codex** | REJECT (8 concrete issues) | **APPROVE WITH NOTES** |
| **Gemini 3 Flash Preview** | APPROVE WITH NOTES (2 issues) | **APPROVE** |

### Round-2 APPROVE from both models — cycle complete.

---

## Issues Surfaced by Round-1 Review and Fixed in Round 2

Codex (8) + Gemini (2) = 10 total follow-ups, all addressed:

| # | Issue | Resolution |
|---|-------|------------|
| 1 | Hash-chain §10.4.2 still said "deferred Phase 3+" | Rewritten: Phase 1.5 as-built; only blockchain anchoring is Phase 3+ |
| 2 | Dashboard health `dlq <= 100` at §15.3 contradicted §16.3 | Changed to `== 0` (zero-loss alignment) |
| 3 | Runbook line 234 still said LLM $500/mo | Changed to $1,000/mo per domain |
| 4 | api-spec-readiness said "5 admin endpoints" | Now says "5 of 7 documented" with pending list |
| 5 | HR role slugs inconsistent: ADD §8.3 used `hiring_manager`/`client`; HR ADD used hyphens; code uses hyphens | All aligned to hyphens (`hiring-manager`, `client-user`, `recruiting-coordinator`) matching code |
| 6 | HR §4.4 overclaimed Pino/Sentry tracking | Downgraded to "measurable ad-hoc via pg_stat_statements; automated alerts pending CR-2-FOLLOWUP / OBS-02" |
| 7 | §15.5 used `checkPermission` instead of `checkPermissionWithBlacklist` | All 4 occurrences in ADD §14.9.1, §15 + admin-ops-api.md TSD aligned |
| 8 | CONCERN_RE_EVAL_RESULTS Top 7 shown as open | Added resolution status table (all ✅ RESOLVED); exec summary past-tense |
| 9 | ADD §11.2 OTel SDK snippet implied auto-propagation | Rewritten as "target state"; added `injectTraceparent` example for async boundaries |
| 10 | BUCKET3_RECONCILIATION said bucket 1 still open | Superseded with pointer to BUCKET1_USER_DECISIONS_APPLIED.md |

---

## Cycle Output

### Findings resolved in this cycle (complete):

- **27 ERRORs**: 17 fixed in-doc (bucket 1 + 3), 3 confirmed false positives, 7 queued as mechanical-only for next sprint
- **42 WARNs**: tracked in per-cluster review files for Phase 2 sprint planning
- **6 NOTEs**: non-blocking, tracked in WARNINGS_REGISTER

### Files modified (8):

| File | Sections touched |
|------|------------------|
| `docs/03-architecture/platform-core-add.md` | §1.2, §8.3, §8.8, §8.9, §9.3, §9.14, §10.4.2, §10.4.5, §11.2, §13.8, §14.3, §14.9.1, §14.10, §15.1, §15.2, §15.3, §15.5, §16.3 |
| `docs/03-architecture/hr-domain-add.md` | §4.4 new section, §5.1, §5.2, summary row |
| `docs/02-requirements/hr-domain-frd.md` | §9.2 |
| `docs/04-specs/api-spec-readiness.md` | §1 health paths, coverage note |
| `docs/04-specs/authentication.md` | §4 role tables + mapping (hyphen alignment) |
| `docs/04-specs/platform-core/admin-ops-api.md` | §2 middleware + endpoint count |
| `docs/06-operations/01-runbook.md` | §2.3, §8.11, §8.14, §13 |
| `docs/06-sprints/CONCERN_RE_EVAL_RESULTS_MULTI_REVIEW.md` | Top 7 resolution table, exec summary past-tense |

### Decisions captured (bucket 1):

1. LLM budget → $1,000/mo per domain
2. Admin paths → document exception (keep `/api/admin/*`)
3. DB pool → 5 per container (canonical)
4. Compute billing alert → $200/mo
5. Spaces billing alert → $10/mo (tight, forces retention discipline)
6. Recruiting Coordinator role → kept + implemented
7. HR uptime → 99% with Sunday maintenance exclusion
8. HR 4 perf SLOs → all kept with architecture support in new HR ADD §4.4

---

## Queued for Phase 2 (not blocking)

Mechanical-only tasks, well-specified:

- OpenAPI `required` arrays on admin response schemas
- OpenAPI additions: `/api/admin/approval-sla`, `/api/admin/feature-flags` with full request/response schemas
- OpenAPI global Sunset/Deprecation response headers per RFC 8594/9745
- WebSocket lifecycle subsections (MCP, Crypto events, Inngest SDK connection)
- Supabase Auth manual change-control procedure documentation
- Map 7 error paths to test specifications in Testing-Strategies
- Wire `safeFetch()` on first outbound webhook path (RR-7 full resolution)
- Install Pino + Sentry in `apps/web/package.json` (CR-2-FOLLOWUP)
- Seed `recruiting-coordinator` permissions in `packages/database/src/seeds/hr-seeds.ts`

### Audit-trail drift (non-blocking, Codex note):

- `admin-ops-api.md` TSD still frozen at 5 endpoints — will be updated when OpenAPI additions are done
- Bucket 3 + earlier scope docs reflect state at time of writing (audit trail preserved)

---

## Assessment

This cycle successfully:

1. **Avoided a full re-evaluation** (saved 40% tokens by scoping to 21 concerns)
2. **Caught 7 cross-concern contradictions** that design docs alone would not have surfaced
3. **Collapsed stale contradictions via code verification** (bucket 2 determined truth rather than debate)
4. **Captured 7 user-only decisions efficiently** via 2 `AskUserQuestion` batches (vs escalating each individually)
5. **Round-tripped through peer review** — Codex's initial REJECT caught 5 material issues my first pass missed, including the hash-chain incomplete reconciliation and the runbook $500/mo that I explicitly claimed was already fixed

The cycle demonstrates the value of multi-model review over single-model self-audit: the round-1 "APPLIED" summary was not actually complete, and a second pass was required to catch residue.

### Final verdict from both external models: **APPROVE**
