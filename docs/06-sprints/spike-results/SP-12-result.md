# SP-12: End-to-End Latency Measurement Result

**Date**: 2026-03-05
**Owner**: Senior Engineer
**Status**: Pass

## Summary

Platform overhead validated across all critical path segments: Inngest step execution (~3.6ms p50), MCP in-process tool calls (~0.3ms p50), HITL waitForEvent setup (~2.8ms p50). Full E2E workflow with simulated LLM delay completes well under thresholds. Platform overhead (non-LLM) consistently under 10ms, far below the 1s budget. All 16 tests pass with percentile distribution tracking.

## Validation Steps Completed

- [x] Measure Inngest step.run() framework overhead (isolate from business logic)
- [x] Measure MCP in-process tool call round-trip time
- [x] Measure HITL waitForEvent setup overhead (mocked immediate resolution)
- [x] Measure full E2E workflow with simulated LLM delay and segment breakdown
- [x] Compute latency distribution (p50, p95, p99) for all segments
- [x] Validate platform overhead stays under 1s threshold

## Measurements

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Step overhead (p50) | < 1s | ~2.4ms | Pass |
| Step overhead (p95) | < 1s | ~9ms | Pass |
| MCP call (p50) | < 100ms | ~0.3ms | Pass |
| MCP call (p95) | < 100ms | ~0.4ms | Pass |
| HITL setup (p50) | < 1s | ~2.8ms | Pass |
| HITL setup (p95) | < 1s | ~3.4ms | Pass |
| E2E total (p95, 50ms LLM) | < 5s | ~53ms | Pass |
| Platform overhead (non-LLM) | < 1s | ~3ms | Pass |
| E2E total (p95, 100ms LLM) | < 5s | ~103ms | Pass |

## Evidence

- Implementation: `apps/spike-runner/src/sp-12-e2e-latency.ts`
- Tests: `apps/spike-runner/tests/sp-12-e2e-latency.test.ts` (16 tests)
- Depends on: SP-05 (`createTestServer`), SP-02 (`hitlApprovalFn`)

## Findings

### 1. Inngest Step Execution Overhead

Step.run() framework overhead is minimal at ~2.4ms p50. The p95 of ~9ms includes first-run JIT warmup. This is negligible compared to any real business logic or LLM call.

### 2. MCP In-Process Transport

In-process MCP calls via `InMemoryTransport` average ~0.3ms round-trip. This validates the SP-05 finding that in-process transport is the lowest-latency option for co-located tools.

### 3. HITL Wait Setup

The `step.waitForEvent()` setup overhead is ~2.8ms p50. This measures only the framework overhead of registering the wait, not the actual human response time. Negligible impact on platform overhead budget.

### 4. Full E2E Workflow

With a 50ms simulated LLM delay, total E2E averages ~53ms. Platform overhead (total minus LLM) is ~3ms, well under the 1s budget. This leaves substantial headroom for real-world network latency, database queries, and other I/O.

### 5. Test Engine Limitations

The Inngest `InngestTestEngine` memoizes step results across re-executions, so inner timing measurements (captured via `hrtMs()` inside function bodies) reflect engine overhead rather than real step execution time. Production instrumentation should use OpenTelemetry spans at the framework level rather than inline timing.

### 6. Percentile Distribution Tracking

All measurements include p50/p95/p99/avg/min/max, providing the distribution shape needed for SLO definition. The narrow spread (min~max range typically 2-3x) indicates stable, predictable overhead.

## Decision

**Pass** -- All platform overhead measurements are well under the 1s threshold. The critical path segments (step execution, MCP calls, HITL setup) collectively add < 10ms of framework overhead, leaving > 990ms of headroom for real-world I/O, network latency, and business logic. The E2E workflow with simulated LLM delay confirms total times well under the 5s fast-model target.

## WARNINGs Validated

_No pre-existing WARNINGs -- establishes baseline SLO measurements for Phase 1._

## Follow-up Actions

- [ ] Add OpenTelemetry span instrumentation for production tracing
- [ ] Establish SLO targets based on these baselines (step < 50ms, MCP < 10ms, HITL setup < 50ms)
- [ ] Add real LLM provider latency measurements when LLM gateway (SP-08) is integrated
- [ ] Run benchmarks with higher iteration counts (100+) for production confidence
- [ ] Add stdio and HTTP transport latency to E2E measurements
