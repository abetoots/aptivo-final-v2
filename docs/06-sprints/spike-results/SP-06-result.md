# SP-06: MCP Server Security & Sandboxing Result

**Date**: 2026-03-05
**Owner**: Senior Engineer
**Status**: Pass
**Security-Critical**: Yes -- Hard Gate (Phase 1 blocked on failure)

## Summary

All three security mitigations implemented and validated with 28 tests: environment sanitization (blocked-pattern allowlist), server command allowlist enforcement, and HMAC-SHA256 scoped tokens with TTL. No secrets leak to child processes; unlisted servers are rejected; tokens expire and bind to specific servers.

## Validation Steps Completed

- [x] Implement environment variable sanitization (block secrets, allowlist safe vars)
- [x] Implement server/command allowlist enforcement
- [x] Implement scoped token generation with TTL, server binding, permissions
- [x] Implement scoped token verification with timing-safe comparison
- [x] Test: blocked env vars never reach MCP process (10 tests)
- [x] Test: unlisted servers/commands rejected (7 tests)
- [x] Test: scoped tokens expire and scope-limit correctly (11 tests)

## Measurements

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Env sanitization | 0 secrets leaked | 0 -- all 15+ blocked patterns enforced | Pass |
| Allowlist enforcement | 100% unlisted rejected | 100% -- name, command, args all validated | Pass |
| Token scoping | Permissions enforced, TTL < 1hr | HMAC-SHA256 signed, 1hr hard cap, server-bound | Pass |
| Token expiry | Expired tokens rejected | Rejected with timing-safe comparison | Pass |

## Evidence

- Env sanitizer: `packages/mcp-layer/src/security/env-sanitizer.ts`
- Allowlist: `packages/mcp-layer/src/security/allowlist.ts`
- Scoped tokens: `packages/mcp-layer/src/security/scoped-tokens.ts`
- Tests: `packages/mcp-layer/tests/sp-06-mcp-security.test.ts` (28 tests)

## Findings

### 1. Environment Sanitization — Blocked Patterns Override Allowlist

The sanitizer uses a deny-first approach: any env var matching a blocked pattern (DATABASE_, REDIS_, SECRET, PASSWORD, TOKEN, KEY, etc.) is always stripped, even if explicitly listed in the allowlist. This prevents accidental secret exposure through misconfiguration.

Safe system vars (NODE_ENV, PATH, HOME, LANG, TZ) are always included. Everything else requires explicit opt-in via the allowlist.

### 2. Server Allowlist — Exact Match Enforcement

The allowlist validates three properties exactly:
- **name**: server identifier must match
- **command**: executable must match (prevents `node` vs `npx` swaps)
- **args**: if the allowlist entry specifies args, they must match in order and count

This prevents argument injection attacks (e.g., appending `--admin` to allowed args).

### 3. Scoped Tokens — HMAC-SHA256 with TTL Hard Cap

Token design:
- Format: `base64url(payload).base64url(hmac-sha256-signature)`
- Payload contains: `serverId`, `permissions[]`, `issuedAt`, `expiresAt`
- TTL hard-capped at 3600 seconds (1 hour) — enforced at generation time
- Signing key minimum length: 32 characters
- Verification uses `crypto.timingSafeEqual` to prevent timing attacks
- No external JWT dependencies — uses Node.js `crypto` module only

### 4. Threat Model Summary

| Threat | Mitigation | Status |
|--------|-----------|--------|
| Secret exfiltration via env vars | Blocked-pattern deny list + explicit allowlist | Implemented |
| Unauthorized MCP server execution | Command + args allowlist validation | Implemented |
| Over-privileged access | Scoped tokens with permissions + server binding | Implemented |
| Token replay after expiry | TTL enforcement at verification time | Implemented |
| Timing attack on signature | `crypto.timingSafeEqual` for comparison | Implemented |
| Key compromise | Minimum key length (32 chars), short TTL (max 1hr) | Enforced |

### 5. Isolation Boundary — Documented Rationale

For the spike, process-level isolation (separate child process via stdio) is the chosen boundary. This provides:
- Separate memory space (no shared heap)
- Sanitized environment (only allowlisted vars)
- Process-level resource limits (can be cgroup-constrained in production)

Container-level isolation (Docker) adds filesystem and network isolation but increases cold-start latency. Recommended for production deployment of untrusted third-party MCP servers. The stdio transport (SP-05) already validated that process spawning adds only ~160ms overhead.

### 6. Network Egress Controls — Defined

For production, MCP server processes should run with:
- **iptables/nftables rules** or **container network policies** restricting egress
- Allowlisted destinations only (the specific APIs each server needs)
- DNS resolution restricted to internal resolver

This is a deployment-time control, not implemented in application code. Documented here as the chosen approach for Sprint 1 infrastructure setup.

## Decision

**Pass** -- All three security mitigations implemented with concrete code and 28 passing tests. Threat model documented with mitigations. Hard gate criteria met:
- Env sanitization: child processes receive ONLY required secrets
- Least-privilege: scoped tokens with enforced <1hr TTL
- Allow-list mechanism functional and enforced
- Isolation boundary chosen (process-level) with documented rationale
- Network egress controls defined (deployment-time iptables/container policies)

## WARNINGs Validated

Security-critical spike -- no pre-existing WARNINGs. Creates new security baseline for MCP subsystem.

## Follow-up Actions

- [ ] Security review of implemented mitigations by second engineer
- [ ] Document MCP security policy for Sprint 1 developer onboarding
- [ ] Implement container-level isolation for untrusted MCP servers in infrastructure
- [ ] Define network egress allowlists per MCP server type
- [ ] Add signing key rotation mechanism for scoped tokens
