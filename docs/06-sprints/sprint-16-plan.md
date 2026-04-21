# Sprint 16 Implementation Plan: Safety + Protocol + Budgeting

**Theme**: "Safety + Protocol + Budgeting" — finish LLM Safety v2, ship workflow graph validation + WebSocket server, introduce first-class department budgeting
**Duration**: 2 weeks (Phase 3, Weeks 3-4 — SECOND Phase 3 sprint)
**Total Story Points**: 27 SP (6 tasks) — *revised from 25 SP/7 tasks after multi-model review on 2026-04-20 (see `S16_PLAN_MULTI_REVIEW.md`); Path A chosen — estimates revised upward to match real work, FA3-02 deferred to S17*
**Packages**: `@aptivo/llm-gateway` (safety v2), `@aptivo/workflow-engine` (graph validation), `@aptivo/budget` (NEW), `@aptivo/database` (departments schema), `@aptivo/types` (WS frames), `apps/web` (composition root, routes), `apps/ws-server` (NEW)
**FRD Coverage**: Epic 2 (LLM Safety v2 finish), Epic 3 (Workflow backend — graph validation + WebSocket), Epic 8 (FA-4 Department Budgeting)
**Sprint 15 Residuals**: 0 — S15 closed cleanly per `sprint-15-e2e-results.md` (production GO)
**Derived from**: [Phase 3 Sprint Plan Multi-Review](./PHASE_3_SPRINT_PLAN_MULTI_REVIEW.md), [Phase 3 Roadmap](./phase-3-roadmap.md), [Sprint 15 Plan](./sprint-15-plan.md) template
**Plan design doc**: `/home/anon/.claude/plans/design-the-sprint-16-bright-comet.md`
**Multi-Model Review**: [S16_PLAN_MULTI_REVIEW.md](./S16_PLAN_MULTI_REVIEW.md) — pending

---

## Executive Summary

Sprint 16 is the Phase 3 **gate sprint**. It must clear two downstream dependency gates: Epic 2 (LLM Safety v2) unblocks Epic 5 crypto live-trading in S17; Epic 3 (workflow backend) unblocks Epic 4 case tracking in S17. Epic 8 (FA-4 Department Budgeting) is carried alongside as an independent, load-balancing task. The sprint delivers 27 SP across 6 tasks distributed as: Senior 12 SP (all Epic 2), Web Dev 1 9 SP (all Epic 3), Web Dev 2 6 SP (Epic 8 core).

Three architectural decisions from AskUserQuestion (2026-04-20) shape the sprint: (1) the ML injection classifier wraps the rule-based one with timeout/error fallback, preserving defence-in-depth; (2) the WebSocket server lives in a new `apps/ws-server` app mirroring the `apps/spike-runner` pattern rather than attempting Next.js App Router WebSocket upgrades; (3) departments are introduced as a first-class entity in a new `packages/budget` workspace package instead of overloading the existing `domain` concept.

Post-review revisions (two rounds: Plan agent critique during design, then multi-model plan review on 2026-04-20) bumped WFE3-02 from 3 → 6 SP (backpressure, inbound rate-limits, Railway config, JWT expiry handling, extracting JWT verification from HITL into a shared module), bumped FA3-01 from 5 → 6 SP (admin rate-limit middleware does not yet exist and must be built, not reused), bumped LLM3-03 from 3 → 4 SP (corpus curation of 200+ distinct non-paraphrased samples is real annotation work), bumped LLM3-04 from 2 → 3 SP (the `getAccessPattern` audit-store query is net-new plumbing), deferred FA3-02 to S17 where it will pair with HITL escalation, and locked Replicate as the ML vendor pre-sprint. The 27 SP total sits within Phase 2 sustained velocity (27-30 SP/sprint) — no longer under, which matches the pace the team is known to sustain.

### Sprint 15 Baseline (What Exists)

| Component | Sprint 15 state | Sprint 16 target |
|-----------|----------------|-----------------|
| Rule-based injection classifier | `createInjectionClassifier` factory in `packages/llm-gateway/src/safety/injection-classifier.ts` — pure, `Result<InjectionVerdict, never>` | Wrapped by ML classifier; unchanged as a component |
| Content filter + streaming filter | `createContentFilter` + `createStreamingContentFilter` — unchanged since S15 | No change this sprint |
| Anomaly detector | `packages/audit/src/anomaly/anomaly-detector.ts` — detection-only, returns `AnomalyResult`, NOT wired into the LLM gateway | Wired via new `createAnomalyGate` decision layer in the LLM gateway pipeline |
| Gateway deps | `GatewayDeps` supports optional `injectionClassifier` and `contentFilter`; NOT yet wired in the composition root; no `anomalyGate` field | Wire injection classifier + content filter + ML wrapper + anomaly gate in `services.ts`; add `anomalyGate?` to `GatewayDeps` |
| Workflow definition schema | JSONB `steps` array with implicit edges via `nextSteps[]` — only Zod shape validation | Add pure graph validator (cycle/unreachable/dangling detection) in `@aptivo/workflow-engine` |
| WebSocket server | Spec at `docs/04-specs/websocket-lifecycle.md` (Draft); NO implementation | New `apps/ws-server` app; spec promoted to `v1.0 Implemented` with committed error-code table |
| Inngest event emission | Domain events registered in `apps/web/src/lib/inngest.ts`; no real-time surface | Selected workflow step events published to Redis channel consumed by ws-server fan-out |
| LLM budget service | Domain-scoped `BudgetService` class in `packages/llm-gateway/src/budget/budget-service.ts` | Factory-with-DI `DepartmentBudgetService` in new `@aptivo/budget` package (not a class migration of the LLM service) |
| Department model | Does not exist | New `departments` + `department_budget_configs` tables; nullable `departmentId` column on `llm_usage_logs` |
| Feature flags | `createEnvFlagProvider` in S15; `ml-injection-classifier`, `anomaly-blocking`, `ws-server-enabled` missing | Add three flags (all default off) |

---

## 1. Task Breakdown

### Phase A: Workflow Graph Validation (Days 1-3)

#### WFE3-01: Graph Validation API (3 SP) — ✅ COMPLETE (2026-04-20)

**Delivery notes**:
- Validator lives at `apps/web/src/lib/workflows/graph-validation.ts` (NOT `packages/workflow-engine` — that package does not exist in this repo; the plan's original location was a stale assumption. Extraction to a package is deferrable since the functions are pure.)
- **Policy decision made during implementation**: graph validation runs on `create` always, but on `update` only when the resulting workflow will have `status: 'active'`. Rationale: drafts may legitimately be WIP (the `workflow-builder-service` composes step-by-step via `addStep`/`removeStep`/`reorderSteps`); validating every draft edit would break the builder's intermediate-state assumption. Production (`active`) must always produce a sound graph. Documented inline in `graph-validation.ts` and in `workflow-definition-service.ts` update path.
- Validate endpoint is `POST /api/workflows/validate` (not under `/[id]`) — draft body is the entire input; no persisted workflow referenced.
- HTTP status for invalid validate requests is **200** (not 400). This is a linter, not a gateway — clients render inline validation feedback without treating it as a request failure.
- `WorkflowDefinitionError` union extended with new variant `{ _tag: 'GraphInvalid'; graphError: GraphValidationError }`.

**Pre-commit multi-model review** (`S16_WFE3_01_MULTI_REVIEW.md`, 2026-04-20): both Codex and Gemini flagged real issues. Lead-verified fixes applied:
- **Duplicate step ID detection added** (Codex): `validateGraph` was silently overwriting later duplicates in its `byId` Map; steps `[A→B, B, A-dup]` produced misleading `UnreachableSteps: ['B']` instead of flagging the real dup. New `DuplicateStepId` variant detected before any other check.
- **RBAC permission fixed** (Gemini + Codex): validate route dropped from `platform/workflow.manage` to `platform/workflow.view` — it's a linter.
- **`graphError` shape consistency** (Gemini): POST/PUT 400 responses now include the `type` URI inside the nested `graphError` object so clients can share one schema across linter + gateway.
- **RFC 7807 content-type** (Codex): POST/PUT 400 responses now set `Content-Type: application/problem+json`.
- **Route-test bypass guards removed** (Codex): the three validate-route tests had `if (res.status !== 200) return;` guards that let auth-failed tests pass trivially. RBAC is now stubbed via `vi.mock` so the handler body actually runs.
- **Route-level tests added for POST GraphInvalid** (Codex): two new tests cover `POST /api/workflows` cyclic and duplicate-ID 400 responses (content-type, nested `graphError.type`, `_tag` correctness).
- **OpenAPI coverage extended** (Codex): `openapi.yaml` now documents `POST /api/workflows` and `PUT /api/workflows/{id}` including the new 400 `WorkflowGraphInvalidResponse` schema.

**Test totals**: 31 tests added (up from 25 after pre-commit fixes); **1,796 total pass** (up from 1,788 baseline, net +8 including the s14 lifecycle test fix where the original workflow activation had an unreachable step — now explicitly wires step-1 → step-2 before activate).

**Description**: Add cycle detection, unreachable step detection, and dangling reference detection for workflow definitions. The existing workflow schema stores steps as a JSONB array with implicit edges via each step's `nextSteps: string[]` field; today only Zod shape validation and step-uniqueness checks run. This task adds pure graph-validation functions in `packages/workflow-engine`, invokes them inside the existing `workflow-definition-service.ts` create/update path, and exposes a standalone validation endpoint so clients can check a draft definition without persisting it. The validator returns a tagged-union error for each failure mode, which surfaces through RFC 7807 problem responses on the HTTP edge. Validation is deliberately pure — no database calls — so Sprint 17 case tracking and any future CLI tooling can reuse it.

**Acceptance Criteria**:
- [ac] `validateGraph(steps, entryStepId)` in `packages/workflow-engine/src/graph-validation.ts` returns `Result<void, GraphValidationError>`
- [ac] `GraphValidationError = { _tag: 'CycleDetected', cycle: string[] } | { _tag: 'UnreachableSteps', stepIds: string[] } | { _tag: 'DanglingReference', stepId, missingRef } | { _tag: 'NoEntryStep' }`
- [ac] Empty step array returns `Result.err({ _tag: 'NoEntryStep' })`
- [ac] Simple cycle (A→B→A) detected with `cycle = ['A','B','A']`
- [ac] Complex cycle (A→B→C→A) detected with full path
- [ac] Unreachable step (not the entry, not referenced by any other step) detected with the step ID
- [ac] Dangling `nextSteps` reference (points to a non-existent step ID) detected with both the source and missing target
- [ac] Valid linear DAG (A→B→C) passes
- [ac] Valid diamond DAG (A→B,C; B,C→D) passes
- [ac] `POST /api/workflows` rejects a cyclic definition with RFC 7807 400 `{ type: '/errors/workflow-cycle' }`
- [ac] `POST /api/workflows/validate` (note: **not** under `/:id` — this endpoint validates an arbitrary draft `{ steps, entryStepId }` body **without** persisting or requiring a prior ID; RBAC: `platform/workflow.view`) returns `{ valid: true } | { valid: false, errors: [...] }` without mutating state. Endpoint shape follows Phase 3.5 UI-E needs (validate-as-you-type for the draft workflow builder).
- [ac] OpenAPI spec adds the new `/api/workflows/validate` endpoint with `components.schemas.GraphValidationError`
- [ac] All new tests pass; no regressions in workflow-definition-service test suite

**Files**:
- Create: `packages/workflow-engine/src/graph-validation.ts`
- Create: `packages/workflow-engine/tests/graph-validation.test.ts`
- Create: `apps/web/src/app/api/workflows/validate/route.ts` (not under `/[id]`; validates draft bodies)
- Modify: `packages/workflow-engine/src/index.ts` (barrel export)
- Modify: `apps/web/src/lib/workflows/workflow-definition-service.ts` (invoke validator in create/update)
- Modify: `apps/web/openapi.yaml` (or equivalent) — add endpoint + schemas

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `validateGraph([], 'entry')` returns `Result.err({ _tag: 'NoEntryStep' })`
2. Green: implement empty-input + missing-entry guard
3. Red: `validateGraph([{ id: 'A', nextSteps: ['B'] }, { id: 'B', nextSteps: ['A'] }], 'A')` returns `Result.err({ _tag: 'CycleDetected', cycle: ['A','B','A'] })`
4. Green: implement DFS with gray/black coloring; record back-edge on revisit
5. Red: complex cycle A→B→C→A detected with full path
6. Green: extend DFS to record the full cycle via parent pointers on back-edge detection
7. Red: `validateGraph` with an unreachable step returns `Result.err({ _tag: 'UnreachableSteps', stepIds: [...] })`
8. Green: implement BFS from entry; any step not visited is unreachable
9. Red: dangling reference (`nextSteps: ['ghost']` but no step `ghost` exists) returns `{ _tag: 'DanglingReference', stepId, missingRef }`
10. Green: implement referenced-ID → existing-ID check
11. Red: linear + diamond DAGs return `Result.ok(undefined)`
12. Green: confirm both happy paths short-circuit to ok
13. Red: `workflow-definition-service.create` with cyclic steps returns error; existing non-cyclic tests still pass
14. Green: wire validator call before persistence in create/update paths
15. Red: `POST /api/workflows` with cyclic payload returns 400 RFC 7807
16. Green: map service error to RFC 7807 response body via existing error-mapping util
17. Red: `POST /api/workflows/validate` with a valid draft `{ steps, entryStepId }` body returns `{ valid: true }` without persisting
18. Green: implement route handler that calls validator and returns structured errors; verify no DB writes occur (audit log assertion)
19. Red: `POST /api/workflows/validate` with a cyclic body returns `{ valid: false, errors: [{ _tag: 'CycleDetected', ... }] }` with 200 status (not 400 — this is a validation tool, not a gateway)
20. Green: implement tagged-union error serialisation
21. Doc: update `openapi.yaml` with new endpoint + `GraphValidationError` schemas

---

### Phase B: LLM Safety v2 Finish (Days 1-8)

#### LLM3-03: Injection Eval Harness (4 SP) — ✅ COMPLETE (2026-04-20)

*Re-estimated from 3 SP after multi-model review: curation of 200+ distinct non-paraphrased samples is real annotation work, not 1-2 hours.*

**Delivery notes**:
- Corpus: 220 samples across 6 category-buckets (27/28/27/28 across four attack types + 110 benign + 20 boundary), stratified 80/20 train (176) / holdout (44). ~50/50 split between pattern-hitting and semantic-variant attacks so the rule-based recall gap is visible (the gap ML is expected to close).
- Harness: `runEval(classifier, corpus, { split, domain, gitSha })` → `Result<EvalResult, EvalError>`; pure, no I/O. `persistEvalResult(result, dir)` separately writes timestamped JSON.
- `challenge` verdicts counted as positive (TP or FP) — the eval measures detection, not final action policy.
- Rule-based baseline on holdout (core domain): **Precision 1.000, Recall 0.318, F1 0.483** (7 of 22 attacks caught). All misses are semantic variants. Documented in `docs/04-specs/injection-eval-baseline.md` with per-category breakdown and Senior Dev sign-off checklist.
- `pnpm test:eval` script added to `@aptivo/llm-gateway`.

**Pre-commit multi-model review** (`S16_LLM3_03_MULTI_REVIEW.md`, 2026-04-20): Codex unavailable (repeated HTTP 403); Gemini + Lead proceeded per skill fallback. Three consensus recommendations + one Lead-added item applied:
- **FPR added to `CategoryMetrics`** (Gemini): benign-bucket precision/recall are structurally zero; FPR is the meaningful metric. Now every category carries `{ precision, recall, f1, fpr, samples }`. Benign holdout FPR = 0.000 added to baseline doc.
- **`totalSamples` tracks `processedCount`** (Gemini): was `filtered.length`, which would desync from the matrix sum if the classifier ever errored. Now always self-consistent.
- **Random suffix on persisted filenames** (Gemini): `eval-<runAt>-<6charRandom>.json` so concurrent CI runs can't collide in the same millisecond.
- **Domain-propagation test added** (Lead): mock classifier asserts `opts.domain` is forwarded; covers the default `core` and an explicit `crypto` override.

**Test totals**: 24 new tests (up from 20 after pre-commit fixes); **139 total llm-gateway tests** (up from 115 baseline, net +24).

**Description**: Build the measurement tool that defines what "the ML classifier is better than rule-based" means. A labelled corpus of 200+ injection samples (100 malicious spread across four categories, 100 benign, 20 adversarial boundary cases) is curated under `packages/llm-gateway/tests/fixtures/injection-corpus.ts`. The corpus uses a stratified 80/20 train/holdout split so LLM3-02 cannot overfit by tuning against the same samples the baseline is measured on. The samples must **not** be derived by paraphrasing the existing regex patterns — otherwise the ML classifier looks artificially strong against rule-based. A small `runEval(classifier, corpus)` function produces a confusion matrix, overall precision/recall/F1, and a per-category breakdown. The rule-based baseline is computed on the holdout split, the numbers are recorded (not asserted as pass/fail) in `docs/04-specs/injection-eval-baseline.md`, and the Senior Dev signs off on corpus quality before LLM3-02 consumes it.

**Acceptance Criteria**:
- [ac] Corpus in `packages/llm-gateway/tests/fixtures/injection-corpus.ts` contains ≥200 samples shaped `{ prompt, expectedVerdict, category, split: 'train' | 'holdout' }`
- [ac] Corpus is stratified: 80% train / 20% holdout, balanced across four injection categories
- [ac] Samples are not paraphrased from `DEFAULT_INJECTION_PATTERNS` (reviewer verifies by inspection during sign-off)
- [ac] `runEval(classifier, corpus, { split: 'holdout' })` returns `{ precision, recall, f1, confusionMatrix, perCategory, totalSamples }`
- [ac] Per-category breakdown covers: `instruction_override`, `role_play`, `system_extraction`, `context_manipulation`
- [ac] Results persist as JSON under `packages/llm-gateway/tests/eval-results/<timestamp>.json` with the git SHA of the run
- [ac] Rule-based baseline computed on holdout; actual numbers recorded (not asserted) in `docs/04-specs/injection-eval-baseline.md`
- [ac] Senior Dev sign-off comment recorded in the baseline doc before LLM3-02 begins tuning
- [ac] `pnpm --filter @aptivo/llm-gateway test:eval` runs the harness and emits a summary table to stdout
- [ac] Harness rejects an empty corpus with a clear error

**Files**:
- Create: `packages/llm-gateway/tests/fixtures/injection-corpus.ts`
- Create: `packages/llm-gateway/src/safety/eval-harness.ts`
- Create: `packages/llm-gateway/tests/safety/eval-harness.test.ts`
- Create: `packages/llm-gateway/tests/eval-results/.gitkeep` (directory scaffold)
- Create: `docs/04-specs/injection-eval-baseline.md`
- Modify: `packages/llm-gateway/src/safety/index.ts` (barrel)
- Modify: `packages/llm-gateway/package.json` (add `test:eval` script)

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `runEval(classifier, [], opts)` returns `Result.err({ _tag: 'EmptyCorpus' })`
2. Green: implement empty-corpus guard
3. Red: `runEval` on a 10-sample corpus computes correct confusion matrix counts
4. Green: implement TP/FP/TN/FN tallying against `expectedVerdict`
5. Red: precision = TP / (TP + FP); recall = TP / (TP + FN); F1 = 2·P·R / (P + R)
6. Green: implement the three metrics with zero-denominator guards
7. Red: per-category breakdown returns one metric row per category
8. Green: group samples by category and call the per-category metric computation
9. Red: harness splits corpus by `split: 'holdout' | 'train' | 'all'` correctly
10. Green: implement split filtering before evaluation
11. Red: harness persists result JSON to `tests/eval-results/<ts>.json`
12. Green: write file with timestamp and git SHA envelope
13. Red: corpus has ≥200 samples (assertion test); ≥20 adversarial boundary samples flagged `boundary: true`
14. Green: curate corpus; commit samples with category + split + boundary tags
15. Validate: run rule-based baseline on holdout, record numbers in baseline doc
16. Validate: Senior Dev corpus-quality sign-off commented in baseline doc

---

#### LLM3-02: ML Injection Classifier with Rule-Based Fallback (5 SP) — ✅ COMPLETE (2026-04-20)

**Delivery notes**:
- `createMlInjectionClassifier` wraps the rule-based classifier with a `ModelClient` call. On success within timeout (default 500 ms) + Zod-valid shape, ML wins; on timeout / HTTP error / Zod parse failure, falls back and emits `logger.warn({ event })` with one of `ml_classifier_timeout`, `ml_classifier_error`, `ml_classifier_invalid_response`.
- `createReplicateClient({ url, token, fetch, version })` — minimal `ModelClient` adapter; POSTs to Replicate predictions; unwraps `{ output: ... }` envelopes OR the raw body for other vendor shapes.
- **Plan deviation (documented inline in `ml-injection-classifier.ts`)**: the plan called this a "drop-in replacement for `InjectionClassifier`" but HTTP inference is inherently async and incompatible with the existing synchronous `Result<InjectionVerdict, never>` contract. Resolution: introduced `AsyncInjectionClassifier` type (returns `Promise<Result<...>>`); rule-based classifier adapted via `asAsyncInjectionClassifier(sync)`. Gateway `complete()` updated to `await` classifier calls. `GatewayDeps.injectionClassifier` accepts either shape (duck-typed probe decides which).
- ML inference records `llm_usage_logs` rows with `requestType: 'safety_inference'` (the existing column — multi-review §G1 correction). New `UsageLogger.logSafetyInference({ domain, provider, model, costUsd, latencyMs })`; database adapter `UsageRecord.requestType` union widened accordingly.
- Logger + feature-flag DI honored — packages never import from `apps/web`. `services.ts` provides `safetyLoggerBridge` wrapping `log.*`, binds `isEnabled()` via env (`ML_INJECTION_ENABLED=true`) for now; a sync-accessible feature-flag cache is a later polish.
- Vendor lock: Replicate only. `ModelClient` interface keeps the door open for a HuggingFace swap without changing the wrapper.
- Feature flag `ml-injection-classifier` added to `DEFAULT_FLAGS` with `enabled: false` — ship-behind-flag; production enablement is the S17 decision after live Replicate eval numbers are collected.
- **ML eval vs. baseline** (plan AC): the eval harness + corpus from LLM3-03 is vendor-independent and ready. Running against live Replicate requires vendor procurement + model training (not in scope). The `injection-eval-baseline.md` will gain an ML row post-procurement; flagged as an S17 pre-enablement task.

**Pre-commit multi-model review** (`S16_LLM3_02_MULTI_REVIEW.md`, 2026-04-21): Codex MCP session expired; Gemini + Lead proceeded per skill fallback. Gemini found one critical bug and one high-impact issue, both Lead-verified and fixed:
- **🚨 CRITICAL — duck-typed probe issued real ML inference per request**: `isAsyncClassifier(c)` called `c.classify('', 'core')` just to test for thenable return shape, and was invoked inside `complete()` on every request. For a real ML classifier wired in, every gateway call would have triggered an extra Replicate inference with an empty prompt — doubling cost, doubling latency, burning rate limits. **Fix**: removed the probe entirely. `GatewayDeps.injectionClassifier` now accepts `AsyncInjectionClassifier` only; sync classifiers are wrapped via `asAsyncInjectionClassifier()` once at composition time. Added two call-count regression tests that assert `classify()` is invoked exactly once per message per `complete()`.
- **⚠️ HIGH — feature-flag gate bypassed the FeatureFlagService**: `services.ts` bound `isEnabled` to `process.env.ML_INJECTION_ENABLED` rather than the flag service. **Fix**: strengthened the comment and description to make the env-var override explicit; tracked proper wiring as S17 work (requires either widening `isEnabled` to async or exposing a sync cache peek on `FeatureFlagService`).
- **🔸 MEDIUM — `UsageRecord.requestType` drift risk**: duplicate interface in gateway + database adapter. **Fix**: added explicit `DRIFT RISK` comment in the adapter; tracked `UsageRecord` consolidation into `@aptivo/types` as S17 work (proper fix requires cross-package refactor).
- **Additional Lead-surfaced fix**: `logSafetyInference.domain` widened from `providers.Domain` to `string` with a cast at the `store.insert` boundary — fixes a type-boundary friction where `SafetyInferenceRecord.domain` was deliberately typed `string` for cross-package compatibility.

**Test totals**: 18 new tests total (10 ML classifier + 6 Replicate client + 2 gateway call-count regression); **161 total llm-gateway tests** (up from 139).

---

(original micro-task breakdown below preserved for reference)

##### Original scope breakdown — LLM3-02

**Description**: Ship an ML classifier that wraps the existing rule-based one. On model success within the 500ms timeout and with a Zod-valid response shape, the ML verdict is returned. On timeout, HTTP error, or Zod parse failure, the classifier falls back to the rule-based verdict and emits a structured warning via the injected safe-logger. The entire ML path is gated behind the `ml-injection-classifier` feature flag (default off); with the flag off, no model call is made at all. The vendor is locked to **Replicate** before sprint start — the `ModelClient` interface is kept minimal so a HuggingFace swap remains a post-sprint decision, not a mid-sprint branch. ML inference latency and cost are logged to `llm_usage_logs` with `category: 'safety_inference'` so spend on safety classifiers shows up alongside generation spend. Env var reads (`ML_INJECTION_MODEL_URL`, `ML_INJECTION_MODEL_TOKEN`) happen in `apps/web/src/lib/services.ts` — packages never read env. Feature-flag state and logger instance are passed into the factory via DI callbacks (`isEnabled`, `logger`).

**Acceptance Criteria**:
- [ac] `createMlInjectionClassifier({ modelClient, ruleBasedFallback, timeoutMs, isEnabled, logger })` returns an object matching the existing `InjectionClassifier` shape (drop-in replacement)
- [ac] Default `timeoutMs` is 500 ms; configurable via deps
- [ac] Model response parsed through `MlVerdictSchema = z.object({ verdict: z.enum(['allow','challenge','block']), confidence: z.number().min(0).max(1), category: z.string().optional() })`
- [ac] On Zod parse failure → fallback + `logger.warn({ event: 'ml_classifier_invalid_response', cause })`
- [ac] On HTTP error → fallback + `logger.warn({ event: 'ml_classifier_error', cause })`
- [ac] On timeout → fallback + `logger.warn({ event: 'ml_classifier_timeout' })`
- [ac] Feature flag off → `classify` returns rule-based verdict without invoking model client (mock verifies call count = 0)
- [ac] `createReplicateClient({ url, token, fetch })` issues POST to the configured predictions endpoint, parses the JSON body, returns `ModelVerdict`
- [ac] ML inference records a row in `llm_usage_logs` with `requestType = 'safety_inference'`, `costUsd`, `latencyMs` (the existing column is `requestType`, not `category` — verified in `packages/database/src/schema/llm-usage.ts:40`; no schema change needed)
- [ac] `apps/web/src/lib/services.ts` wires ML classifier into `GatewayDeps.injectionClassifier` (replaces the previously-unwired slot)
- [ac] New feature flag `ml-injection-classifier` added to `DEFAULT_FLAGS` with `enabled: false`
- [ac] Eval harness run (LLM3-03) executes against ML classifier; results appended to baseline doc
- [ac] Production enablement NOT included — that's a Sprint 17 decision after eval sign-off

**Files**:
- Create: `packages/llm-gateway/src/safety/ml-injection-classifier.ts`
- Create: `packages/llm-gateway/src/safety/model-client.ts`
- Create: `packages/llm-gateway/tests/safety/ml-injection-classifier.test.ts`
- Modify: `packages/llm-gateway/src/safety/index.ts` (barrel)
- Modify: `packages/llm-gateway/src/usage/usage-logger.ts` (add `category: 'safety_inference'` path) or equivalent
- Modify: `apps/web/src/lib/services.ts` (wire ML classifier into gateway deps with env reads + DI bindings)
- Modify: `apps/web/src/lib/feature-flags/defaults.ts` (add `ml-injection-classifier`, default false)

**Dependencies**: LLM3-03 (eval harness must exist to measure ML output)

**TDD Micro-Tasks**:
1. Red: `createMlInjectionClassifier({...}).classify('prompt', 'core')` returns the rule-based verdict when `isEnabled()` is false (mock model client never called)
2. Green: implement factory shell; guard all model calls with `isEnabled()`
3. Red: on model success with valid shape, returns ML verdict
4. Green: call model client; parse with `MlVerdictSchema`; return ok
5. Red: on model timeout (>500ms), returns rule-based verdict + `logger.warn({ event: 'ml_classifier_timeout' })`
6. Green: wrap model call in `Promise.race` with timeout; logger invocation on timeout
7. Red: on HTTP error, returns rule-based + `logger.warn({ event: 'ml_classifier_error', cause })`
8. Green: catch thrown errors from model client; log + fallback
9. Red: on Zod parse failure, returns rule-based + `logger.warn({ event: 'ml_classifier_invalid_response' })`
10. Green: parse model response through Zod; log + fallback on `SafeParseError`
11. Red: `createReplicateClient({ url, token, fetch }).predict(prompt)` issues POST and parses response
12. Green: implement client using injected `fetch`; parse Replicate prediction schema
13. Red: gateway integration — `GatewayDeps.injectionClassifier = mlClassifier` produces ML verdict when flag on, rule-based when flag off
14. Green: wire in `services.ts`; integration test validates both flag states
15. Red: usage log written with `requestType: 'safety_inference'`, `costUsd`, `latencyMs` on every ML call
16. Green: instrument ML path with usage logger; populate existing `requestType` column; separate from generation usage path
17. Red: metric counter emitted for `ml_classifier_timeout` events (per multi-review D2 — needed so ops can detect sustained high-latency regimes that silently fall back)
18. Green: wire counter to existing metrics service
17. Validate: run eval harness against ML classifier; append results to `injection-eval-baseline.md`

---

#### LLM3-04: Active Anomaly Blocking (3 SP) — ✅ COMPLETE (2026-04-21)

*Re-estimated from 2 SP after multi-model review: the `getAccessPattern` audit-store query is net-new plumbing, not an existing utility.*

**Delivery notes**:
- `createAnomalyGate({ detector, getAccessPattern, isEnabled, logger, thresholds })` — decision layer sitting between `@aptivo/audit`'s detection-only anomaly detector and the LLM gateway pipeline. Maps z-scores to `{ action: 'pass' | 'throttle' | 'block', cooldownMs?, reason? }`. Defaults: `throttleAt: 0.7`, `blockAt: 0.9`, `throttleCooldownMs: 60_000`.
- **Fail-open paths** (deliberate — a locked gateway on day 1 is worse than delayed block on day 3): cold-start (`reason: 'insufficient baseline data'`) → pass; detector error (Result.err) → pass + `logger.warn('anomaly_gate_error', {...})`; `getAccessPattern` throws → pass + logger.warn.
- **Feature-flag gate**: when `isEnabled()` returns false, the gate short-circuits to pass without calling the detector OR `getAccessPattern`. Same env-var toggle pattern as LLM3-02 (`ANOMALY_BLOCKING_ENABLED=true` gates runtime; proper FeatureFlagService wiring deferred to S17).
- **`LLMError` union extended** with `{ _tag: 'AnomalyBlocked', reason?, cooldownMs? }` — explicit union edit per plan AC.
- **Gateway pipeline integration**: new step 3b (between injection classifier and content filter). Actor resolution is pluggable via new `GatewayDeps.resolveActor?: (request) => string | undefined` — S16 wires this to `() => undefined` (no actor context in `CompletionRequest` today), so the gate is skipped for all current traffic. Request→actor plumbing lands with S17 department-ID stamping (parallel to FA3-01).
- **New `AuditStore.aggregateAccessPattern({ actor, resourceType, action?, windowMs })` method** — counts recent `audit_logs` rows for the (actor, resourceType) tuple in the window, returns zero-count + empty-window timestamps when no events match. Drizzle adapter implementation uses a raw SQL COUNT(*) with timestamp filters. Mock stores in existing tests updated with a zero-count default (cold-start semantics).
- **Baseline computation**: S16 uses a placeholder constant baseline (`{ mean: 10, stdDev: 3, sampleSize: 100 }`) in `services.ts` — real historical aggregation is tracked as an S17 OBS task, since the scheduled baseline-builder job doesn't exist yet. Note: with sampleSize 100 (above detector's minBaselineSamples=5), the gate actually fires based on z-score. Operators deploying this in S16 should keep `ANOMALY_BLOCKING_ENABLED` off until the real baseline job runs.
- **New `@aptivo/llm-gateway` → `@aptivo/audit` workspace dep** added so the gate can import `AccessPattern`, `AnomalyResult`, `AnomalyError` types. No cycle (audit does not depend on llm-gateway).
- Feature flag `anomaly-blocking` added to `DEFAULT_FLAGS` with `enabled: false`.

**Pre-commit multi-model review** (`S16_LLM3_04_MULTI_REVIEW.md`, 2026-04-21): Gemini and Codex both reviewed (Codex back after auth refresh). Codex found a **latent correctness bug** Gemini missed and flagged test-fixture disconnects from detector math. Fixes applied:
- **🚨 Aggregate key mismatch (latent, silent until S17)**: gateway passes `request.domain` as `resourceType` but real audit rows use resource types like `'candidate'` / `'employee'` and actions like `'pii.read.bulk'`. Once S17 wires `resolveActor`, the aggregate would always return 0 and the gate would never fire. **Pre-commit fix**: widened `aggregateAccessPattern` to accept `actions?: readonly string[]` so S17 can pass a per-domain action whitelist; when omitted, NO action filter is applied (matches all rows for the tuple). Added a prominent S17 BLOCKER comment at the `getAccessPattern` binding in `services.ts` documenting the key-semantics decision S17 must make.
- **Impossible test fixtures (Codex)**: tests used `score: 0.95, reason: 'z=5.2'` but real detector maps z=5.2 → score≈0.867. Fixed to use values that actually match the detector's normalization (`score = z / 6`). Tests now validate both the gate's threshold logic AND the detector→gate coupling.
- **Missing test: `getAccessPattern` throws** (Codex). Added; asserts fail-open + `logger.warn('anomaly_gate_error', ...)`.
- **Missing test: pipeline ordering** (Codex). Added; wires both injection-blocker + anomaly-blocker and asserts injection wins first, anomaly gate never called.

**Deferred to S17** (tracked in S17 preview):
- Adapter-level integration test for `aggregateAccessPattern` (requires test DB infra).
- Aligning aggregate query with real audit schema (the S17 BLOCKER) — either per-domain action whitelist, or change the gateway to pass resource-specific keys, or query by domain.
- Proper `anomaly-blocking` flag wiring (same env-var tradeoff as LLM3-02).
- Real historical baseline job (replaces placeholder constant).

**Test totals**: 17 new tests (11 gate-unit + 6 gateway-pipeline integration); **178 total llm-gateway tests** (up from 161). 67 audit + 1,796 web tests unchanged.

**Description**: Wire the existing `AnomalyDetector` in `@aptivo/audit` into the LLM gateway via a decision-layer adapter. The detector today returns `{ isAnomaly, score, reason }` on a z-score basis but has no consumer. The new `createAnomalyGate({ detector, thresholds, isEnabled, getAccessPattern })` reads a recent access pattern (aggregated from audit-store `resource_read` events for the (actor, resourceType) tuple over the last N minutes) and emits `{ action: 'pass' | 'throttle' | 'block', cooldownMs?, reason? }`. The gate is invoked inside `LlmGateway.complete` after injection detection and before content filtering. The gateway's `LLMError` union is extended with `{ _tag: 'AnomalyBlocked', reason, cooldownMs? }` — an explicit breaking-safe addition since the union is closed today. Cold-start behaviour fails open: insufficient baseline data maps to `pass`, because a locked gateway on day 1 is a bigger operational risk than a delayed block on day 3.

**Acceptance Criteria**:
- [ac] `createAnomalyGate({ detector, thresholds, isEnabled, getAccessPattern })` returns `{ evaluate(actor, resourceType): Promise<GateDecision> }`
- [ac] `GateDecision = { action: 'pass' | 'throttle' | 'block', cooldownMs?: number, reason?: string }`
- [ac] `thresholds = { throttleAt: number, blockAt: number }` with defaults `{ throttleAt: 0.7, blockAt: 0.9 }`
- [ac] Detector returning `isAnomaly: true, score: 0.95` → `{ action: 'block', reason }`
- [ac] Detector returning `isAnomaly: true, score: 0.75` (between thresholds) → `{ action: 'throttle', cooldownMs, reason }`
- [ac] Detector returning `isAnomaly: false` → `{ action: 'pass' }`
- [ac] `reason: 'insufficient baseline data'` → `{ action: 'pass' }` (cold-start fail-open)
- [ac] `isEnabled()` returns false → gate returns `{ action: 'pass' }` without invoking detector (mock verifies call count = 0)
- [ac] `GatewayDeps` extended with optional `anomalyGate?: AnomalyGate`; invoked after injection, before content filter
- [ac] `LLMError` union extended with `{ _tag: 'AnomalyBlocked', reason, cooldownMs? }` — tag added in `packages/llm-gateway/src/providers/types.ts`
- [ac] **New audit-store method** `AuditStore.aggregateAccessPattern({ actor, resourceType, windowMs })` returns the `AccessPattern` shape required by `@aptivo/audit`; this method does not exist today and must be added to the `AuditStore` interface and the Drizzle adapter
- [ac] `services.ts` wires `getAnomalyGate()` with an `getAccessPattern(actor, resourceType)` callback that delegates to the new `aggregateAccessPattern` method
- [ac] Feature flag `anomaly-blocking` added to `DEFAULT_FLAGS` with `enabled: false`

**Files**:
- Create: `packages/llm-gateway/src/safety/anomaly-gate.ts`
- Create: `packages/llm-gateway/tests/safety/anomaly-gate.test.ts`
- Modify: `packages/llm-gateway/src/gateway/llm-gateway.ts` (add anomaly gate pipeline step)
- Modify: `packages/llm-gateway/src/providers/types.ts` (extend `LLMError` union)
- Modify: `packages/llm-gateway/src/safety/index.ts` (barrel)
- Modify: `apps/web/src/lib/services.ts` (wire gate + access-pattern callback)
- Modify: `apps/web/src/lib/feature-flags/defaults.ts` (add `anomaly-blocking`, default false)
- Modify: `packages/audit/src/audit-store.ts` (or equivalent) — extend `AuditStore` interface with `aggregateAccessPattern` method
- Modify: Drizzle audit-store adapter — implement `aggregateAccessPattern` as a COUNT query over `audit_events` filtered by actor + resourceType + time window

**Dependencies**: None (consumes existing `@aptivo/audit` detector)

**TDD Micro-Tasks**:
1. Red: `createAnomalyGate({...}).evaluate('user:1', 'pii_record')` with mock detector returning `{ isAnomaly: true, score: 0.95 }` returns `{ action: 'block' }`
2. Green: implement evaluate; map score to action using thresholds
3. Red: score 0.75 returns `{ action: 'throttle', cooldownMs: 60_000 }`
4. Green: implement throttle branch with default 60s cooldown
5. Red: `isAnomaly: false` returns `{ action: 'pass' }`
6. Green: pass-through branch
7. Red: `reason: 'insufficient baseline data'` returns `{ action: 'pass' }` (cold start)
8. Green: treat insufficient-baseline reason as pass regardless of score
9. Red: `isEnabled()` = false → `{ action: 'pass' }`; detector mock never called
10. Green: guard detector call with `isEnabled()` check
11. Red: `getAccessPattern(actor, resourceType)` callback returns shape-compatible `AccessPattern` (type test)
12. Green: ensure callback signature matches `@aptivo/audit` type
13. Red: gateway pipeline — bulk PII access pattern → `Result.err({ _tag: 'AnomalyBlocked', reason, cooldownMs })`
14. Green: add gate invocation in `LlmGateway.complete`; map block/throttle decisions to `LLMError` variants
15. Red: `LLMError` union compiles with new `AnomalyBlocked` variant; all existing switch statements still compile (exhaustive)
16. Green: extend union in types.ts; update exhaustive switches to handle new tag
17. Red: `AuditStore.aggregateAccessPattern({ actor, resourceType, windowMs })` returns an `AccessPattern` row shape
18. Green: implement COUNT query over `audit_events` filtered by actor + resource type + timestamp window; index check
19. Red: audit-store adapter returns `{ count: 0 }` when no events match (cold start)
20. Green: verify empty-result handling does not throw; feeds cleanly into detector's "insufficient baseline" path

---

### Phase C: WebSocket Server (Days 2-9)

#### WFE3-02: WebSocket Server + Protocol Lock (6 SP) — ✅ COMPLETE (2026-04-21)

**Delivery notes**:
- New `apps/ws-server` Node.js app running on port 3001 (default) — mirrors `apps/spike-runner` scaffolding. Dependencies: `ws`, `jose`, `@aptivo/types`, `zod`.
- Frame schemas frozen in `packages/types/src/websocket-events.ts` (Zod discriminated unions for inbound + outbound; `WsCloseCodes` enum). v1.0 spec contract — any shape change requires a v1.1 bump. Spec doc lifted to `Implemented (Sprint 16)` with committed error-code table.
- Protocol: `auth_required` → `auth` → `auth_ok` / `auth_failed`; `subscribe` / `unsubscribe` / `resume` (with replay buffer lookup); `ping` / `pong` heartbeat; `event` fan-out; `reconnect` + `full_sync` directives; `error` for RBAC/shape failures.
- Error codes used: 1000 / 1001 / 1008 (heartbeat miss) / 1013 (backpressure) / 4001 (auth timeout/fail) / 4002 (rate-limit) / **4003 (token expired mid-session — new code added in v1.0)**.
- Pure modules with TDD: `replay-buffer.ts` (per-topic ring, 5-min TTL + 1000-event cap), `rate-limit.ts` (sliding-window, 50 frames/sec default), `backpressure.ts` (bounded outbound queue, 1000-cap), `auth.ts` (generic HS256 JWT verify). Each has a standalone test file.
- Connection handler (`connection-manager.ts`) is the state machine — all collaborators (outbound queue, rate limiter, replay buffer, token verifier, authorize callback, close, clock) injected for testability. No direct `ws` dependency; 16 unit tests cover the full state machine.
- Event bridge in-process for S16 (tracks attached handlers; `publish(event)` stores in replay + fans out). Redis pub/sub bridge for horizontal scaling deferred to S17.
- Metrics (`metrics.ts`): `activeConnections`, `messagesSent`, `authFailuresTotal`, `lastPubsubLatencyMs`. Composition root can forward to observability.
- `onAuthFailure` hook invoked on every 4001 / 4003 close and when token verification rejects — ready for the composition root to wire into `AuditService` for credential-stuffing detection (S17 wiring; hook is live in S16).
- Railway manifest at `apps/ws-server/railway.json` with `rootDirectory` scoped `watchPatterns`, `ON_FAILURE` restart policy, and `/health` health-check placeholder. Staging deploy NOT performed in S16 — verification deferred to S17 pre-enablement.
- Integration test (`server.integration.test.ts`) starts a real server on an ephemeral port, connects via `ws` client, walks the full auth → subscribe → publish → receive flow. Also covers 4001 on bogus token + 403 on forbidden topic.
- **Plan deviation** (documented inline): the plan called for extracting JWT verification from HITL into a shared module. Instead, `apps/ws-server/src/auth.ts` uses a parallel minimal `jose`-based verifier for generic session JWTs (the ws-server expects a different claim set than HITL — sub + roles + exp, not requestId/action/channel/jti). Consolidating both call sites behind one shared module is tracked as S17 cleanup work.
- 41 tests (7 auth + 7 replay-buffer + 4 rate-limit + 4 backpressure + 16 connection-manager + 3 server integration). All pass in <400 ms.

**Pre-commit multi-model review** (`S16_WFE3_02_MULTI_REVIEW.md`, 2026-04-21): Gemini and Codex both reviewed; both found real critical defects. Codex was especially precise (line numbers + bytes). Fixes applied:

- **🚨 CRITICAL — Backpressure was dormant for outbound-only traffic** (both): `markBlocked` was only flipped after inbound `message` events. A subscriber-only client with a slow socket would never engage the queue path, and the 1000-cap was bypassed; the ws library's internal buffer would grow unbounded. **Fix**: added `beforeEnqueue` hook to the outbound queue; wired to a watermark check on `socket.bufferedAmount` so every outbound frame triggers backpressure evaluation. Removed the unreachable `depth() > capacity` close branch — the real overflow signal is `enqueue() === false`, which `deliverEvent`/`sendPing` now route through a `closeConn(1013)` call.

- **🚨 Heartbeat off-by-one** (Codex): spec says "3 missed pongs trigger close"; code fired on the 4th miss because of `>` vs `>=`. The unit test encoded the bug. **Fix**: changed to `>= maxMissedPongs`; test rewritten to lock in the spec-compliant behaviour (close on the 3rd tick, not the 4th).

- **🚨 Frames could fire after close initiation** (Codex): `deps.close()` was called but the handler's `auth` and `subs` weren't cleared. A pub/sub event arriving between close-initiation and the socket's close callback would still get queued and sent. **Fix**: added a `closed` flag inside the handler; all outbound methods (`deliverEvent`, `sendPing`, `send`) short-circuit when closed. New regression test asserts that events delivered after `checkTokenExpiry` triggers a close are silently dropped.

- **🟡 Replay buffer topic leak** (Gemini): `rings` Map never pruned stale topic entries — memory grew linearly with unique topics ever published. **Fix**: `eventsSince` now deletes the ring entry when pruning leaves zero events.

- **🟡 Railway health-check pointed to non-existent route** (Codex): `railway.json` declared `/health` but the server exposed only WebSocket — deploy would flap. **Fix**: server now constructs an `http.Server` with a `/health` route returning 200 + connection-count snapshot; `WebSocketServer` shares the HTTP server via the `server` option. New integration test verifies `/health` returns 200.

- **🟡 Shutdown drain race** (Gemini): `stop()` broadcast `reconnect` then immediately closed sockets — clients could miss the frame. **Fix**: 100 ms drain delay between broadcast and close; HTTP server also closed cleanly.

Bonus fix (caught while updating the spec doc): the `s14-int2-02-doc-closure.doclint.test.ts` Sprint 14 doc-lint test asserted the spec was "documented but not implemented". Updated to assert the new "Implemented (Sprint 16, WFE3-02)" state — closes a stale assertion now that the spec is live.

**Test totals**: 44 ws-server tests (up from 41 with backpressure-engagement, off-by-one regression, post-close silence, and `/health` integration tests added). Web tests still at 1,796 (no regressions).

**Deferred to S17**:
- Pong-within-10s deadline (separate per-ping timer; spec polish, not safety-critical).
- Subscription cap per connection (needs sizing study).
- Real Inngest → Redis pub/sub bridge for multi-instance fan-out.
- Consolidate ws-server JWT verify with HITL's `jwt-manager`.
- Wire `onAuthFailure` → `AuditService` in the composition root.
- Staging deploy verification on Railway.

---

##### Original breakdown — WFE3-02 (6 SP, re-estimated from 3 SP)

*Re-estimated from 5 SP after multi-model review: verified that no generic `verifyJwt` utility exists today (only HITL-specific verification in `packages/hitl-gateway/src/decision/multi-decision-service.ts`). JWT-verification extraction into a shared module is a real refactor inside this task, not a re-export.*

**Description**: New `apps/ws-server` app implementing `docs/04-specs/websocket-lifecycle.md` v1.0. Mirrors the existing `apps/spike-runner` pattern — separate Node.js process, shared workspace types/utilities, deployed as a distinct Railway service. Next.js App Router does not support WebSocket upgrades, so attempting to co-host WebSockets in `apps/web` is architecturally wrong. The server listens on `WS_PORT` (default 3001), uses a shared `verifyJwt` extracted from the HITL gateway's implementation into a new location usable by both `apps/web` and `apps/ws-server`, tracks per-connection state (auth, subscriptions, outbound queue, last-heartbeat), subscribes to Redis pub/sub channels keyed by topic (`ws:workflow/<id>`), and fans out events to authenticated subscribers. The existing Phase 2 Inngest durable-execution contract is unchanged — `apps/web` emits domain events via Inngest as before, and a new Inngest function publishes a curated subset of workflow step events to the Redis channels that `ws-server` consumes. The protocol frame schemas are frozen in `packages/types/src/websocket-events.ts` by **Day 4 of the sprint** so implementation has a stable contract; any Phase 3.5 UI-F feedback after Day 4 is a v1.1 consideration. The re-estimate from 3 → 5 SP reflects previously unaccounted work: backpressure with slow-consumer disconnect, inbound frame rate limiting, JWT expiry handling mid-session (new close code 4003), Railway service config committed (not "noted"), and the `verifyJwt` sharing seam across apps.

**Acceptance Criteria**:
- [ac] `apps/ws-server` app created with `package.json`, `tsconfig.json`, `src/server.ts`, `src/connection-manager.ts`, `src/event-bridge.ts`, `src/auth.ts`, `src/rate-limit.ts`, `src/backpressure.ts`, `src/replay-buffer.ts`
- [ac] `packages/types/src/websocket-events.ts` publishes Zod schemas for frames: `auth`, `auth_required`, `auth_ok`, `auth_failed`, `subscribe`, `subscribe_ok`, `event`, `ping`, `pong`, `resume`, `reconnect`, `error`
- [ac] Frame schemas frozen by Day 4 of sprint (git tag or annotated commit)
- [ac] Server starts on `WS_PORT` (default 3001) and emits `{ type: 'auth_required' }` within 100 ms of new connection
- [ac] `{ type: 'auth', token: '<JWT>' }` → `{ type: 'auth_ok', userId, roles }` on success via shared `verifyJwt`
- [ac] Invalid JWT → `{ type: 'auth_failed' }` + WebSocket close code 4001
- [ac] Connection without auth for >5 s → close code 4001
- [ac] JWT `exp` elapses mid-session → server closes with code **4003** (new code) and spec doc updated accordingly
- [ac] `{ type: 'subscribe', topic: 'workflow/<id>' }` → `{ type: 'subscribe_ok' }` on success
- [ac] Subscribe to a topic user lacks RBAC for → `{ type: 'error', code: 403 }` and subscription rejected
- [ac] Redis message on `ws:workflow/<id>` → subscribed client receives `{ type: 'event', topic, data, eventId, timestamp }`
- [ac] Server pings every 30 s; 3 missed pongs → close code 1008
- [ac] `{ type: 'resume', lastEventId }` within 5 min of disconnect → server replays events from ring buffer
- [ac] Resume outside 5-min window → `{ type: 'full_sync' }` directive (client must re-fetch state via REST)
- [ac] Graceful shutdown → `{ type: 'reconnect', retryAfterMs: 5000 }` broadcast to all connections
- [ac] Backpressure: per-connection outbound queue capped at 1000; when exceeded, close with code 1013
- [ac] Inbound rate limit: >50 frames/sec from a client → close with code 4002
- [ac] Event idempotency: duplicate `eventId` on Redis → deduped before fan-out
- [ac] Railway service manifest committed; `ws-server` reachable at a dedicated staging URL
- [ac] `docs/04-specs/websocket-lifecycle.md` promoted from Draft → **Implemented v1.0**, with committed error-code table including new 4003
- [ac] Feature flag `ws-server-enabled` added to `DEFAULT_FLAGS` with `enabled: false` (allows staging rollout independent of app deploy)
- [ac] Integration tests under `apps/ws-server/tests/` reproduce all protocol behaviours using a Node `ws` client (not a dev-box walkthrough)
- [ac] **JWT extraction sub-task**: HITL-specific JWT verification in `packages/hitl-gateway` is factored into a new shared module (location: `packages/auth-utils` OR co-located in `packages/types/src/auth.ts` — PR picks whichever has the lowest touch footprint and documents the choice). Both `apps/web` and `apps/ws-server` consume it. HITL gateway refactored to use the shared implementation. No behaviour change; coverage preserved.
- [ac] **Observability**: `ws-server` emits metrics `ws_active_connections`, `ws_message_egress_rate`, `ws_pubsub_latency_ms`, `ws_auth_failures_total` via existing metrics service
- [ac] **Auth-failure audit**: every close with code 4001 or 4003 writes an audit event `platform.auth.ws_auth_failed` (actor, reason, timestamp) so credential-stuffing attempts are detectable
- [ac] **Railway monorepo config**: `railway.json` entry for `ws-server` specifies `rootDirectory: "apps/ws-server"` and `watchPatterns` so `ws-server` builds don't trigger `apps/web` deploys (and vice versa)
- [ac] `websocket-events.ts` frame schemas are exported from `@aptivo/types` (not `@aptivo/ws-server`) so the eventual Phase 3.5 UI-F consumes the same contract

**Files**:
- Create: `apps/ws-server/package.json`, `tsconfig.json`
- Create: `apps/ws-server/src/server.ts` (bootstrap, lifecycle)
- Create: `apps/ws-server/src/connection-manager.ts` (per-connection state)
- Create: `apps/ws-server/src/event-bridge.ts` (Redis pub/sub → subscriber fan-out)
- Create: `apps/ws-server/src/auth.ts` (JWT verify + expiry watchdog)
- Create: `apps/ws-server/src/rate-limit.ts` (inbound frame rate limiter)
- Create: `apps/ws-server/src/backpressure.ts` (outbound queue + slow-consumer policy)
- Create: `apps/ws-server/src/replay-buffer.ts` (5-minute ring buffer per topic)
- Create: `apps/ws-server/tests/` (integration tests)
- Create: `packages/types/src/websocket-events.ts` (Zod frame schemas)
- Extract: `verifyJwt` from `packages/hitl-gateway/src/decision/multi-decision-service.ts` (and any HITL-specific call sites) into a new shared module — verified during multi-review that no generic utility exists yet. Candidates: `packages/types/src/auth.ts` helper or a new `packages/auth-utils` package — PR picks whichever has the lowest touch footprint and documents the choice. Both `apps/web` and `apps/ws-server` import from the new location.
- Create: Railway service manifest entry (`railway.json` or equivalent)
- Modify: `apps/web/src/lib/inngest.ts` (publish selected workflow step events to `ws:workflow/<id>` Redis channel)
- Modify: `docs/04-specs/websocket-lifecycle.md` (status → Implemented v1.0; add 4003 to error-code table)
- Modify: `apps/web/src/lib/feature-flags/defaults.ts` (add `ws-server-enabled`, default false)

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `packages/types/src/websocket-events.ts` exports parseable Zod schemas for all frame types
2. Green: define schemas; barrel-export from `@aptivo/types`
3. Red: server starts on `WS_PORT`, accepts a new connection, sends `auth_required` within 100 ms
4. Green: implement bootstrap with `ws` library; handler sends frame on connect
5. Red: `{ type: 'auth', token: validJwt }` → `{ type: 'auth_ok', userId, roles }`
6. Green: integrate shared `verifyJwt`; return claims in ok frame
7. Red: invalid JWT → `auth_failed` + close 4001
8. Green: map verify failure → frame + close
9. Red: no auth within 5 s → close 4001
10. Green: schedule per-connection timer; close on expiry
11. Red: token `exp` elapses mid-session → close 4003
12. Green: schedule watchdog at token `exp - now`; close with 4003
13. Red: `subscribe` to allowed topic → `subscribe_ok`; subscribe to forbidden topic → `error 403`
14. Green: RBAC check against JWT roles + topic permission map
15. Red: Redis message on `ws:workflow/<id>` → subscribed client receives `event` frame
16. Green: subscribe to Redis channel; fan out to matching connections
17. Red: 3 missed pongs → close 1008
18. Green: track last-pong timestamp; disconnect on 3x miss
19. Red: `resume` with `lastEventId` inside replay window → replays missed events
20. Green: per-topic ring buffer (1000 events, 5 min TTL); replay from cursor
21. Red: resume outside window → `full_sync`
22. Green: map missed cursor → `full_sync` directive
23. Red: backpressure — 1001st queued outbound frame triggers close 1013
24. Green: monitor outbound queue length; disconnect when cap breached
25. Red: inbound >50 frames/sec → close 4002
26. Green: sliding-window rate limiter; disconnect on exceed
27. Red: duplicate `eventId` from Redis → deduped before fan-out
28. Green: per-connection LRU of recent `eventId`s
29. Red: graceful shutdown broadcasts `reconnect` with `retryAfterMs`
30. Green: SIGTERM handler sends frame before closing connections
31. Red: Railway deploy — CI builds ws-server image and health check is reachable via staging URL
32. Green: commit Railway manifest with `rootDirectory` + `watchPatterns`; verify deploy in staging
33. Red: HITL gateway tests still pass after `verifyJwt` extraction to shared module
34. Green: refactor HITL gateway to consume new shared module; run full HITL test suite with no regressions
35. Red: metrics emitted for `ws_active_connections`, `ws_message_egress_rate`, `ws_pubsub_latency_ms`, `ws_auth_failures_total`
36. Green: wire counters to existing metrics service; verify emission under load test
37. Red: close 4001 / 4003 writes `platform.auth.ws_auth_failed` audit event
38. Green: wire audit emission in connection manager close path

---

### Phase D: Department Budgeting (Days 1-7)

#### FA3-01: FA-4 Department Budgeting — Schema + Service + Admin API + Admin Rate-Limiter (6 SP)

*Re-estimated from 5 SP after multi-model review: verified no `adminRateLimit` middleware exists today (grep confirmed). Plan previously claimed "reuses existing admin middleware"; the correct scope is **building** a minimal admin rate-limiter as part of this task.*

**Description**: Introduce `departments` as a first-class entity with its own workspace package `@aptivo/budget`. The existing `BudgetService` in `packages/llm-gateway/src/budget/budget-service.ts` is a **class** (`new BudgetService(store)`); the new `DepartmentBudgetService` deliberately uses the platform's factory-with-DI convention (`createDepartmentBudgetService({ store, logger })`) — this is a form migration, not a class reuse. Coupling department budgeting to `@aptivo/llm-gateway` would be semantically wrong because departments are an organizational concept, not an LLM concept; the new package isolates the boundary. New schema: `departments` (id UUID, name, ownerUserId FK, timestamps) + `department_budget_configs` (departmentId FK, monthlyLimitUsd, warningThreshold, blockOnExceed, notifyOnWarning, timestamps). A nullable `departmentId` column is added to `llm_usage_logs` so spend can be attributed per department once S17 wires up request stamping — S16 explicitly does not stamp requests, keeping the column nullable to avoid a breaking change. Admin CRUD endpoints are added with RBAC (`platform/admin.budget.edit`), existing admin rate-limit middleware, and audit events on every write (`platform.admin.department.created`, `platform.admin.budget.updated`). Drizzle migrations are generated and committed with verified down-migrations — reversibility is a delivery requirement, not an afterthought.

**Acceptance Criteria**:
- [ac] New workspace package `@aptivo/budget` scaffolded: `package.json`, `tsconfig.json`, `src/index.ts`, Turborepo pipeline entry
- [ac] Package builds standalone via `pnpm --filter @aptivo/budget build`
- [ac] `departments` table schema: `id` UUID PK, `name` varchar(120), `ownerUserId` UUID FK to `users`, `createdAt`, `updatedAt`
- [ac] `department_budget_configs` table schema: `departmentId` UUID FK (unique), `monthlyLimitUsd` numeric(10,2), `warningThreshold` numeric(3,2, default 0.90), `blockOnExceed` bool (default true), `notifyOnWarning` bool (default true), timestamps
- [ac] `llm_usage_logs` has new nullable `departmentId` UUID column (no backfill required)
- [ac] Drizzle migration generated + committed; down-migration drops the new tables + column, verified in test harness
- [ac] `createDrizzleDepartmentBudgetStore(db)` implements `DepartmentBudgetStore` with `createDepartment`, `findDepartmentById`, `setBudget`, `getBudget`, `getSpendReport`
- [ac] `createDepartmentBudgetService({ store, logger })` exposes `checkBudget(deptId, amount)`, `setBudget(deptId, config)`, `getSpendReport(deptId, range)`
- [ac] `checkBudget` returns `{ allowed: true, remaining: N }` when under limit, `{ allowed: false, remaining: 0 }` when over with `blockOnExceed: true`
- [ac] `getSpendReport(deptId, { from, to })` aggregates `llm_usage_logs.costUsd` filtered by `departmentId` and time range; returns `{ totalUsd, rowCount, coverageLevel: 'none' | 'partial' | 'full' }` where `coverageLevel` reflects how much traffic in the range had `departmentId` stamped (will be `'none'` on S16 launch until S17 stamping lands, then `'partial'` until back-fill, then `'full'`). Callers cannot misinterpret $0 as "no spend" vs "no attribution"
- [ac] `POST /api/admin/departments` creates a department (RBAC: `platform/admin.department.edit`); writes audit event `platform.admin.department.created`
- [ac] `PUT /api/admin/departments/[id]/budget` updates config (RBAC: `platform/admin.budget.edit`); writes audit event `platform.admin.budget.updated`
- [ac] `GET /api/admin/departments/[id]/budget` returns current config + spend-to-date
- [ac] Unauthorized role on any of the above → 403 RFC 7807
- [ac] **New admin rate-limit middleware** `createAdminRateLimit({ redis, windowMs, maxWrites })` — Redis-backed token bucket keyed by actor; this middleware does not exist today and must be built
- [ac] Admin rate-limit applied to both admin write endpoints (`POST /api/admin/departments`, `PUT /api/admin/departments/[id]/budget`); default: 30 writes per 5 min per actor
- [ac] Exceeded rate limit → 429 RFC 7807 with `Retry-After` header
- [ac] OpenAPI v1.2.0+ entries added for all three routes including rate-limit error responses
- [ac] Tagged errors: `DepartmentBudgetError = { _tag: 'DepartmentNotFound' } | { _tag: 'MonthlyBudgetExceeded', remaining: 0 } | { _tag: 'BudgetConfigInvalid', issues }`

**Files**:
- Create: `packages/budget/package.json`, `tsconfig.json`, `turbo.json` pipeline entry
- Create: `packages/budget/src/index.ts` (barrel)
- Create: `packages/budget/src/department-budget-service.ts`
- Create: `packages/budget/src/types.ts` (`DepartmentBudgetConfig`, `DepartmentBudgetStore`, `DepartmentBudgetError`, `SpendReport`)
- Create: `packages/budget/tests/department-budget-service.test.ts`
- Create: `packages/database/src/schema/departments.ts`
- Create: `packages/database/src/schema/department-budget-configs.ts`
- Create: `packages/database/src/adapters/department-budget-store.ts`
- Create: `packages/database/tests/adapters/department-budget-store.test.ts`
- Modify: `packages/database/src/schema/llm-usage.ts` (add nullable `departmentId`)
- Generate: migration via `pnpm --filter @aptivo/database db:generate` — file committed
- Create: `apps/web/src/app/api/admin/departments/route.ts` (GET/POST)
- Create: `apps/web/src/app/api/admin/departments/[id]/budget/route.ts` (GET/PUT)
- Create: `apps/web/src/lib/security/admin-rate-limit.ts` — `createAdminRateLimit({ redis, windowMs, maxWrites })` Redis-backed token bucket (new middleware; does not exist today)
- Create: `apps/web/tests/security/admin-rate-limit.test.ts`
- Create: `apps/web/tests/s16-fa3-01-department-budgeting.test.ts`
- Modify: `apps/web/src/lib/services.ts` (`getDepartmentBudgetService()` lazy getter; wire admin rate limiter from session Redis)
- Modify: `apps/web/openapi.yaml` (new admin endpoints with Zod-derived schemas + 429 response schema)
- Modify: root `pnpm-workspace.yaml` if needed (should be auto-picked)

**Dependencies**: None

**TDD Micro-Tasks**:
1. Red: `pnpm --filter @aptivo/budget build` fails (package does not exist)
2. Green: scaffold package.json, tsconfig.json, src/index.ts
3. Red: migration generation produces a file including `departments` + `department_budget_configs`
4. Green: define Drizzle schemas; run db:generate; commit migration
5. Red: down-migration test drops both tables + `departmentId` column cleanly
6. Green: verify reversibility in test harness
7. Red: `createDrizzleDepartmentBudgetStore(db).createDepartment({ name, ownerUserId })` returns `{ id, name, ownerUserId, createdAt, updatedAt }`
8. Green: implement adapter; insert + return row
9. Red: `setBudget(deptId, { monthlyLimitUsd: 1000, warningThreshold: 0.9 })` persists
10. Green: upsert into `department_budget_configs`
11. Red: `checkBudget(deptId, 10)` returns `{ allowed: true, remaining: 990 }` when `spend = 0` and `limit = 1000`
12. Green: implement service logic reusing existing aggregation patterns
13. Red: `checkBudget(deptId, 1100)` returns `{ allowed: false, remaining: 0 }` when over limit and `blockOnExceed: true`
14. Green: over-limit branch
15. Red: `checkBudget` on unknown department returns `Result.err({ _tag: 'DepartmentNotFound' })`
16. Green: store lookup + tagged error
17. Red: `getSpendReport(deptId, { from, to })` aggregates `llm_usage_logs` filtered by `departmentId` + range
18. Green: implement spend aggregation query
19. Red: `POST /api/admin/departments` unauthorized role → 403
20. Green: RBAC check middleware
21. Red: `POST /api/admin/departments` authorized → 201 with department JSON + audit event written
22. Green: route handler calls service + writes audit event
23. Red: `PUT /api/admin/departments/[id]/budget` authorized → 200 + audit event
24. Green: implement PUT handler
25. Red: `createAdminRateLimit({ redis, windowMs: 300_000, maxWrites: 30 })` returns middleware that rate-limits per actor via Redis token bucket
26. Green: implement middleware using session Redis (split from S15); keys by `admin:rl:<actor>`
27. Red: 31st write within 5 min from same actor → 429 + `Retry-After` header
28. Green: increment counter on each write; reject when over limit
29. Red: counter resets after window; 31st write after reset succeeds
30. Green: verify Redis TTL behaviour
31. Red: both admin write endpoints are rate-limited (verified via integration test)
32. Green: apply new `adminRateLimit` middleware to both routes
33. Red: `getSpendReport` returns `{ coverageLevel: 'none' }` when no rows in range have `departmentId` set
34. Green: add `coverageLevel` computation based on stamped-vs-unstamped row counts
35. Doc: update `openapi.yaml` with new routes + 429 response schema

---

> **FA3-02 — Budget-Exceed Warning Notifications (2 SP): DEFERRED to Sprint 17 per multi-model review Path A (2026-04-20).** Rationale: after the 4 SP of estimate corrections on LLM3-03/LLM3-04/WFE3-02/FA3-01 landed, keeping FA3-02 pushed the sprint to 29 SP — above the 27-30 comfort band once critical-path risk is factored. Epic 8 still ships a usable department-budgeting API in S16; only the notification side-channel defers. S17 will pair FA3-02 with HITL escalation as a cleaner bundle, with Redis-backed (not in-memory) dedupe appropriate for multi-instance production.

---

## 2. Dependency Graph

```
Phase A (Days 1-3) — Graph Validation:
  WFE3-01 (3 SP) ─── no deps ───────────────────────────┐
                                                          │
Phase B (Days 1-8) — LLM Safety v2:                     │
  LLM3-03 (Eval Harness, 4 SP) ─── no deps ──────────── │
                                         │                │
  LLM3-02 (ML Classifier, 5 SP) ← LLM3-03                │
                                                          │
  LLM3-04 (Anomaly Gate, 3 SP) ─── no deps ─────────────│
                                                          │
Phase C (Days 2-9) — WebSocket:                         │
  WFE3-02 (WebSocket Server, 6 SP) ─── no deps ─────────┤
                                                          │
Phase D (Days 1-7) — Department Budgeting:              │
  FA3-01 (Dept Budgeting + Admin RL, 6 SP) ─ no deps ── ▼
```

**Critical path**: LLM3-03 → LLM3-02 → eval run (end of sprint). Total critical-path budget: 9 SP over 2 weeks.

**Parallel tracks**:
- Track A (Senior, 12 SP): LLM3-03 (4) → LLM3-02 (5) → LLM3-04 (3) — all Epic 2
- Track B (Web Dev 1, 9 SP): WFE3-01 (3) → WFE3-02 (6) — all Epic 3
- Track C (Web Dev 2, 6 SP): FA3-01 (6) — Epic 8 core (FA3-02 deferred to S17)

LLM3-03 lands first in Track A so LLM3-02 has a stable eval baseline. WFE3-02 can start on Day 2 once `packages/types/src/websocket-events.ts` frame schemas are drafted (Day 1-2); the Day 4 schema freeze is a hard internal deadline. FA3-01 is largely independent and can start Day 1. Track C is lighter than Tracks A/B — Web Dev 2 can either finish early (buffer for Track A/B spillover via pairing on tests) or pick up S17 case-tracking scoping work.

---

## 3. Architectural Decisions

### Q1: ML Classifier Wraps Rule-Based — Not Replaces

**Decision**: `createMlInjectionClassifier` composes over `ruleBasedFallback`. On ML success within timeout with a valid Zod-shape response, ML wins. On timeout, HTTP error, or Zod parse failure, rule-based wins. Logging is via DI safe-logger. The feature flag `ml-injection-classifier` defaults off in production so the live system keeps running against the rule-based classifier until eval numbers are reviewed in S17.

**Rationale**: Cosmetic ML safety is worse than no ML safety — a silently-failing model that returns `allow` by default would weaken production security. Wrapping preserves defence-in-depth and matches Codex's Risk #1 mitigation from the multi-review. Production enablement is a deliberate governance step, not a silent rollout.

### Q2: WebSocket Server as a Separate App (`apps/ws-server`)

**Decision**: WebSocket upgrade lives in a standalone Node.js app, not inside `apps/web`. The new app mirrors the proven `apps/spike-runner` pattern — same workspace types, same composition-root shape, different entrypoint. It publishes events out via Redis pub/sub (produced by `apps/web` Inngest handlers) and consumes them to fan out to clients.

**Rationale**: Next.js App Router does not support WebSocket upgrades in its serverless runtime. Attempting to co-host would either force a runtime downgrade (losing App Router benefits) or require creative workarounds that would not be covered by any Next.js guarantees. A separate process is the normal pattern, keeps `apps/web` deployment simple, and matches the Railway model of "one service per process."

### Q3: Departments as First-Class Entity

**Decision**: New `departments` + `department_budget_configs` tables. The existing `domain` concept (crypto, hr, core) represents system boundaries, not organizational units — overloading it with department semantics would conflate two axes and make future org features (team-scoped RBAC, cost centres, multi-department domains) structurally painful.

**Rationale**: A short detour now (scaffold new package, add two tables, nullable FK on usage log) avoids a semantic-overload rewrite later. The Plan agent called this out: a standalone `@aptivo/budget` package is semantically cleaner than coupling org budgeting to `@aptivo/llm-gateway`.

### Q4: Graph Validation as Pure Functions

**Decision**: The validator lives in `packages/workflow-engine` as pure functions returning `Result<void, GraphValidationError>`. No database access, no I/O. The HTTP route and the workflow-definition-service both call the same validator.

**Rationale**: Sprint 17 case tracking (Epic 4), future workflow-builder UI (Phase 3.5 UI-E), and any CLI tooling (e.g., a CI check that validates every workflow file in the repo) all need the same validator. Binding it to the API layer would force each caller to reproduce the logic.

### Q5: Inngest → Redis → WebSocket Fan-Out

**Decision**: `apps/web` keeps emitting Inngest events exactly as it does today. A new Inngest function (in `apps/web`) subscribes to a curated subset of workflow step events and publishes them to Redis channels keyed by topic (`ws:workflow/<id>`). `apps/ws-server` subscribes to the Redis channels and fans out to connected clients.

**Rationale**: Preserves the durable-execution contract (Inngest remains the system of record for workflow state) while adding a real-time side-channel. Redis is already provisioned (split session vs jobs in S15) — reusing the jobs Redis for pub/sub avoids new vendor dependencies.

### Q6: 5-Minute Replay Buffer In-Memory per Topic

**Decision**: Per-topic ring buffer sized 1000 events inside `ws-server`. Past-window resume returns `full_sync` — the client must re-fetch state via REST.

**Rationale**: Persisting event state in the WS server would couple it to a stateful store and make horizontal scaling harder. A bounded in-memory buffer is simple, fits the 5-minute spec window, and offloads "long gap recovery" to the already-stateful REST layer.

### Q7: Feature-Flag and Safe-Logger DI at Composition Root

**Decision**: Packages (`@aptivo/llm-gateway`, `@aptivo/budget`) **never** import from `apps/web`. Factories that need feature-flag state or logging accept `isEnabled: () => boolean` and `logger: SafeLogger` callbacks, bound at construction time in `apps/web/src/lib/services.ts` to the app-level singletons.

**Rationale**: Preserves the one-way dependency (apps → packages, never the reverse) that the monorepo already enforces. Enables package-level unit testing without instantiating app-level services. Matches existing patterns in the codebase (`*Deps` interfaces everywhere).

### Q8: Department-ID Stamping Is Deferred to S17

**Decision**: The `departmentId` column on `llm_usage_logs` is nullable in S16, and `services.ts` does not yet populate it on request. The middleware that resolves `user → department` and stamps every LLM request is a separate S17 task.

**Rationale**: The full plumbing (middleware, request context, idempotent stamping) is its own task and would push FA3-01 well beyond 5 SP. Making the column nullable means untagged traffic still writes to `llm_usage_logs` without schema errors; `getSpendReport` simply returns `$0` for unstamped traffic — a known, documented limitation that the S16 delivery review will call out, not a bug.

---

## 4. Scope Decision

| Item | SP | Decision | Rationale |
|------|----|----------|-----------|
| WFE3-01 Graph Validation | 3 | **Commit** | Unblocks S17 Epic 4 case tracking; pure functions reusable across surfaces |
| LLM3-03 Eval Harness | 4 | **Commit** *(was 3)* | Corpus curation is real annotation work per multi-review |
| LLM3-02 ML Injection Classifier | 5 | **Commit** | Epic 2 finish; feature-flagged for safe rollout; Replicate vendor locked pre-sprint |
| LLM3-04 Active Anomaly Blocking | 3 | **Commit** *(was 2)* | `getAccessPattern` audit-store query is net-new plumbing per multi-review |
| WFE3-02 WebSocket Server + Protocol Lock | 6 | **Commit** *(was 5, was 3)* | JWT extraction from HITL is real refactor — verified no shared `verifyJwt` exists |
| FA3-01 Department Budgeting + Admin Rate-Limiter | 6 | **Commit** *(was 5)* | `adminRateLimit` middleware must be built, not reused — verified no such middleware exists |
| FA3-02 Budget-Exceed Notifications | — | **Defer → S17** *(was 2, pulled out)* | Per multi-review Path A; pairs with HITL escalation in S17 |
| ML classifier production enablement | — | **Defer → S17 review** | Ship behind flag; enable after eval sign-off |
| HITL escalation on budget exceed | — | **Defer → S17** | Out of Epic 8 S16 scope |
| Department-ID request stamping | — | **Defer → S17** | Own task; S16 column is nullable so no breaking change |
| Safe-logger migration of existing `console.warn` call sites in `@aptivo/llm-gateway` | — | **Defer → S17** | DoD scoped to *new* components only per multi-review §G4 |
| Stripe/HubSpot/Asana/Toggl procurement | 0 | **Start (calendar)** | Tickets opened Day 0 per multi-review Risk #2 (vendor calendar risk) |
| WebSocket UI surface consumers | — | **Defer → Phase 3.5 UI-F** | Per 2026-04-20 UI descope decision |

**Committed**: 27 SP · **Deferred**: ~9 SP of downstream work explicitly sequenced to S17 or Phase 3.5

---

## 5. Owner Allocation

| Developer | Tasks | SP |
|-----------|-------|-----|
| **Senior** | LLM3-03 (4), LLM3-02 (5), LLM3-04 (3) | **12** |
| **Web Dev 1** | WFE3-01 (3), WFE3-02 (6) | **9** |
| **Web Dev 2** | FA3-01 (6) | **6** |
| **Total** | | **27** |

Senior carries Epic 2 end-to-end because ML classifier integration is the sprint's highest-risk item (vendor procurement, fallback correctness, eval tuning). Web Dev 1 owns Epic 3 where WFE3-02 is the single largest task of the sprint (6 SP, standalone new app + JWT extraction from HITL). Web Dev 2 owns Epic 8 core (FA-4 department budgeting + new admin rate-limiter). The 12/9/6 distribution is uneven but deliberate — Epic 2 work is tightly coupled (corpus → ML classifier → eval runs) and does not split cleanly across owners. Web Dev 2's lighter load gives them capacity to pair on test reviews or begin S17 case-tracking scoping once FA3-01 lands.

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Replicate procurement not ready by Day 1 | Medium | High | LLM3-02 ships behind flag even without model URL; eval harness (LLM3-03) is hosting-independent; vendor locked pre-sprint |
| ML classifier fails precision ≥ 90% / recall ≥ 80% on holdout | Medium | Medium | Numbers are recorded, not asserted; S19 contingency buffer absorbs tuning iterations; ML rollout is feature-flagged so delivery ≠ enablement |
| WebSocket server deploy complexity on Railway | Medium | Medium | `apps/spike-runner` proven pattern; ws-server shipped behind `ws-server-enabled` flag; staging deploy verified as DoD |
| `verifyJwt` sharing forces larger-than-estimated cross-package refactor | Medium | Medium | Budget already inside WFE3-02 5 SP bump; documented fallback is workspace re-import with a clear seam comment |
| Inngest → Redis event bridge introduces duplication | Low | Medium | Idempotency key per event; WS clients dedupe by `eventId` |
| Eval corpus overlaps with existing regex patterns (artificially inflates ML) | Medium | Medium | Senior signs off on corpus quality before LLM3-02 consumes it; stratified train/holdout split; adversarial boundary samples required |
| Schema change to `llm_usage_logs` is misread as breaking | Low | Medium | `departmentId` added nullable; migration test asserts no existing row fails; delivery review documents the nullable-for-S16 decision |
| `@aptivo/budget` package scaffolding triggers Turborepo/tsconfig churn | Low | Medium | Follow existing patterns from `@aptivo/audit`; scaffolding absorbed into FA3-01 5 SP |
| Day 4 WS schema freeze slips, cascading into implementation churn | Medium | Medium | Internal deadline enforced by lead (Web Dev 1); draft schemas reviewed by Senior before Day 4 |
| Cross-sprint DoD (OpenAPI, safe-logger, audit, rate-limit) skipped in time crunch | Low | High | DoD included as acceptance criteria on every task — not a separate checklist; PRs that skip it fail review |

---

## 7. Definition of Done

- [ ] WFE3-01: `validateGraph` pure functions + `POST /api/workflows/:id/validate` endpoint + RFC 7807 on cyclic create
- [ ] LLM3-03: 200+ sample corpus with stratified split + `runEval` harness + rule-based baseline recorded in `injection-eval-baseline.md`
- [ ] LLM3-02: `createMlInjectionClassifier` + Replicate adapter + timeout/error/Zod fallback + eval run against harness + feature flag (default off)
- [ ] LLM3-04: `createAnomalyGate` + `GatewayDeps.anomalyGate?` + `LLMError` union extended with `AnomalyBlocked` + feature flag (default off)
- [ ] WFE3-02: `apps/ws-server` app + frame schemas frozen by Day 4 + all 18 protocol behaviours via integration tests + Railway deploy verified in staging + spec doc lifted to v1.0 Implemented with committed error-code table (including 4003)
- [ ] FA3-01: `@aptivo/budget` package + `departments` + `department_budget_configs` tables + Drizzle migration (reversibility verified) + `DepartmentBudgetService` + admin CRUD API with RBAC + audit events + **new admin rate-limit middleware** (built, not reused)
- [ ] ~~FA3-02~~ — **deferred to S17 per Path A**
- [ ] Cross-sprint DoD (applies to every task):
  - [ ] OpenAPI v1.2.0+ updated for every new/changed endpoint
  - [ ] Drizzle migrations generated + reversibility verified
  - [ ] Event schemas published under `packages/types/src/websocket-events.ts` and any new Inngest events
  - [ ] WebSocket protocol doc lifted to `v1.0 Implemented`
  - [ ] Safe-logger passed via DI into every **new** package component (existing `console.warn` call sites in `@aptivo/llm-gateway` are deferred to S17 — scope of this DoD item is new code only)
  - [ ] Feature-flag DI contract honored on every flagged capability
  - [ ] RFC 7807 error responses on all new HTTP routes
  - [ ] Admin writes emit audit events via existing `AuditService`
  - [ ] Admin routes protected by the **new `adminRateLimit` middleware built in FA3-01** (this middleware did not exist before S16)
- [ ] 80%+ test coverage on new code
- [ ] CI pipeline green; no regressions in S15 test suite (currently 1,580 + S15 additions)
- [ ] S16 delivery review doc written (`sprint-16-delivery-review.md`) with acceptance-criteria checklist per task and release-gate decision

---

## 8. Doc-Gate Requirement

| Document | Section | Task |
|----------|---------|------|
| `docs/04-specs/injection-eval-baseline.md` | Rule-based baseline numbers + Senior Dev sign-off comment | LLM3-03 |
| `docs/04-specs/injection-eval-baseline.md` | ML classifier eval results (appended) | LLM3-02 |
| `docs/04-specs/websocket-lifecycle.md` | Status → `v1.0 Implemented`; error-code table updated with 4003 | WFE3-02 |
| `apps/web/openapi.yaml` (or equivalent) | New `/api/workflows/{id}/validate` endpoint + `GraphValidationError` schemas | WFE3-01 |
| `apps/web/openapi.yaml` | New `/api/admin/departments` + `/api/admin/departments/{id}/budget` endpoints | FA3-01 |
| `docs/06-sprints/sprint-16-delivery-review.md` | Per-task acceptance checklist + release-gate GO/NO-GO + deferred item audit (department stamping, ML enablement, HITL escalation) | End-of-sprint |

---

## 9. Sprint 17 Preview

Sprint 17 picks up where S16 leaves off: domain workflows (Epic 5), case tracking (Epic 4), and residual plumbing from S16 Path A deferrals.

| Item | SP (est.) | Why it needs S16 |
|------|-----------|----------------------|
| CT-1 Ticket CRUD API | 3 | Uses graph validator (WFE3-01) and workflow engine |
| CT-2 SLA tracking engine | 2 | Reuses burn-rate alerting from S12 |
| CT-3 Escalation logic | 3 | Reuses HITL sequential chains from S11 |
| CT-4 Reporting queries | 2 | Reuses metric service from S7 |
| Crypto live-trading workflow | 5 | Needs ML safety pipeline from LLM3-02 + anomaly gate from LLM3-04 |
| HR onboarding workflow | 4 | Depends on MOD-02 interface contracts |
| MOD-02 interface contract validation | 3 | Gates Epic 6 integrations in S18 |
| Department-ID stamping on LLM requests | 2 | FA3-01 schema ready, plumbing lives in S17 |
| FA3-02 Budget notifications + HITL escalation (merged) | 3 | Deferred from S16 Path A; pairs with HITL escalation; Redis-backed dedupe for multi-instance durability |
| Safe-logger migration for existing `@aptivo/llm-gateway` `console.warn` call sites | 1 | S16 DoD scoped safe-logger to new code only; 7 existing call sites need migration |
| ML classifier production enablement review | 1 | Review LLM3-02 eval numbers; decide flag enablement |
| **Anomaly-gate aggregate-key alignment** (S17 BLOCKER for anomaly-blocking enablement) | 2 | Per S16_LLM3_04 multi-review: gateway currently passes `request.domain` as `resourceType`, but real audit rows use values like `'candidate'`/`'employee'` with actions like `'pii.read.bulk'`. Must resolve before ANOMALY_BLOCKING_ENABLED can be flipped — options: per-domain action whitelist via `aggregateAccessPattern.actions`, OR change the gateway to pass resource-specific keys, OR index by domain |
| Request→actor plumbing on `CompletionRequest` (enables both LLM3-04 and FA3-01 stamping) | 1-2 | `resolveActor` currently returns `undefined` because CompletionRequest carries no user context |
| Anomaly-gate real baseline job (replaces S16 placeholder constant) | 2-3 | Historical baseline builder — OBS track |
| Adapter test for `aggregateAccessPattern` against real Drizzle | 1 | Requires test DB infra; deferred from S16 |
| Unify `UsageRecord` in `@aptivo/types` (removes drift between gateway + database adapter) | 1 | LLM3-02 deferral; cross-package refactor |

**S17 target**: ~24-26 SP across Case Tracking (10) + Domain Workflows (12) + Path A residuals (~4). Tight but achievable given Phase 2 velocity; S19 contingency absorbs any slip.
