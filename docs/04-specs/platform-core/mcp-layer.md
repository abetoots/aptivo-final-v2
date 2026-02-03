---
id: TSD-MCP-LAYER
title: MCP Integration Layer Specification
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-03'
parent: ../../03-architecture/platform-core-add.md
domain: core
---

# MCP Integration Layer Specification

**Platform Core – MCP Tool Consumption**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0.0 | 2026-02-03 | Multi-Model Consensus | Initial creation |

---

## 1. Overview

The MCP Integration Layer enables Aptivo workflows to consume external MCP servers as tools. This is implemented using **Inngest AgentKit**, which natively supports MCP tool consumption.

**FRD Reference**: FR-CORE-MCP-001 to FR-CORE-MCP-003

### 1.1 Key Decisions

| Decision | Selection | Rationale |
|----------|-----------|-----------|
| MCP Consumption | Inngest AgentKit | Native MCP-as-tools support |
| Registry | Hardcoded configs (Phase 1) | Dynamic discovery deferred |
| Resilience | cockatiel (circuit breaker + retry) | Proven TypeScript library |

---

## 2. AgentKit MCP Integration

### 2.1 MCP Server Configuration

```typescript
// config/mcp-servers.ts
import { createMCPClient } from '@inngest/agent-kit';

export const mcpServers = {
  // crypto domain servers
  theGraph: createMCPClient({
    name: 'the-graph',
    transport: 'stdio',
    command: 'npx',
    args: ['@kukapay/thegraph-mcp'],
    env: { GRAPH_API_KEY: process.env.GRAPH_API_KEY },
  }),

  coinGecko: createMCPClient({
    name: 'coingecko',
    transport: 'stdio',
    command: 'npx',
    args: ['coingecko-mcp'],
    env: { COINGECKO_API_KEY: process.env.COINGECKO_API_KEY },
  }),

  goPlus: createMCPClient({
    name: 'goplus',
    transport: 'stdio',
    command: 'npx',
    args: ['@anthropic/goplus-mcp'],
  }),

  // hr domain servers
  gmail: createMCPClient({
    name: 'gmail',
    transport: 'stdio',
    command: 'npx',
    args: ['mcp-gmail'],
    env: { GOOGLE_CREDENTIALS: process.env.GOOGLE_CREDENTIALS },
  }),

  calendar: createMCPClient({
    name: 'calendar',
    transport: 'stdio',
    command: 'npx',
    args: ['mcp-calendar'],
    env: { GOOGLE_CREDENTIALS: process.env.GOOGLE_CREDENTIALS },
  }),
};
```

### 2.2 Using MCP Tools in Workflows

```typescript
// workflows/smart-money.ts
import { inngest } from '../client';
import { mcpServers } from '../config/mcp-servers';

export const smartMoneyWorkflow = inngest.createFunction(
  { id: 'smart-money-tracking' },
  { event: 'crypto/wallet.transaction' },
  async ({ event, step }) => {
    // call mcp tool inside step.run
    const tokenInfo = await step.run('get-token-info', async () => {
      return mcpServers.coinGecko.callTool('getTokenPrice', {
        tokenId: event.data.tokenAddress,
      });
    });

    const securityScan = await step.run('security-scan', async () => {
      return mcpServers.goPlus.callTool('scanContract', {
        address: event.data.tokenAddress,
        chain: event.data.blockchain,
      });
    });

    // ... continue workflow
  }
);
```

---

## 3. Resilience Patterns

### 3.1 Circuit Breaker + Retry

```typescript
// lib/mcp-resilience.ts
import { circuitBreaker, retry, timeout, wrap, handleAll } from 'cockatiel';

const mcpPolicy = wrap(
  retry(handleAll, {
    maxAttempts: 3,
    backoff: new ExponentialBackoff({ initialDelay: 1000 })
  }),
  circuitBreaker(handleAll, {
    halfOpenAfter: 30_000,
    breaker: new ConsecutiveBreaker(5),
  }),
  timeout(10_000)
);

export async function callMCPToolWithResilience<T>(
  client: MCPClient,
  tool: string,
  args: unknown
): Promise<T> {
  return mcpPolicy.execute(() => client.callTool(tool, args));
}
```

### 3.2 Rate Limit Queueing

```typescript
// lib/mcp-queue.ts
import { Queue, Worker } from 'bullmq';

const mcpQueue = new Queue('mcp-requests', { connection: redis });

// queue mcp request when rate limited
export async function queueMCPRequest(
  serverId: string,
  tool: string,
  args: unknown,
  workflowId: string
): Promise<{ queued: true; jobId: string }> {
  const job = await mcpQueue.add('mcp-request', {
    serverId,
    tool,
    args,
    workflowId,
  }, {
    delay: 60_000, // wait 1 minute before retry
    attempts: 3,
  });

  return { queued: true, jobId: job.id };
}

// worker signals workflow when complete
const worker = new Worker('mcp-requests', async (job) => {
  const { serverId, tool, args, workflowId } = job.data;
  const result = await callMCPToolWithResilience(
    mcpServers[serverId],
    tool,
    args
  );

  // signal inngest workflow with result
  await inngest.send({
    name: 'mcp/tool.completed',
    data: { workflowId, tool, result },
  });
}, { connection: redis });
```

---

## 4. Schema Validation

```typescript
// lib/mcp-schemas.ts
import { z } from 'zod';

export const mcpSchemas = {
  'coingecko.getTokenPrice': z.object({
    id: z.string(),
    symbol: z.string(),
    current_price: z.number(),
    market_cap: z.number(),
  }),

  'goplus.scanContract': z.object({
    is_honeypot: z.boolean(),
    buy_tax: z.string(),
    sell_tax: z.string(),
    is_open_source: z.boolean(),
  }),

  'gmail.sendEmail': z.object({
    messageId: z.string(),
    threadId: z.string(),
  }),
};

export function validateMCPResponse<T>(
  serverId: string,
  tool: string,
  response: unknown
): T {
  const schema = mcpSchemas[`${serverId}.${tool}`];
  if (!schema) return response as T;

  return schema.parse(response) as T;
}
```

---

## 5. Caching Strategy

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Price data | 60s | Market volatility |
| Token metadata | 1h | Rarely changes |
| Security scans | 24h | Contract code static |
| Wallet history | 5min | Block finality |
| Calendar availability | 5min | Meeting changes |

```typescript
// lib/mcp-cache.ts
import { redis } from '../lib/redis';

export async function cachedMCPCall<T>(
  cacheKey: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const result = await fn();
  await redis.setex(cacheKey, ttlSeconds, JSON.stringify(result));
  return result;
}
```

---

## 6. MCP Server Registry (Phase 1)

### 6.1 Crypto Domain Servers

| Server | Package | Purpose |
|--------|---------|---------|
| The Graph | `@kukapay/thegraph-mcp` | On-chain data indexing |
| CoinGecko | `coingecko-mcp` | Token prices, market data |
| GoPlus | `@anthropic/goplus-mcp` | Contract security scanning |
| DEX Screener | `dexscreener-mcp` | DEX pair data |
| LunarCrush | `lunarcrush-mcp` | Social sentiment |
| Tenderly | `tenderly-mcp` | Transaction simulation |
| CCXT | `ccxt-mcp` | Exchange trading |

### 6.2 HR Domain Servers

| Server | Package | Purpose |
|--------|---------|---------|
| Gmail | `mcp-gmail` | Email communication |
| Google Calendar | `mcp-calendar` | Interview scheduling |
| LinkedIn | `mcp-linkedin` (Phase 2) | Candidate sourcing |

---

## 7. Phase 2+ Roadmap

- Dynamic MCP server discovery (registry API)
- Per-server health monitoring dashboard
- MCP server hot-reload without restart
- Custom MCP server development kit

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| MCP Tool Registry | platform-core-frd.md | FR-CORE-MCP-001 |
| Resilient Tool Execution | platform-core-frd.md | FR-CORE-MCP-002 |
| Response Parsing | platform-core-frd.md | FR-CORE-MCP-003 |
| MCP Integration Layer | platform-core-add.md | Section 5 |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Crypto MCP Servers | crypto/mcp-servers.md | All sections |
| HR MCP Servers | hr/workflow-automation.md | External services |
