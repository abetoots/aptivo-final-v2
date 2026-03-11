# SP-14: Event Authenticity & Anti-Replay Result

**Date**: 2026-03-05
**Owner**: Senior Engineer
**Status**: Pass
**Security-Critical**: Yes -- Hard Gate (Phase 1 blocked on failure)

## Summary

HMAC-SHA256 event signing, timestamp-based freshness checks, nonce-based anti-replay, and context binding all implemented and validated with 18 tests. Forged events, replayed events, expired events, and cross-context injection all correctly rejected. Concurrent approval race validated: exactly 1 of 10 identical submissions succeeds.

## Validation Steps Completed

- [x] Implement signed event ingress with HMAC-SHA256
- [x] Enforce signature verification with timing-safe comparison
- [x] Implement timestamp + nonce for anti-replay
- [x] Bind events to request/workflow context (payload-level)
- [x] Test replay attempts (same nonce rejected)
- [x] Test forged events (invalid signature, mismatched context)
- [x] Test expired events (timestamp > maxAge)
- [x] Test concurrent approval race (S7-W10)
- [x] Test invalid HMAC rejection with reason (S7-W11)
- [x] Validate rejection reasons for audit logging

## Measurements

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Unsigned/invalid events rejected | 100% | 100% -- all invalid events return Result.err | Pass |
| Replay prevention | Same nonce rejected | Nonce tracked in Set; replay returns 'replayed-nonce' | Pass |
| Timestamp enforcement | Expired events rejected | Events older than maxAge rejected with 'expired-timestamp' | Pass |
| Context binding | Cross-workflow rejected | Payload modification breaks signature verification | Pass |
| Concurrent race | First-writer-wins | 1/10 succeeds, 9/10 rejected as replayed-nonce | Pass |

## Evidence

- Event signer: `packages/hitl-gateway/src/events/event-signer.ts`
- Event types: `packages/hitl-gateway/src/events/event-types.ts`
- Tests: `packages/hitl-gateway/tests/sp-14-event-authenticity.test.ts` (18 tests)

## Findings

### 1. Event Signing Design

Signed event envelope format:
```typescript
interface SignedEvent<T> {
  payload: T;         // the event data (includes requestId, workflowId, decidedBy)
  signature: string;  // HMAC-SHA256 hex digest
  timestamp: string;  // ISO-8601 when event was signed
  nonce: string;      // UUID v4, unique per event
}
```

The HMAC covers `JSON.stringify({ payload, timestamp, nonce })`, meaning any modification to any field invalidates the signature.

### 2. Context Binding via Payload

Rather than separate context fields, the payload itself contains the binding context (requestId, workflowId, channel, decidedBy). Since the signature covers the entire payload, modifying any context field breaks the signature. This is simpler and more extensible than separate signed headers.

### 3. Anti-Replay: In-Memory Nonce Store

For the spike, nonces are tracked in an in-memory `Set<string>`. Production requires:
- Redis-based nonce store with TTL matching maxAge
- TTL auto-cleanup prevents unbounded growth
- Atomic check-and-set (SETNX) for concurrent safety

### 4. Rejection Reasons for Audit Logging

All failures return structured rejection reasons:
- `invalid-signature` -- HMAC mismatch (forged or tampered)
- `expired-timestamp` -- event too old
- `replayed-nonce` -- nonce already consumed
- `malformed-event` -- missing required fields

These can be directly logged for security audit trails.

### 5. Concurrent Race Resolution (S7-W10)

When 10 identical signed events are submitted concurrently, exactly 1 succeeds (nonce consumed on first check). The remaining 9 get `replayed-nonce` rejection. This validates the first-writer-wins pattern from the spec.

In production with Redis SETNX, this becomes truly atomic even across multiple worker processes.

### 6. Timing-Safe Signature Comparison

Uses `crypto.timingSafeEqual` for HMAC comparison, preventing timing attacks that could leak signature bytes.

## Decision

**Pass** -- All security mitigations implemented with 18 passing tests. Hard gate criteria met:
- All external events require valid HMAC signature + fresh timestamp
- Replay blocked via nonce tracking (first-writer-wins)
- Events bound to request/workflow context via signed payload
- Rejected events include structured reason for audit logging

## WARNINGs Validated

| WARNING | Finding | Result | Closed? |
|---------|---------|--------|---------|
| S7-W10 | HITL decision race condition | 10 concurrent submissions: exactly 1 succeeds, 9 rejected as replayed-nonce. First-writer-wins pattern validated. | Yes |
| S7-W11 | Webhook signature verification | Invalid HMAC returns `invalid-signature` reason; expired timestamp returns `expired-timestamp`; valid signature + fresh timestamp returns payload. | Yes |

## Follow-up Actions

- [ ] Replace in-memory nonce Set with Redis SETNX + TTL for production
- [ ] Security review by second engineer
- [ ] Define signing key rotation strategy
- [ ] Integrate event verification into Inngest event ingress middleware
