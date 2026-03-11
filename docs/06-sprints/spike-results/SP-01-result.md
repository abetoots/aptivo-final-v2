# SP-01: Inngest + AgentKit Integration Result

**Date**: 2026-03-05
**Owner**: Senior Engineer
**Status**: Conditional Pass

## Summary

Inngest v3.52 function definition, step execution, error handling, schema validation, and saga compensation all validated via `@inngest/test` (16 tests). Three Zod/Turbopack compatibility workarounds documented; saga compensation requires return-value-based flow control instead of exception-based patterns.

## Validation Steps Completed

- [x] Define Inngest function with typed event schema
- [x] Execute multi-step workflow with `step.run()` checkpointing
- [x] Verify error handling and retry behavior (`NonRetriableError` prevents retries)
- [x] Integrate AgentKit-style tool call within Inngest step (simulated MCP)
- [x] Test complex Zod schema validation for event payloads
- [x] Verify timeout behavior at step level
- [x] Test saga compensation recovery on mid-workflow failure
- [x] Wire Inngest serve endpoint and verify registration with dev server (4 functions)

## Measurements

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Function registration | Compiles + serves | 4 functions registered via `/api/inngest` | Pass |
| Step checkpoint recovery | Resume after crash | Memoized steps not re-executed on replay | Pass |
| Retry behavior | Retriable vs non-retriable | `NonRetriableError` propagates correctly | Pass |
| Schema validation | Complex nested Zod schemas | Zod v3 compat required; v4 causes `_zod` error | Conditional |
| Saga compensation | All prior steps compensated in reverse | Return-value-based flow works; try/catch does not | Conditional |
| Test execution | All tests pass | 16/16 pass in 78ms | Pass |

## Evidence

- Source: `apps/spike-runner/src/sp-01-inngest-agentkit.ts`
- Client: `apps/spike-runner/src/inngest-client.ts`
- Tests: `apps/spike-runner/tests/sp-01-inngest-agentkit.test.ts` (16 tests)
- Serve endpoint: `apps/web/src/lib/inngest.ts` + `apps/web/src/app/api/inngest/route.ts`
- Inngest dev server: GraphQL query confirmed 4 functions under `aptivo-spike-runner` app

## Findings

### 1. Zod v4 + Inngest Incompatibility

Inngest v3.52 internally imports `z from "zod/v3"`. Using the default Zod v4 API (`import { z } from 'zod'`) causes runtime `TypeError: Cannot read properties of undefined (reading '_zod')` inside `safeParse()`.

**Workaround**: Import from `zod/v3` for all Inngest-consumed schemas. This uses the v3-compatible API from the same `zod@4.x` package.

### 2. Saga Compensation: Return-Value Flow Required

Inngest re-executes the function body for each step (memoization model). In-memory state (arrays, objects) does **not** persist across step boundaries. `try/catch` around `step.run()` does **not** work reliably because the test engine (and Inngest executor) treats step failures as execution-level events, not catchable exceptions.

**Pattern**: Steps return `{ status: 'done' }` or `{ status: 'failed', error: '...' }`. Check `outcome.status` after each step. Run compensation steps if any forward step returns `failed`.

### 3. @inngest/test Caveats

- **Fresh engine per test required**: `InngestTestEngine` has a `MockHandlerCache` that persists across `execute()` calls. Reusing an engine across tests causes cache contamination and false results.
- **Error wrapping**: The test engine wraps thrown errors, losing class identity. `instanceof NonRetriableError` fails; check `.message` instead.
- **`executeStep()` return shape**: Returns `{ step, result, error }` where `step` has `displayName`, not nested under `result`.

### 4. Turbopack Cannot Resolve .js to .ts

Turbopack (Next.js 16 default bundler) does not support `extensionAlias` (`.js` -> `.ts` resolution). Webpack does via `config.resolve.extensionAlias`. For dev mode, Inngest functions must live in the web app's own `src/lib/` rather than importing from workspace packages that use `.js` extensions in TypeScript source.

### 5. Docker Compose + Inngest Dev Server Networking

The Inngest container uses `host.docker.internal` to reach the host, but the SDK registers with `localhost:3000` by default. For full E2E from container, set `INNGEST_SERVE_ORIGIN=http://host.docker.internal:3000`.

## Decision

**Conditional Pass** — Proceed with Inngest as workflow engine. Three workarounds are documented and manageable:

1. Use `zod/v3` import for Inngest schemas (one-line change)
2. Use return-value saga pattern (documented, tested)
3. Keep Inngest functions in web app's `src/lib/` for Turbopack compat

None of these are blockers. The saga finding (2) is actually the more robust pattern regardless.

## WARNINGs Validated

| WARNING | Finding | Result | Closed? |
|---------|---------|--------|---------|
| S7-W9 | Saga compensation path | Return-value-based compensation works: forward steps return status, compensation runs in reverse for all completed steps. Crash-during-compensation propagates error correctly. 4 saga tests pass. | Yes |

## Follow-up Actions

- [x] Document Inngest function patterns for Sprint 1
- [x] Establish error handling conventions (NonRetriableError for permanent failures)
- [ ] Add `INNGEST_SERVE_ORIGIN` to `.env.example` for full E2E dev flow
- [ ] Monitor Zod v4 + Inngest compat — may be fixed in future Inngest releases
