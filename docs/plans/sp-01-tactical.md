# SP-01: Inngest + AgentKit Integration - Tactical Plan

> **For Claude:** Use executing-plans or subagent-driven-development to implement this plan task-by-task.

**Goal:** Validate Inngest function definition, step execution, error handling, timeout behavior, and saga compensation patterns against the Inngest dev server.
**Architecture:** Inngest client with typed event schemas, functions using `step.run()` for checkpointed execution, `NonRetriableError` for circuit-breaker-safe failures, and compensation-step pattern for saga rollback.
**Tech Stack:** Inngest v3.52, @inngest/test, Vitest, Zod v4

---

### Task 1: Install @inngest/test and Create Inngest Client

**Status**: Pending

**Files:**
- Modify: `apps/spike-runner/package.json` (add @inngest/test)
- Create: `apps/spike-runner/src/inngest-client.ts`
- Test: `apps/spike-runner/tests/sp-01-inngest-agentkit.test.ts`

**What:** Create shared Inngest client with typed event schemas for spike validation. Install @inngest/test for unit-level function testing.

**Success:** Client instantiates, event schemas type-check, @inngest/test available.

---

### Task 2: Implement Function Definition and Registration

**Status**: Pending

**Files:**
- Modify: `apps/spike-runner/src/sp-01-inngest-agentkit.ts`
- Modify: `apps/spike-runner/tests/sp-01-inngest-agentkit.test.ts`

**What:** Define an Inngest function with multiple `step.run()` calls. Validate via InngestTestEngine that function definition is correct and steps execute in order.

**Validates:** Function definition and registration, Step execution and checkpointing

---

### Task 3: Implement Error Handling and Retry Behavior

**Status**: Pending

**Files:**
- Modify: `apps/spike-runner/src/sp-01-inngest-agentkit.ts`
- Modify: `apps/spike-runner/tests/sp-01-inngest-agentkit.test.ts`

**What:** Test that thrown errors in steps trigger retries, `NonRetriableError` skips retries, and errors propagate to the function result. Mock step handlers to throw both retriable and non-retriable errors.

**Validates:** Error handling and retry behavior

---

### Task 4: Implement Complex Schema Support

**Status**: Pending

**Files:**
- Modify: `apps/spike-runner/src/sp-01-inngest-agentkit.ts`
- Modify: `apps/spike-runner/tests/sp-01-inngest-agentkit.test.ts`

**What:** Define Zod schemas for complex event data (nested objects, arrays, enums). Validate that Inngest functions receive correctly-typed event data and step outputs.

**Validates:** Complex schema support, AgentKit tool integration (simulated MCP tool call with complex input/output)

---

### Task 5: Implement Timeout Behavior

**Status**: Pending

**Files:**
- Modify: `apps/spike-runner/src/sp-01-inngest-agentkit.ts`
- Modify: `apps/spike-runner/tests/sp-01-inngest-agentkit.test.ts`

**What:** Define a function with step-level timeout. Verify that slow steps time out correctly and the error type is identifiable.

**Validates:** Timeout behavior

---

### Task 6: Implement Saga Compensation Recovery (S7-W9)

**Status**: Pending

**Files:**
- Modify: `apps/spike-runner/src/sp-01-inngest-agentkit.ts`
- Modify: `apps/spike-runner/tests/sp-01-inngest-agentkit.test.ts`

**What:** Implement a multi-step saga where later steps can fail. On failure, execute compensation steps to undo prior side-effects. Validate that compensation runs, partial-progress rolls back, and crash-during-compensation recovers cleanly.

**Validates:** Saga compensation recovery, WARNING S7-W9

---

### Task 7: Wire Inngest Serve Endpoint and Integration Smoke Test

**Status**: Pending

**Files:**
- Modify: `apps/web/src/app/api/inngest/route.ts`
- Modify: `apps/web/src/lib/env.ts`

**What:** Wire the Inngest serve endpoint with the spike functions. Verify the web app registers with the Inngest dev server at localhost:8288.

**Validates:** End-to-end registration with Inngest dev server

---

## Dependency Order

```
Task 1 (client + deps)
  ├──> Task 2 (function def)
  │      ├──> Task 3 (errors)
  │      ├──> Task 4 (schemas)
  │      ├──> Task 5 (timeouts)
  │      └──> Task 6 (saga compensation)
  └──> Task 7 (serve endpoint, can start after Task 1, finalized after Task 6)
```

## Test Commands

```bash
# unit tests (no server needed)
pnpm --filter @aptivo/spike-runner test

# typecheck
pnpm --filter @aptivo/spike-runner typecheck

# integration smoke (needs docker compose up)
curl http://localhost:8288/health
```
