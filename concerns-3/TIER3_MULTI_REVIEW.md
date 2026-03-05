# Tier 3 Structural Validation — Multi-Model Review

**Date**: 2026-03-04
**Concerns Evaluated**: horizontal-traceability, requirement-test-mapping, contradiction-scanner
**Reviewers**: Gemini (gemini-3-flash-preview via PAL clink), Codex (o3 via Codex MCP), Claude (opus-4-6 lead expert)

---

## Executive Summary

Three models independently evaluated the Aptivo documentation against 3 Tier 3 concern schemas — 2 new structural concerns (horizontal-traceability, requirement-test-mapping) and 1 regression check (contradiction-scanner). The documentation demonstrates strong architectural coherence across core services (Workflow, HITL, LLM, Identity), but Tier 3 reveals a **structural pattern** that Tier 1/2 fixes missed: the ADD was updated extensively during concern validation, but the BRD and FRD were not always kept in sync, creating new cross-document contradictions.

**Verdict: 3 ERRORs, 6 WARNINGs, 2 NOTEs**

| Concern | Gemini | Codex | Claude | Consensus |
|---------|--------|-------|--------|-----------|
| horizontal-traceability | 1E/1W | 1E/1W/1N | 0E/3W | 0E/3W/1N |
| requirement-test-mapping | 1E/1W | 3E/1W/1N | 1E/2W | 1E/3W |
| contradiction-scanner | 1E/1W | 3E/0W/1N | 2E/0W/1N | 2E/0W/1N |
| **Total** | **3E/3W** | **7E/2W/3N** | **3E/5W/1N** | **3E/6W/2N** |

---

## Concern 1: Horizontal Traceability

### Consensus Findings

The BRD→FRD→ADD traceability chain is strong for core services (Workflow, HITL, LLM, Identity, Notification, Audit). Three gaps were identified:

#### W1: File Storage — Backward Orphan (BRD gap)

| Model | Severity | Notes |
|-------|----------|-------|
| Gemini | ERROR | "Infrastructure being built without explicit business authorization" |
| Codex | WARNING | "BRD only ties it to out-of-scope section" |
| Claude | WARNING | FRD §8.5 acknowledges the gap explicitly |

**Evidence**: BRD §3.1 lists 7 in-scope components. File Storage is not among them. FRD §8.5 defines FR-CORE-BLOB-001/002 and notes: *"BRD Reference: Section 3.2 (Out-of-Scope notes domain-specific schemas, but shared storage infrastructure is **implicit** platform capability)"*. ADD §9.8 fully documents the File Storage service.

**Verdict: WARNING (not ERROR).** File Storage is needed for ClamAV malware scanning (BRD §3.1.4 mentions file uploads) and HITL file attachments. The FRD's "implicit" justification is weak but defensible. The BRD should be updated to make this explicit, but it's not an orphaned component — there IS a business need.

**Resolution**: Add "File Storage Service" to BRD §3.1 as shared infrastructure and to the build-vs-buy table.

**Status**: RESOLVED — BRD §3.1.8 added with business capabilities and domain examples; build-vs-buy row added (Build: Supabase Storage + ClamAV).

#### W2: MCP Tool Registry — Forward Orphan (API gap)

| Model | Severity | Notes |
|-------|----------|-------|
| Gemini | WARNING | "queryable requirement unmet in current build" |
| Codex | Not flagged | — |
| Claude | WARNING | Phase 1 scoping issue |

**Evidence**: FRD FR-CORE-MCP-001 acceptance criteria (line 211): *"Tool list is queryable by domain and capability."* The OpenAPI spec has no MCP discovery endpoints. Phase 1 uses hardcoded tool configs.

**Verdict: WARNING.** The FRD requirement outpaces the Phase 1 implementation. The tool registry is internal infrastructure, not user-facing API, so the gap is contained.

**Resolution**: Add Phase 1 scoping note to FR-CORE-MCP-001: "Phase 1: Tool registration via configuration. Phase 2: Runtime discovery API."

**Status**: RESOLVED — FRD FR-CORE-MCP-001 acceptance criteria updated with Phase 1/2 scoping note.

#### W3: Prompt Caching — Forward Orphan (BRD→FRD gap)

| Model | Severity | Notes |
|-------|----------|-------|
| Gemini | Not flagged | — |
| Codex | ERROR | "Not traceable into FRD or ADD" |
| Claude | WARNING | Optimization strategy, not hard requirement |

**Evidence**: BRD §3.1.4 line 170: *"Prompt caching for cost optimization"* listed under LLM Gateway business capabilities. Neither FRD §6 (LLM Gateway) nor ADD §7 (LLM Gateway) mention prompt caching.

**Verdict: WARNING (not ERROR).** Prompt caching is an optimization strategy listed among capabilities, not a numbered requirement. It's reasonable to implement this as part of provider abstraction without a dedicated FRD feature. However, traceability would be cleaner with a note.

**Resolution**: Add prompt caching as an optimization note under FR-CORE-LLM-003 (Cost Tracking) or ADD §7.1 (Provider Abstraction).

**Status**: RESOLVED — Prompt caching acceptance criterion added to FRD FR-CORE-LLM-003.

#### N1: Core Traceability Strong (positive finding)

Core components (Workflow, HITL, MCP, LLM, Notification, Audit, Identity) have clear BRD→FRD→ADD chains with explicit cross-references. All three models confirmed this.

---

## Concern 2: Requirement-Test Mapping

### Consensus Findings

The testing documentation (05b-Testing-Strategies.md) provides excellent test *patterns* — error path matrices, boundary condition matrices, authentication test examples — but lacks a formal Requirements Traceability Matrix (RTM) linking FR-CORE identifiers to specific test specifications.

#### E1: Systemic FR-CORE Test Traceability Gap

| Model | Severity | Notes |
|-------|----------|-------|
| Gemini | ERROR | "Lacks explicit RTM linking FR-CORE IDs to Test Specs" |
| Codex | ERROR | ">50% uncovered by traceability standard" |
| Claude | ERROR | Confirmed: zero FR-CORE IDs in test docs |

**Evidence**: FRD defines ~30 FR-CORE-* requirements across 10 service areas. The test strategy's traceability table (line 53) maps *categories* to FRD sections, not individual requirements:

```
| Requirement | Source | How Addressed |
|-------------|--------|---------------|
| Quality targets | FRD §5.2 | Coverage targets per architectural layer |
| Performance targets | FRD §6.1 | P95 < 500ms via k6 load tests |
```

No FR-CORE-XXX-NNN identifier appears anywhere in the test documentation. The §11 error path matrix and §12 boundary matrix reference ADD sections and API spec, not FRD requirements.

**Verdict: ERROR.** This triggers the schema's failure condition: *"More than 50% of testable requirements have no test specifications (systemic lack of test planning)."* The test patterns are strong but the requirement→test traceability chain is broken.

**Resolution**: Create a Requirements Traceability Matrix (RTM) — either as a new section in 05b-Testing-Strategies.md or as a standalone document — mapping each FR-CORE-* requirement to specific test cases with test type (unit/integration/e2e/acceptance).

**Status**: RESOLVED — Testing doc §13 RTM added with 31 FR-CORE requirements mapped to test types, specifications, and ADD references. Includes coverage summary and RTM maintenance guidelines.

#### W4: Stale FRD Section References in Test Doc

| Model | Severity | Notes |
|-------|----------|-------|
| Gemini | Not flagged | — |
| Codex | NOTE | "References stale FRD sections" |
| Claude | WARNING | "Stale cross-references actively mislead" |

**Evidence**: Test doc header (line 23): *"Aligned with: FRD v2.0.0."* But current FRD is v1.0.0 (restructured into service-by-service sections). Test doc references:
- "FRD §5.2" → Current FRD §5 = MCP Integration Layer (not quality targets)
- "FRD §6.1" → Current FRD §6 = LLM Gateway (not performance targets)

Quality/performance targets actually live in FRD §10 (Non-Functional Requirements).

**Verdict: WARNING.** Stale cross-references break traceability and confuse engineers trying to verify requirement coverage.

**Resolution**: Update test doc's traceability table and header to reference current FRD v1.0.0 section numbers.

**Status**: RESOLVED — Header updated from "FRD v2.0.0" to "FRD v1.0.0"; traceability table references corrected (§5.2→§10.1, §6.1→§10).

#### W5: MFA Test Spec Missing

| Model | Severity | Notes |
|-------|----------|-------|
| Gemini | Part of ERROR | "FR-CORE-ID-001 has no test spec" |
| Codex | ERROR | "MFA enforcement lacks corresponding test spec" |
| Claude | WARNING | Follows from the MFA scope debate (Contradiction C1) |

**Evidence**: FRD FR-CORE-ID-001 (line 399): *"MFA enforced for users with elevated permissions."* Testing doc §11.1 covers JWT validation and permission cache but has no MFA step-up test cases.

**Verdict: WARNING.** The MFA requirement itself is in dispute (see Contradiction C1 below). Writing test specs against an unresolved FRD/ADD contradiction would codify the wrong behavior. Resolve the contradiction first, then write tests.

**Status**: RESOLVED — E2 contradiction resolved (FRD now says "Phase 1: optional enrollment + step-up"); MFA step-up test cases added to §11.1 error path matrix (3 test cases: step-up required, enrolled user verification, bypass attempt).

#### W6: SLA Performance Targets Not in Test Spec

| Model | Severity | Notes |
|-------|----------|-------|
| Gemini | WARNING | "HITL <10s P95 not addressed in performance testing" |
| Codex | Not flagged directly | — |
| Claude | WARNING | Valid gap |

**Evidence**: BRD §5.1: *"HITL request delivery latency: <10s P95."* Test doc's performance section focuses on API latency (<500ms). No HITL-specific latency test defined.

**Verdict: WARNING.** BRD success metric without corresponding test verification.

**Resolution**: Add HITL delivery latency test specification to performance testing section.

**Status**: RESOLVED — HITL <10s P95 latency test added to §3.5 performance testing scope with measurement definition (signal emit → notification delivery confirmation).

---

## Concern 3: Contradiction Scanner

### Consensus Findings

Two genuine cross-document contradictions found, both following the same structural pattern: Tier 1/2 fixes updated the ADD but left the BRD/FRD unchanged.

#### E2: MFA Enforcement — FRD vs ADD

| Model | Severity | Notes |
|-------|----------|-------|
| Gemini | ERROR | "Direct conflict between FRD and ADD" |
| Codex | ERROR | "FRD enforced vs ADD optional" |
| Claude | ERROR | Verified with exact quotes |

**Statement A** — FRD FR-CORE-ID-001 (line 399):
> *"Multi-Factor Authentication (MFA) enforced for users with elevated permissions"*

**Statement B** — ADD §8.6 (line 1823):
> *"Phase 1 scope: MFA is **optional enrollment**, not mandatory. Step-up is required only for the operations listed above. Phase 2: Evaluate mandatory MFA for admin roles."*

**Conflict Type**: Behavioral/scope. The FRD says "enforced" with no qualification. The ADD says "optional" for Phase 1.

**History**: This was originally found in Tier 2 as S1-W2 and classified as "resolved (documentation)" — the ADD was updated to document the MFA step-up flow. However, the FRD was NOT updated to reflect the Phase 1 scope limitation. The "fix" was one-sided.

**Verdict: ERROR.** A developer reading the FRD would implement mandatory MFA. A developer reading the ADD would implement optional enrollment. This ambiguity in a security requirement is a hard block.

**Resolution**: Update FRD FR-CORE-ID-001 to add Phase 1 scoping: "Phase 1: MFA optional enrollment with step-up for sensitive operations. Phase 2: Mandatory MFA for admin roles." This aligns with ADD §8.6.

**Status**: RESOLVED — FRD FR-CORE-ID-001 updated: "Phase 1 — optional enrollment with step-up for sensitive operations (see ADD §8.6). Phase 2 — mandatory MFA for admin roles."

#### E3: Audit Integrity — BRD vs ADD (scope + numeric)

| Model | Severity | Notes |
|-------|----------|-------|
| Gemini | Not flagged | — |
| Codex | ERROR | Two layers: numeric (100% vs >99.9%) and definitional (tamper-proof vs completeness) |
| Claude | ERROR | Verified; same one-sided fix pattern as MFA |

**Statement A** — BRD §5.1 (line 250):
> *"Audit log integrity | 100% | Zero tampering incidents"*

**Statement B** — ADD §10.4.2 (line 2738):
> *"The Phase 1 audit system guarantees **completeness** [...] NOT **tamper-proofness**"*

**Statement C** — ADD §10.4.8 (line 2801):
> *"Audit integrity | >99.9% | audit_missing_events > 0 daily check"*

**Conflict Type**: Quantitative (100% → >99.9%) + definitional (tamper-proof → completeness).

**History**: Found in Tier 2 as S5-W2, resolved by adding ADD §10.4.2 to "clarify Phase 1 = completeness, not tamper-proof." Like MFA, the ADD was updated but the BRD was NOT. The BRD still promises "100% integrity" meaning "zero tampering incidents."

**Verdict: ERROR.** The BRD makes a stakeholder promise (100%, zero tampering) that the ADD explicitly says will not be met in Phase 1. The ADD's transparency is good, but the BRD must reflect reality.

**Resolution**: Update BRD §5.1 audit integrity row to: "Audit log completeness | >99.9% | Zero missing audit entries | Note: Tamper-proofness deferred to Phase 3+ (see ADD §10.4.2)."

**Status**: RESOLVED — BRD §5.1 audit row updated with corrected metric, target, and Phase 3+ deferral note.

#### N2: Audit Sync Test Behavior (not a contradiction)

| Model | Severity | Notes |
|-------|----------|-------|
| Gemini | WARNING | ADD treats sync as flaw; test doc treats delay as "expected behavior" |
| Codex | Not flagged | — |
| Claude | NOTE | Test doc correctly tests Phase 1 current behavior |

**Evidence**: ADD §2.3.2 describes sync audit as a risk. Testing doc §11.1 tests: *"Simulate slow audit insert (>500ms). Expected Behavior: Caller experiences delay."*

**Verdict: NOTE (not contradiction).** The test doc tests the *current* Phase 1 behavior, which IS synchronous. The async migration is tracked as T1-W21 → Sprint 4 (INT-05). Once implemented, the test should be updated to expect async behavior. This is not a document contradiction — it's a known Phase 1 limitation with a planned fix.

---

## Structural Pattern: One-Sided Fixes

Tier 3 reveals a systemic pattern from the Tier 1/2 resolution work:

| Finding | BRD updated? | FRD updated? | ADD updated? | Result |
|---------|-------------|-------------|-------------|--------|
| MFA enforcement scope | No | No | Yes (§8.6) | FRD/ADD contradiction |
| Audit integrity scope | No | N/A | Yes (§10.4.2) | BRD/ADD contradiction |
| File Storage justification | No | Yes (§8.5 implicit note) | Yes (§9.8) | Weak backward trace |
| Prompt caching | N/A | No | No | BRD orphan |

**Root cause**: Tier 1/2 concern validation focused on the ADD as the primary fix target (it's the most detailed doc). Fixes that required BRD or FRD updates were sometimes documented as clarifications in the ADD rather than propagated back to the source document. This creates exactly the kind of structural incoherence that Tier 3 is designed to detect.

**Recommendation**: After resolving the ERRORs below, add a "BRD/FRD Sync Check" pass — verify that every ADD section that references a Phase 1 scope limitation has a corresponding note in the BRD or FRD.

---

## Actionable Recommendations

| # | Severity | Finding | Action | File |
|---|----------|---------|--------|------|
| 1 | **ERROR** | No FR-CORE→test traceability | Create Requirements Traceability Matrix | 05b-Testing-Strategies.md |
| 2 | **ERROR** | MFA: FRD "enforced" vs ADD "optional" | Update FRD FR-CORE-ID-001 with Phase 1 scope | platform-core-frd.md |
| 3 | **ERROR** | Audit: BRD "100% tamper-proof" vs ADD ">99.9% completeness" | Update BRD §5.1 audit row | platform-core-brd.md |
| 4 | WARNING | File Storage not in BRD | Add to BRD §3.1 + build-vs-buy table | platform-core-brd.md |
| 5 | WARNING | MCP queryable not in Phase 1 API | Add Phase 1 scoping note to FRD FR-CORE-MCP-001 | platform-core-frd.md |
| 6 | WARNING | Prompt caching BRD orphan | Add note to FRD FR-CORE-LLM-003 or ADD §7.1 | platform-core-frd.md or ADD |
| 7 | WARNING | Stale FRD refs in test doc | Update traceability table to FRD v1.0.0 sections | 05b-Testing-Strategies.md |
| 8 | WARNING | MFA test spec missing | Write after resolving E2 | 05b-Testing-Strategies.md |
| 9 | WARNING | HITL P95 latency test missing | Add to performance testing section | 05b-Testing-Strategies.md |
| 10 | NOTE | Core traceability strong | No action needed | — |
| 11 | NOTE | Audit sync test = Phase 1 behavior | Update test after INT-05 async migration | 05b-Testing-Strategies.md |

---

## Sign-Off

| Model | Assessment |
|-------|------------|
| **Gemini** | VERIFIED — 3E/3W; identified MFA contradiction and File Storage orphan |
| **Codex** | VERIFIED — 7E/2W/3N; strongest on audit contradictions and test traceability; overcounted some WARNINGs as ERRORs |
| **Claude (Lead)** | VERIFIED — recalibrated severities; identified one-sided fix pattern as systemic root cause |

---

*Generated by multi-model consensus review. Models: Gemini (gemini-3-flash-preview via PAL clink), Codex (o3 via Codex MCP), Claude (opus-4-6 lead expert).*
