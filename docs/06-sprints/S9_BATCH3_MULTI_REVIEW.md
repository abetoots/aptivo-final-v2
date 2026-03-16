# Sprint 9 Batch 3 — Multi-Model Review

**Date**: 2026-03-15
**Reviewers**: Claude Opus 4.6 (Lead), Gemini 3 Flash Preview (via PAL clink), Codex/GPT (via Codex MCP)
**Scope**: ID2-04 (WebAuthn), ID2-09 (Secret Rotation Doc), ID2-10 (Event Schema Policy)
**Verdict**: 0 P1 fixes, 2 P2 fixes, 4 accepted risks (by design). Docs praised unanimously.

---

## Executive Summary

Both external models flagged the WebAuthn implementation as "critical" due to missing cryptographic verification, challenge management, and persistent storage. Claude (lead) classifies these as **accepted risks by design** — the sprint plan explicitly documents WebAuthn as progressive enhancement with TOTP fallback, and the service is structural scaffolding for `@simplewebauthn/server` integration. The code comments explicitly state "in production, would verify attestation via @simplewebauthn/server." Two P2 fixes are warranted: user-credential binding on auth verify, and counter type validation. Documentation tasks (ID2-09, ID2-10) received unanimous praise.

---

## Consensus Findings

### C-1: WebAuthn Lacks Cryptographic Verification [ACCEPTED RISK]

**Files**: `webauthn-service.ts:133` (verifyRegistration), `webauthn-service.ts:213` (verifyAuthentication)
**Finding**: No attestation verification on registration, no assertion/signature verification on authentication. Challenges are generated but not stored or verified server-side.

**All models agree** this is a gap. Claude disagrees on severity:

**Verdict — ACCEPTED RISK (by design)**:
- Sprint plan §3 Q3: "Use `@simplewebauthn/server` for server-side WebAuthn operations"
- Sprint plan §6 Risk: "Supabase WebAuthn not available on current plan — High likelihood, Medium impact — TOTP fallback always available"
- Code comment at line 133: "in production, would verify attestation via @simplewebauthn/server / for now, store the credential directly"
- WebAuthn is **progressive enhancement** over TOTP (which is the primary MFA factor)
- No production deployment without the `@simplewebauthn/server` integration (gated by Sprint 10)

### C-2: In-Memory Credential Store [ACCEPTED RISK]

**Files**: `services.ts` (getWebAuthnService uses `createInMemoryWebAuthnStore`)
**Finding**: Credentials lost on restart. No Drizzle adapter despite schema existing.

**Verdict — ACCEPTED RISK (project pattern)**:
- Identical to: `InMemoryStorageAdapter` (S3), `InMemoryTransportAdapter` (MCP), `InMemoryRateLimitStore`, `InMemoryCacheStore`
- Schema is defined (`webauthnCredentials` table) — Drizzle adapter is Sprint 10 work
- Composition root will env-gate the real adapter when implemented

### C-3: Documentation Quality [POSITIVE]

**All models agree**: ID2-09 (§8.11 Secret Rotation) and ID2-10 (§12.5 Event Schema Policy) are comprehensive and complete.

---

## Debated Items

### D-1: No User-Credential Binding on Auth Verify

| Model | Position |
|-------|----------|
| **Codex** | High — credential lookup is global, no userId check |
| **Claude** | P2 — valid, should verify credential.userId === authenticated userId |
| **Gemini** | Not raised separately |

**Verdict — P2 FIX**: Add userId ownership check in `verifyAuthentication` and the authenticate/verify route.

### D-2: Counter Type Validation

| Model | Position |
|-------|----------|
| **Codex** | Medium — NaN/negative/string counters bypass replay protection |
| **Claude** | Valid — add Zod validation on route input |
| **Gemini** | Not raised separately |

**Verdict — P2 FIX**: Add `z.number().int().nonneg()` validation for counter in verify routes.

### D-3: Runbook Secret Naming Inconsistency

| Model | Position |
|-------|----------|
| **Codex** | `HITL_SECRET` vs `HITL_SIGNING_SECRET` naming mismatch |
| **Claude** | Valid doc fix |
| **Gemini** | Not raised |

**Verdict — P2 FIX**: Standardize to `HITL_SIGNING_SECRET` in Runbook §9.3.1.

### D-4: WebAuthn → MFA AAL Upgrade

| Model | Position |
|-------|----------|
| **Gemini** | WebAuthn auth should upgrade session to aal2 |
| **Claude** | Correct — covered by ID2-11 integration tests |
| **Codex** | Not raised |

**Verdict — DEFERRED to ID2-11**: Integration tests will validate the full pipeline including AAL upgrade.

---

## Actionable Recommendations

### P2 — Fix During Sprint 9

| # | Finding | Action | Files |
|---|---------|--------|-------|
| 1 | D-1 | Add userId ownership check in verifyAuthentication | `webauthn-service.ts`, authenticate/verify route |
| 2 | D-2 | Add counter type validation (int, non-negative) | register/verify + authenticate/verify routes |
| 3 | D-3 | Standardize HITL secret name in runbook | `01-runbook.md` |

### Accepted Risks

| # | Finding | Rationale |
|---|---------|-----------|
| 4 | C-1 (no crypto verification) | Sprint plan Q3; progressive enhancement over TOTP; code comments explicit |
| 5 | C-2 (in-memory store) | Project pattern; schema exists; Drizzle adapter in Sprint 10 |
| 6 | D-4 (AAL upgrade) | Deferred to ID2-11 integration |

---

## Positive Practices Noted

- **Documentation excellence** — Both doc tasks received unanimous praise from all models
- **Schema-first approach** — `webauthnCredentials` table defined before adapter, enabling future wiring
- **Counter replay protection** — Logic is correct even without full WebAuthn verification
- **Consistent auth gating** — All WebAuthn routes call `extractUser()` (learned from Batch 2 C-2 fix)
