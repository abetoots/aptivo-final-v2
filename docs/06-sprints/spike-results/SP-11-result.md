# SP-11: HITL JWT Token Security Result

**Date**: 2026-03-05
**Owner**: Senior Engineer
**Status**: Pass
**Security-Critical**: Yes -- Hard Gate (Phase 1 blocked on failure)

## Summary

JWT HS256 token security for HITL approvals fully implemented with 21 tests. JTI-based replay prevention, SHA-256 token hash storage (never raw), audience/issuer claim binding, channel binding, expiry enforcement (15 min default, 1 hr cap), and dual-key rotation all validated. Expired, tampered, replayed, and mismatched tokens all correctly rejected with structured rejection reasons.

## Validation Steps Completed

- [x] Implement JWT generation with JTI (UUID v4) for unique identification
- [x] Implement HS256 signing with jose library
- [x] Implement audience (`aud`) and issuer (`iss`) claim binding
- [x] Implement channel binding (email, slack, web)
- [x] Implement SHA-256 token hash for DB storage (never store raw)
- [x] Implement key rotation (dual-key validation period)
- [x] Test replay prevention (same JTI rejected on reuse)
- [x] Test expiry enforcement (1s TTL token expires)
- [x] Test tampered token rejection (corrupted payload)
- [x] Test wrong-key rejection (signature validation)
- [x] Test audience/issuer mismatch rejection

## Measurements

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Replay blocked | JTI reuse rejected 100% | Second use returns 'replayed-jti' | Pass |
| Hash storage | Raw token never persisted | SHA-256 hex hash (64 chars) stored | Pass |
| Key rotation | Dual-key overlap works | Old-key tokens verified when [new, old] provided | Pass |
| Expiry enforcement | Expired tokens rejected | 1s TTL token rejected after 1.1s with 'expired' | Pass |
| Audience binding | Wrong audience rejected | Returns 'invalid-audience' | Pass |
| Issuer binding | Wrong issuer rejected | Returns 'invalid-issuer' | Pass |
| Tampered tokens | Signature check fails | Returns 'invalid-signature' | Pass |

## Evidence

- Implementation: `packages/hitl-gateway/src/tokens/jwt-manager.ts`
- Types: `packages/hitl-gateway/src/tokens/token-types.ts`
- Tests: `packages/hitl-gateway/tests/sp-11-token-security.test.ts` (21 tests)
- JWT library: `jose` v6.1.3

## Findings

### 1. Token Structure

Each HITL approval token contains:
- `requestId` — binds to specific approval request
- `action` — the action being authorised (approve/reject)
- `channel` — delivery channel (email, slack, web)
- `jti` — UUID v4, unique per token
- `aud` — audience claim (e.g. 'hitl-approval')
- `iss` — issuer (e.g. 'aptivo-hitl-gateway')
- `iat` / `exp` — issued-at and expiry timestamps

The signature covers all claims, so modifying any field invalidates the token.

### 2. Token Hash Storage

`hashToken()` produces SHA-256 hex digests. The database stores `tokenHash` (64-char hex), never the raw JWT. If the database leaks, attackers cannot reconstruct valid tokens from hashes.

### 3. JTI Replay Prevention

On first verification, the JTI is added to a consumed set. Subsequent verifications with the same JTI return `replayed-jti`. For the spike, this is an in-memory `Set<string>`. Production requires:
- Redis SETNX with TTL matching token max age
- Or DB insert with unique constraint on JTI column

### 4. Key Rotation Design

`verifyHitlToken()` accepts `string | string[]` for secrets. During rotation:
1. Generate new tokens with new key
2. Verify with `[newKey, oldKey]` — tries each in order
3. Old-key tokens still verify until they expire
4. After max TTL (1 hr), remove old key from verification list

This provides zero-downtime key rotation with a bounded overlap window.

### 5. Claim Validation (jose Library)

The `jose` library handles:
- Expiry checking (`exp` claim vs current time)
- Audience validation (`aud` must match expected value)
- Issuer validation (`iss` must match expected value)
- Algorithm restriction (only HS256 accepted)
- Signature verification

Each failure type maps to a structured rejection reason for audit logging.

### 6. TTL Hard Cap

Token TTL is capped at 3600s (1 hour) regardless of input. Default is 900s (15 minutes). This limits the window of vulnerability if a token is intercepted.

## Decision

**Pass** -- All security mitigations implemented with 21 passing tests. Hard gate criteria met:
- Tokens are single-use via JTI-based replay prevention
- Expired tokens rejected
- Mismatched tokens rejected (audience, issuer, signature)
- DB stores token hash, never raw token
- Key rotation supported via dual-key verification
- Channel binding included in signed claims

## WARNINGs Validated

_Security-critical spike -- creates HITL token security baseline._

## Follow-up Actions

- [ ] Replace in-memory JTI Set with Redis SETNX + TTL for production
- [ ] Add JTI column with unique constraint to approvals table
- [ ] Security review by second engineer
- [ ] Define key rotation schedule and automation
- [ ] Add rate limiting on token verification endpoint
- [ ] Integrate token verification into Inngest HITL event handler
