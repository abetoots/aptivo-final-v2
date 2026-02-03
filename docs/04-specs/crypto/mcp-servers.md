---
id: TSD-CRYPTO-MCP
title: Crypto MCP Server Specifications
status: Draft
version: 1.0.0
owner: '@owner'
last_updated: '2026-02-02'
parent: ../../03-architecture/platform-core-add.md
domain: crypto
---

# Crypto MCP Server Specifications

**Crypto Domain – Model Context Protocol Integrations**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0.0 | 2026-02-02 | Document Review | Extracted from crypto temp files, aligned with Platform Core |

---

## 1. Overview

This document defines the MCP (Model Context Protocol) server integrations for the **Crypto Trading Domain**. These MCP servers provide blockchain data, security analysis, and market intelligence to the AI workflows.

**Contents:**
- 13 MCP server configurations
- Service implementation patterns
- Error handling and resilience

> **Note:** The Platform Core MCP Layer handles connection pooling, caching, and circuit breakers. See [Platform Core ADD](../../03-architecture/platform-core-add.md) Section 5.

---

## 2. MCP Server Registry

### 2.1 Server Configuration Schema

```typescript
interface MCPServerConfig {
  id: string;
  name: string;
  package: string;
  version: string;
  capabilities: string[];
  requiresApiKey: boolean;
  envVarName?: string;
}
```

### 2.2 Complete Server List

```typescript
const MCP_SERVERS: MCPServerConfig[] = [
  // --- Blockchain Data ---
  {
    id: 'thegraph',
    name: 'The Graph MCP',
    package: '@kukapay/thegraph-mcp',
    version: '^1.0.0',
    capabilities: ['blockchain_queries', 'subgraph_data'],
    requiresApiKey: true,
    envVarName: 'THEGRAPH_API_KEY',
  },
  {
    id: 'block_explorer',
    name: 'Block Explorer MCP',
    package: 'etherscan-mcp',
    version: '^0.6.0',
    capabilities: ['tx_history', 'contract_abi', 'token_transfers', 'gas_tracker'],
    requiresApiKey: true,
    envVarName: 'ETHERSCAN_API_KEY',
    // Multi-chain: Also supports ARBISCAN_API_KEY, BASESCAN_API_KEY, etc.
  },

  // --- Price & Market Data ---
  {
    id: 'coingecko',
    name: 'CoinGecko MCP',
    package: 'coingecko-mcp',
    version: '^2.0.0',
    capabilities: ['price_data', 'market_data', 'historical_data'],
    requiresApiKey: true,
    envVarName: 'COINGECKO_API_KEY',
  },
  {
    id: 'coinmarketcap',
    name: 'CoinMarketCap MCP',
    package: 'coinmarketcap-mcp',
    version: '^1.1.0',
    capabilities: ['price_data', 'market_cap', 'new_listings', 'trending'],
    requiresApiKey: false, // optional secondary feed
    envVarName: 'COINMARKETCAP_API_KEY',
  },

  // --- DeFi Data ---
  {
    id: 'defillama',
    name: 'DefiLlama MCP',
    package: 'defillama-mcp',
    version: '^1.5.0',
    capabilities: ['tvl_data', 'protocol_data', 'chain_data'],
    requiresApiKey: false,
  },
  {
    id: 'dexscreener',
    name: 'DEX Screener MCP',
    package: 'dexscreener-mcp',
    version: '^1.2.0',
    capabilities: ['dex_pairs', 'liquidity_data', 'new_listings', 'price_charts'],
    requiresApiKey: false,
    envVarName: 'DEXSCREENER_API_KEY', // optional for higher rate limits
  },

  // --- Social & Sentiment ---
  {
    id: 'lunarcrush',
    name: 'LunarCrush MCP',
    package: 'lunarcrush-mcp',
    version: '^3.0.0',
    capabilities: ['social_sentiment', 'influencer_data', 'galaxy_score'],
    requiresApiKey: true,
    envVarName: 'LUNARCRUSH_API_KEY',
  },
  {
    id: 'cryptopanic',
    name: 'CryptoPanic MCP',
    package: '@kukapay/cryptopanic-mcp',
    version: '^1.2.0',
    capabilities: ['news_aggregation', 'sentiment_analysis'],
    requiresApiKey: true,
    envVarName: 'CRYPTOPANIC_API_KEY',
  },

  // --- Security Analysis ---
  {
    id: 'goplus',
    name: 'GoPlus Security MCP',
    package: '@anthropic/goplus-mcp',
    version: '^1.0.0',
    capabilities: ['honeypot_detection', 'contract_security', 'rugpull_risk', 'token_analysis'],
    requiresApiKey: true,
    envVarName: 'GOPLUS_API_KEY',
  },
  {
    id: 'tenderly',
    name: 'Tenderly MCP',
    package: 'tenderly-mcp',
    version: '^0.5.0',
    capabilities: ['tx_simulation', 'gas_estimation', 'state_overrides', 'trace_analysis'],
    requiresApiKey: true,
    envVarName: 'TENDERLY_ACCESS_KEY',
  },

  // --- Technical Analysis ---
  {
    id: 'tradingview',
    name: 'TradingView MCP',
    package: '@atilaahmettaner/tradingview-mcp',
    version: '^2.1.0',
    capabilities: ['technical_indicators', 'chart_data', 'screeners'],
    requiresApiKey: false,
  },

  // --- Exchange APIs ---
  {
    id: 'binance',
    name: 'Binance MCP',
    package: '@analyticace/binance-mcp',
    version: '^1.0.0',
    capabilities: ['exchange_data', 'orderbook', 'trades'],
    requiresApiKey: true,
    envVarName: 'BINANCE_API_KEY',
  },
  {
    id: 'ccxt',
    name: 'CCXT MCP',
    package: 'ccxt-mcp',
    version: '^4.0.0',
    capabilities: ['multi_exchange', 'unified_api', 'market_data'],
    requiresApiKey: false, // per-exchange keys configured separately
  },
];
```

---

## 3. Server Categories

### 3.1 Blockchain Data Servers

| Server | Use Case | Key Capabilities |
|--------|----------|------------------|
| **The Graph** | Smart money tracking, on-chain queries | Subgraph queries, indexed blockchain data |
| **Block Explorer** | Transaction history, contract ABIs | Multi-chain support (Etherscan, Arbiscan, etc.) |

### 3.2 Price & Market Data Servers

| Server | Use Case | Key Capabilities |
|--------|----------|------------------|
| **CoinGecko** | Primary price feed | Historical prices, market caps, volume |
| **CoinMarketCap** | Secondary price feed | New listings, trending tokens |

### 3.3 DeFi Data Servers

| Server | Use Case | Key Capabilities |
|--------|----------|------------------|
| **DefiLlama** | Protocol TVL analysis | Chain TVL, protocol rankings |
| **DEX Screener** | DEX pair analysis | Liquidity depth, new token listings |

### 3.4 Social & Sentiment Servers

| Server | Use Case | Key Capabilities |
|--------|----------|------------------|
| **LunarCrush** | Narrative detection | Social volume, influencer tracking |
| **CryptoPanic** | News aggregation | Sentiment scores, news feeds |

### 3.5 Security Analysis Servers

| Server | Use Case | Key Capabilities |
|--------|----------|------------------|
| **GoPlus** | Contract security scans | Honeypot detection, rug pull analysis |
| **Tenderly** | Transaction simulation | Pre-execution safety checks |

### 3.6 Technical Analysis & Exchange Servers

| Server | Use Case | Key Capabilities |
|--------|----------|------------------|
| **TradingView** | Technical indicators | RSI, MACD, chart patterns |
| **Binance** | CEX data | Order books, recent trades |
| **CCXT** | Multi-exchange access | Unified API across 100+ exchanges |

---

## 4. MCP Service Implementation

### 4.1 Service Interface

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Result, ok, err } from '@satoshibits/functional';
import type pino from 'pino';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

class MCPError extends Error {
  constructor(
    message: string,
    public serverId: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'MCPError';
  }
}
```

### 4.2 Connection Management

```typescript
export class MCPService {
  private clients: Map<string, Client> = new Map();
  private serverConfigs: Map<string, MCPServerConfig> = new Map();
  private availableServers: Set<string> = new Set();

  constructor(
    private logger: pino.Logger,
    private config: Record<string, string> // API keys from environment
  ) {
    MCP_SERVERS.forEach(server => {
      this.serverConfigs.set(server.id, server);
    });
  }

  async initialize(): Promise<Result<void, MCPError>> {
    for (const serverConfig of MCP_SERVERS) {
      const result = await this.initializeServer(serverConfig);
      if (!result.success) {
        this.logger.warn(`Failed to initialize MCP server: ${serverConfig.name}`, {
          error: result.error.message,
        });
      }
    }
    // service succeeds even if some servers fail
    return ok(undefined);
  }

  private async initializeServer(
    serverConfig: MCPServerConfig
  ): Promise<Result<void, MCPError>> {
    try {
      // check API key requirement
      if (serverConfig.requiresApiKey && serverConfig.envVarName) {
        const apiKey = this.config[serverConfig.envVarName];
        if (!apiKey) {
          return err(new MCPError(
            `API key missing: ${serverConfig.envVarName}`,
            serverConfig.id
          ));
        }
      }

      // create client transport
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', serverConfig.package],
        env: {
          ...process.env,
          ...(serverConfig.requiresApiKey && serverConfig.envVarName
            ? { [serverConfig.envVarName]: this.config[serverConfig.envVarName] }
            : {}),
        },
      });

      // create and connect client
      const client = new Client(
        { name: 'aptivo-crypto-agent', version: '1.0.0' },
        { capabilities: {} }
      );

      await client.connect(transport);
      this.clients.set(serverConfig.id, client);
      this.availableServers.add(serverConfig.id);

      this.logger.info(`Initialized MCP server: ${serverConfig.name}`, {
        capabilities: serverConfig.capabilities,
      });

      return ok(undefined);
    } catch (error) {
      return err(new MCPError(
        `Failed to initialize ${serverConfig.name}`,
        serverConfig.id,
        error as Error
      ));
    }
  }
}
```

### 4.3 Tool Execution

```typescript
async executeTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<Result<MCPToolResult, MCPError>> {
  if (!this.availableServers.has(serverId)) {
    return err(new MCPError(`Server ${serverId} not available`, serverId));
  }

  const client = this.clients.get(serverId);
  if (!client) {
    return err(new MCPError(`Server ${serverId} not initialized`, serverId));
  }

  try {
    this.logger.info('Executing MCP tool', { serverId, toolName, args });

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    return ok(result as MCPToolResult);
  } catch (error) {
    return err(new MCPError(
      `Failed to execute tool ${toolName} on ${serverId}`,
      serverId,
      error as Error
    ));
  }
}
```

---

## 5. Workflow Integration

### 5.1 Smart Money Tracking

```typescript
// fetch wallet transactions via The Graph
const transactions = await mcpService.executeTool('thegraph', 'querySubgraph', {
  subgraphId: 'uniswap-v3-arbitrum',
  query: `{
    swaps(where: { origin: "${walletAddress}" }, first: 100) {
      id
      amount0
      amount1
      token0 { symbol }
      token1 { symbol }
      timestamp
    }
  }`,
});

// get token prices via CoinGecko
const prices = await mcpService.executeTool('coingecko', 'getTokenPrices', {
  ids: ['ethereum', 'arbitrum'],
  vs_currencies: ['usd'],
});
```

### 5.2 Security Detection

```typescript
// run GoPlus security scan
const securityCheck = await mcpService.executeTool('goplus', 'tokenSecurityCheck', {
  chain_id: '42161', // Arbitrum
  contract_addresses: contractAddress,
});

// simulate transaction with Tenderly
const simulation = await mcpService.executeTool('tenderly', 'simulateTransaction', {
  network_id: 'arbitrum-mainnet',
  from: userAddress,
  to: contractAddress,
  input: calldata,
  value: '0',
});
```

### 5.3 Narrative Scouting

```typescript
// get social metrics from LunarCrush
const socialMetrics = await mcpService.executeTool('lunarcrush', 'getAssetMetrics', {
  symbol: 'ETH',
  data_points: ['social_volume', 'galaxy_score', 'alt_rank'],
});

// get news from CryptoPanic
const news = await mcpService.executeTool('cryptopanic', 'getNews', {
  currencies: ['ETH', 'BTC'],
  kind: 'news',
  filter: 'important',
});
```

---

## 6. Error Handling & Resilience

### 6.1 Retry Policy

All MCP tool calls are wrapped with the Platform Core resilience policy:

```typescript
import { retry, handleAll, ExponentialBackoff, circuitBreaker } from 'cockatiel';

const mcpPolicy = retry(handleAll, {
  maxAttempts: 3,
  backoff: new ExponentialBackoff({ initialDelay: 1000, maxDelay: 10000 }),
}).wrap(
  circuitBreaker(handleAll, {
    halfOpenAfter: 30_000,
    breaker: { threshold: 0.5, duration: 60_000, minimumRps: 5 },
  })
);
```

### 6.2 Fallback Strategy

| Primary Server | Fallback Server | Condition |
|----------------|-----------------|-----------|
| CoinGecko | CoinMarketCap | Rate limit or timeout |
| The Graph | Block Explorer | Subgraph unavailable |
| Binance | CCXT (multi-exchange) | Exchange API down |

---

## 7. Environment Variables

```bash
# Required
THEGRAPH_API_KEY=
COINGECKO_API_KEY=
LUNARCRUSH_API_KEY=
CRYPTOPANIC_API_KEY=
GOPLUS_API_KEY=
TENDERLY_ACCESS_KEY=
BINANCE_API_KEY=
BINANCE_SECRET_KEY=

# Block Explorers (at least one required)
ETHERSCAN_API_KEY=
ARBISCAN_API_KEY=
BASESCAN_API_KEY=
OPTIMISTIC_ETHERSCAN_API_KEY=
POLYGONSCAN_API_KEY=

# Optional
COINMARKETCAP_API_KEY=
DEXSCREENER_API_KEY=
```

---

## 8. Cache TTL Configuration

| Server | Data Type | TTL |
|--------|-----------|-----|
| CoinGecko | Price data | 1 minute |
| The Graph | Transaction data | 5 minutes |
| LunarCrush | Social metrics | 15 minutes |
| GoPlus | Security scans | 24 hours |
| DefiLlama | TVL data | 1 hour |
| TradingView | Technical indicators | 5 minutes |

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| On-Chain Data Sources | crypto-domain-frd.md | FR-CRYPTO-SMT-001, FR-CRYPTO-SMT-002 |
| Social Data Sources | crypto-domain-frd.md | FR-CRYPTO-NS-002 |
| Security Scanner Integration | crypto-domain-frd.md | FR-CRYPTO-SEC-001 |
| Exchange Integration | crypto-domain-frd.md | FR-CRYPTO-TRD-003 |
| MCP Integration Layer | platform-core/mcp-layer.md | All sections |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| Workflow Tool Calls | crypto/workflow-engine.md | MCP tool usage |
