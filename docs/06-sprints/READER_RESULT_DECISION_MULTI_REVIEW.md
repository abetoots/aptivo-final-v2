# ReaderResult Keep/Drop Decision — Multi-Model Review

**Date**: 2026-03-10
**Models**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (Primary via Pal clink), Codex/GPT (Secondary)
**Task**: Resolve the design tension between the ReaderResult monadic pattern (prescribed in guidelines) and the factory-function + Result pattern (used in all production code)

---

## Executive Summary

All three models unanimously recommend **DROP** — remove the ReaderResult mandate from coding guidelines, archive the guide, and standardize on the factory-function + `Result<T,E>` pattern already proven across 4 sprints, 6 packages, and 500+ tests.

The ReaderResult guide (`05c-ReaderResult-Guide.md`) is a pre-implementation aspiration from early design that was superseded by practical reality. The team discovered that simple factory functions with explicit Result checking are simpler, more debuggable, fully compatible with Inngest's imperative step model, and sufficient for the platform's needs.

**Decision: DROP ReaderResult. Optionally enhance `@aptivo/types` Result with lightweight helpers.**

---

## Consensus Points (All 3 Models Agreed)

| # | Finding | Verdict |
|---|---------|---------|
| 1 | **Shape incompatibility is a dealbreaker** — `@satoshibits/functional` uses `{ success, data }` while Aptivo uses `{ ok, value }`. Adoption requires migrating 6 packages and 500+ tests for zero functional gain. | DROP |
| 2 | **0% production adoption** — zero lines of production code use ReaderResult after 4 sprints. The team voted with their code. | DROP |
| 3 | **Inngest incompatibility** — `step.run()` checkpoints are inherently imperative. ReaderResult can only wrap code *inside* a single step, not across durable boundaries. The §8b saga pattern (return-value flow control) conflicts with `tryCatch` short-circuiting. | DROP |
| 4 | **Guidelines reference a phantom package** — `@aptivo/domain` is cited as the import source in both `05a-Coding-Guidelines.md` and `05c-ReaderResult-Guide.md` but doesn't exist. This creates confusion for any developer reading the guidelines. | FIX |
| 5 | **Factory functions are sufficient** — `createService(deps)` with `*Deps` interfaces provides clean DI, testability, and explicit error handling without monadic abstraction. | KEEP |
| 6 | **Optional Result helpers** — adding `map`, `flatMap`/`chain` to `@aptivo/types` Result could reduce boilerplate without changing the data shape or requiring a migration. | CONSIDER |

---

## Individual Model Positions

### Gemini 3 Flash Preview — DROP

Key arguments:
- Shape incompatibility is the "most severe blocker" — refactoring `ok/value` → `success/data` provides "zero functional value for extremely high migration cost"
- ReaderResult is redundant with Inngest's checkpoint-based step model, which already enforces a "monad-like" structure
- Maintaining phantom guidelines is "currently harmful" — they describe an architecture that doesn't exist
- Suggested adding `Result.map()` and `Result.combine()` as lightweight ergonomic improvements

### Codex/GPT — DROP (for now)

Key arguments:
- Measured 151 `if (!result.ok)` guards and 1277 `Result`/`.ok` usages — confirming massive scope of shape migration
- ReaderResult's future value for domain layers "does not justify retrofitting the current stable base today"
- ReaderResult could only wrap inner sub-operations within Inngest steps, not replace the outer workflow control model
- Called the guidelines-vs-reality gap "governance drift" — fix docs to match production truth
- Agreed: add `Result.map/chain/mapError` helpers as the non-breaking ergonomic improvement

### Claude Opus 4.6 (Lead) — DROP

Key arguments:
- The guide was written before Sprint 0. Four sprints of production code confirmed factory functions are the natural fit for this architecture.
- Inngest owns the orchestration boundary — the primary composition surface. ReaderResult adds value only inside pure domain logic chains (validate → transform → persist), but those chains are typically 3-5 steps where explicit `if (!result.ok)` is readable and not problematic.
- Future addendum domains will also use Inngest for workflow orchestration, meaning the same imperative boundary applies. The case for ReaderResult doesn't get stronger with more domains.
- The `@satoshibits/functional` library is well-engineered, but it's solving a problem Aptivo doesn't have at its current scale and architecture.

---

## Detailed Analysis

### 1. Value Delivered — LOW

ReaderResult solves two problems:
1. **Boilerplate reduction** — automatic error propagation instead of manual `if (!result.ok)` checks
2. **Explicit dependency threading** — deps flow through the computation rather than being closed over at construction

For Aptivo:
- Problem 1 exists (~151 guard clauses) but is manageable. The explicit checks provide superior debuggability and TypeScript flow analysis.
- Problem 2 is already solved by factory functions with `*Deps` interfaces. Both patterns support mock injection for testing.

### 2. Migration Cost — VERY HIGH

If adopted:
- Reconcile `{ ok, value }` ↔ `{ success, data }` across 6 packages and 500+ tests
- Create or integrate `@aptivo/domain` package
- Rewrite all service layer code from factory functions to ReaderResult pipelines
- Retrain team on monadic Do notation, pipe, bind, chain patterns
- Handle Inngest boundary where ReaderResult must "exit" the monad

Estimated effort: **3-5 sprint points** just for the migration, with significant regression risk and zero new functionality delivered.

### 3. Future Domain Value — MARGINAL

Addendum domains (HR, project management, etc.) will have:
- Service layers with business logic chains — ReaderResult could help here
- Inngest workflows for orchestration — ReaderResult doesn't apply here
- API routes connecting the two — imperative boundary

The domain service layer is where ReaderResult shines, but even there, the chains are typically short enough (3-7 steps) that explicit Result checking is readable. The break-even point where monadic composition clearly wins is 8+ chained operations with error propagation — rare in practice.

### 4. Inngest Compatibility — POOR

```typescript
// this is the dominant composition pattern in aptivo
inngest.createFunction({ id: 'workflow' }, { event: 'trigger' }, async ({ step }) => {
  // each step.run() is a durable checkpoint — ReaderResult can't wrap this
  const a = await step.run('step-a', () => serviceA.doThing());
  const b = await step.run('step-b', () => serviceB.doOther(a));
  // ReaderResult could only work INSIDE a step.run callback
  // but those are typically 1-3 lines — not enough to justify the abstraction
});
```

ReaderResult and Inngest represent two competing composition models. Inngest wins because it provides durability, which is the primary concern.

---

## Action Items

### Immediate (Sprint 5)

1. **Archive `05c-ReaderResult-Guide.md`** — move to `docs/archive/` or add a deprecation header
2. **Update `05a-Coding-Guidelines.md`** — remove ReaderResult references from §2.1, §4.2, §4.7, §6.3; replace with factory-function pattern documentation
3. **Remove `@aptivo/domain` references** — purge phantom package from all docs
4. **Update code review checklist** (§8.3) — remove "ReaderResult used for operations with dependencies"

### Optional (Future Sprint)

5. **Enhance `@aptivo/types` Result** — consider adding `Result.map()`, `Result.flatMap()`, `Result.mapError()` as ergonomic helpers (non-breaking, same `ok/value` shape)

### Out of Scope

- No changes to production code required — it already follows the correct pattern
- No changes to `@satoshibits/functional` — the library is fine, it's just not the right fit for Aptivo's architecture

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Developer confusion from outdated guidelines | HIGH (already happening) | MEDIUM | Fix docs immediately |
| Future regret if domain layers need monadic composition | LOW | LOW | Can always revisit; factory functions are not a dead end |
| Result helper additions introducing subtle behavior changes | LOW | LOW | Pure functions, additive only, shape unchanged |

---

## Decision Record

| Attribute | Value |
|-----------|-------|
| **Decision** | DROP ReaderResult from Aptivo guidelines and codebase |
| **Status** | APPROVED (3/3 model consensus) |
| **Date** | 2026-03-10 |
| **Rationale** | Shape incompatibility, Inngest architectural conflict, zero adoption, high migration cost, low marginal value |
| **Alternatives Considered** | KEEP (full adoption), HYBRID (domain-only), DROP (selected) |
| **Reversibility** | HIGH — factory functions don't preclude future monadic adoption if the architecture changes |
