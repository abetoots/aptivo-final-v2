# SP-05: MCP stdio Transport Performance Result

**Date**: 2026-03-05
**Owner**: Senior Engineer
**Status**: Pass

## Summary

All three MCP transport modes (stdio, in-process/bundled local, HTTP/StreamableHttp) validated with 16 tests. Every mode exceeds its success criteria by wide margins. In-process transport is the clear winner for performance; stdio has acceptable cold start (~160ms) with excellent warm performance; HTTP adds modest overhead but enables service separation.

## Validation Steps Completed

- [x] Benchmark three execution modes: stdio, bundled local (in-process), HTTP (StreamableHttp)
- [x] Measure cold-start latency for each mode
- [x] Measure warm-start latency with connection reuse
- [x] Test with 3+ concurrent MCP calls
- [x] Monitor memory usage over 100+ sequential calls
- [x] Test server lifecycle management (start/stop)
- [x] Test tool discovery and capability listing
- [x] Test tool invocation and response parsing
- [x] Test error handling (unknown tools, server close)
- [x] Test connection timeout / abort behavior

## Measurements

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| In-process cold start | < 500ms | ~1.5ms | Pass |
| In-process warm start | < 100ms | ~0.2ms | Pass |
| stdio cold start | < 2,000ms | ~160ms | Pass |
| stdio warm start | < 200ms | ~0.5ms | Pass |
| HTTP cold start | < 100ms | ~45ms | Pass |
| HTTP warm start | < 50ms | ~2.3ms | Pass |
| 3x concurrent (in-process) | -- | ~0.4ms | Pass |
| 3x concurrent (stdio) | -- | ~1.0ms | Pass |
| 3x concurrent (HTTP) | -- | ~6.0ms | Pass |
| Memory drift (in-process, 100 calls) | < 50% | ~19% | Pass |
| Memory drift (stdio, 100 calls) | < 50% | ~7% | Pass |
| Memory drift (HTTP, 100 calls) | < 50% | ~30% | Pass |

## Evidence

- Source: `apps/spike-runner/src/sp-05-mcp-transport.ts`
- Test server: `apps/spike-runner/src/mcp-test-server.mjs`
- Tests: `apps/spike-runner/tests/sp-05-mcp-transport.test.ts` (16 tests)
- SDK: `@modelcontextprotocol/sdk` v1.27.1

## Findings

### 1. Transport Performance Decision Matrix

| Mode | Best For | Cold Start | Warm Start | Trade-off |
|------|----------|-----------|-----------|-----------|
| **In-process** | Internal/trusted tools | ~1.5ms | ~0.2ms | No isolation; shared process memory |
| **stdio** | External/untrusted MCP servers | ~160ms | ~0.5ms | Process spawn overhead; full isolation |
| **HTTP** | Separate service deployment | ~45ms | ~2.3ms | Network overhead; independently scalable |

**Recommendation**: Use in-process (`InMemoryTransport`) for Aptivo's own tool servers. Use stdio for third-party MCP servers requiring isolation. HTTP for microservice-style deployments.

### 2. Zod v3 Compatibility Required for MCP SDK

The `@modelcontextprotocol/sdk` v1.27.1 uses Zod internally for schema validation. When using Zod v4 (project default), tool parameter schemas must use the `zod/v3` compatibility import. Passing plain `{ type: 'string' }` objects instead of Zod schemas causes server-side result validation failures (`MCP error -32602: Invalid tools/call result`).

**Pattern**: Always use `import { z } from 'zod/v3'` for MCP tool schemas.

### 3. npx Mode Not Separately Benchmarked

The spec called for benchmarking `npx @package/mcp-server`. The stdio transport benchmark already captures the process-spawn overhead (~160ms cold start). The additional latency from `npx` would come from npm registry resolution and package download, which are:
- Eliminated by pre-installing packages (production pattern)
- Unreliable for CI/testing (registry dependency)

**Decision**: Use bundled local or pre-installed packages in production. npx only for developer convenience during prototyping.

### 4. StdioClientTransport Cleanup

`StdioClientTransport` spawns a child process. `client.close()` sends SIGTERM and cleans up reliably. No zombie processes observed during 100+ sequential test runs.

### 5. StreamableHTTPServerTransport Session Management

The HTTP transport requires explicit session management. Each new client connection creates a new session via `sessionIdGenerator`. For the spike, single-session mode was sufficient. Production will need a session registry with cleanup on disconnect.

### 6. MCP SDK Unknown Tool Behavior

When calling an unknown tool, the MCP SDK returns `{ isError: true, content: [{ type: 'text', text: 'Tool X not found' }] }` rather than throwing an exception. Callers must check `result.isError` explicitly.

## Decision

**Pass** -- All three transport modes meet or exceed success criteria. Clear decision matrix produced for which transport to use per MCP server type:
- Own tools: In-process (InMemoryTransport)
- Third-party MCP servers: stdio (StdioClientTransport)
- Service-separated deployments: HTTP (StreamableHTTPClientTransport)

## WARNINGs Validated

No WARNINGs mapped to SP-05 in the traceability matrix.

## Follow-up Actions

- [ ] Establish MCP transport selection guide for Sprint 1
- [ ] Document `zod/v3` requirement for MCP tool schemas alongside SP-01's Inngest finding
- [ ] Evaluate connection pooling for stdio transport (keep process alive across calls)
- [ ] Define session management strategy for HTTP transport in production
