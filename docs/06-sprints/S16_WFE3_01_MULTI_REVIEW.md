# WFE3-01 Pre-Commit Review — Multi-Model

**Date**: 2026-04-20
**Reviewers**: Claude Opus 4.7 (Lead), Codex/GPT (via Codex MCP), Gemini (via PAL clink — routed to `gemini-3-flash-preview` again; Pro tier not reached)
**Subject**: WFE3-01 workflow graph validation implementation prior to commit
**Trigger**: User invoked multi-model review between implementation and commit

---

## Executive Summary

Both external reviewers independently identified the same three high-impact issues, and each surfaced one unique, high-value finding. The implementation is directionally correct (iterative DFS is algorithmically sound, activation policy is coherent) but has three real defects the Lead verified by direct testing. Fixes apply inline before commit; synthesis captures the trail.

---

## Consensus Findings

1. **RBAC on `POST /api/workflows/validate` is too strict** — implementation uses `platform/workflow.manage` but the Sprint 16 plan and the endpoint's purpose call for `platform/workflow.view`. A linter for drafts should be available to anyone who can see workflows, not restricted to those who can manage them. Gemini + Codex both flagged at `validate/route.ts:45-47`.
2. **OpenAPI coverage is incomplete** — the spec documents the new `/api/workflows/validate` endpoint but WFE3-01 also modified `POST /api/workflows` and `PUT /api/workflows/{id}` (new 400 `GraphInvalid` responses). Those modifications are not reflected in `openapi.yaml`. Per the cross-sprint DoD ("OpenAPI updated for every new/changed endpoint"), this is a real omission.
3. **POST/PUT GraphInvalid responses are Problem-shaped but not actually `application/problem+json`** — the responses use `NextResponse.json(...)` with the default `application/json` content-type. If the DoD says RFC 7807, the content-type header matters.

## Debated Items

### D1. Should `create` always validate, or only when status is active?

| Reviewer | Position |
|---|---|
| Gemini | `create` should NOT always validate — contradicts the "drafts are WIP" rationale. Recommends validating only if status will be active or a `force` flag for skeleton drafts. |
| Codex | Did not flag; implicitly accepts create-always-validates. |
| Claude (Lead) | **Keep create's strict validation.** Plan AC §Phase A explicitly states "`POST /api/workflows` rejects a cyclic definition with RFC 7807 400 `{ type: '/errors/workflow-cycle' }`". The WIP principle applies to *mid-composition edits* (update path), not to the initial create. A builder that needs to "create a skeleton then fill in" can create a single-step workflow and update it — that is what `workflow-builder-service.addStep` is for. |

**Verdict**: No change. Gemini's nit is a documentation-clarity issue rather than a correctness one. The plan captures the policy explicitly.

## Unique Findings (one per external reviewer)

### Codex: Duplicate step IDs bypass validation entirely (VERIFIED)

The validator's `byId` map uses `Map#set`, which silently overwrites on duplicate keys. Neither `WorkflowStepSchema` (Zod) nor `validateGraph` rejects arrays containing two steps with the same `id`. The builder's `addStep` *does* reject duplicates (line 80-82), but `create` and `update` payloads go directly to Zod + validator, bypassing that check.

**Lead-verified concretely**: Steps `[A→B, B, A-dup]` where `A-dup` has empty `nextSteps` produces `UnreachableSteps: ['B']` — a misleading error pointing at B when the actual cause is the duplicate A overwriting the real A in the lookup map. Client sees the wrong error type, and the workflow would serialise with both A entries to the DB.

**Fix**: Add `{ _tag: 'DuplicateStepId'; stepId: string }` variant to `GraphValidationError`; detect early, before the `byId` build loop; precedence: first in the error order (structural).

### Gemini: OpenAPI spec/implementation mismatch on `graphError` shape

The OpenAPI `GraphValidationError` schema includes a `type` URI field on every variant. The validate route's response includes it (`{...result.error, type: GRAPH_ERROR_TYPE_URI[tag]}`), but the POST/PUT handlers emit `graphError` with only the raw `_tag + payload` fields — no `type` URI inside. The outer Problem Detail has a `type` at the top level; the nested `graphError` does not. Clients deserialising the shared `GraphValidationError` schema would fail on the 400 responses.

**Fix**: Either (a) include the type URI on the nested `graphError` field in POST/PUT responses for consistency, or (b) change the OpenAPI `GraphValidationError` schema to not require the `type` field (since it lives on the outer Problem Detail). Recommend (a) for consumer ergonomics — the shape should be identical across linter and gateway responses.

## Lead's Additional Findings

- **Route test bypasses are too loose** — the three validate-route tests in `s16-wfe3-01-graph-validation.test.ts:421-449` have early-return guards (`if (res.status !== 200) return;`) that let auth-failed tests pass trivially. Codex also flagged this. Fix by stubbing the RBAC middleware so the tests actually hit the validator.
- **No route-level tests for POST/PUT GraphInvalid** — service-level GraphInvalid tests exist, but the handler-level mapping (tag → slug → URI) has no test coverage. Codex flagged this explicitly. Add minimal handler tests.

## Actionable Recommendations (all applied pre-commit)

1. **FIX (blocker): duplicate-ID detection.** Add `DuplicateStepId` error, detect before any other check, add 2+ tests.
2. **FIX: RBAC permission** on validate route — `workflow.manage` → `workflow.view`.
3. **FIX: `graphError` shape consistency** — include the `type` URI inside the nested `graphError` on POST/PUT 400 responses so it matches the OpenAPI schema and the validate-route body.
4. **FIX: Content-type on RFC 7807 responses** — set `Content-Type: application/problem+json` on the 400 Problem Details.
5. **FIX: OpenAPI coverage** — document the new 400 `GraphInvalid` response on both `POST /api/workflows` and `PUT /api/workflows/{id}`.
6. **FIX: Route test bypasses** — mock RBAC so the handler assertions actually run; add minimal route-level tests for POST GraphInvalid → 400 + correct type URI.
7. **NO CHANGE (debated)**: keep `create`'s strict graph validation — matches plan AC.
8. **DEFER to S17 or later**: documenting "index 0 is entry" convention in API docs — noted but not blocking this commit.

## Provenance

- Gemini via PAL clink (`gemini-3-flash-preview`). Pro tier not reached again.
- Codex via MCP thread `019daabf-0148-7d83-aaf8-1718637936c9`.
- Lead verification: inline `vitest` run confirming duplicate-ID behaviour.
