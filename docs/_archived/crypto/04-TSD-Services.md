# TSD - Shared Services Implementation

# Crypto Trading AI Agent Ecosystem

**Module**: Shared Services
**Version**: 2.1
**Last Updated**: January 15, 2026
**Status**: Complete

[← Back to TSD Root](./04-TSD-Root.md)

---

## Overview

This module defines the implementation of shared services used across all workflows, implementing the `/shared/services` directory from ADD v2.1 hybrid file structure.

**Contents:**

- 4.1: LLM Service (Multi-provider with cost tracking)
- 4.2: MCP Service (13 MCP servers)
- 4.3: Logging Service (Pino structured logging)
- 4.4: Queue Service (@satoshibits/queue with BullMQ provider)
- 4.5: Notification Service (Email, Telegram, SMS)
- 4.6: HITL Service (Approval queue, notifications)
- 4.7: Resilience Patterns (cockatiel policies)

**Authentication Service**: See [TSD-Authentication.md](./TSD-Authentication.md) for passwordless authentication (WebAuthn, OAuth, jose JWT)

**Key Principles:**

- All services use `Result<T, E>` pattern for error handling (ADD v2.1 Section 6.5)
- All external API calls wrapped in resilience policies (ADD v2.1 Section 10.1.1)
- Structured JSON logging with Pino (ADD v2.1 Section 9.1)
- Services are provider-agnostic where applicable
- Comprehensive error logging and observability

---

## 4.1 LLM Service

**File:** `src/shared/services/llm/LLMService.ts`

**Purpose:** Abstraction layer for multiple LLM providers (OpenAI, Anthropic, Google) with cost tracking and failover.

### 4.1.1 Type Definitions

```typescript
/**
 * Result type for explicit error handling (ADD v1.1 Section 6.5)
 * Imported from @satoshibits/functional for consistent error handling
 */
import { Result } from "@satoshibits/functional/result";

/**
 * Supported LLM providers
 */
type LLMProviderType = "openai" | "anthropic" | "google";

/**
 * LLM completion request options
 */
interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

/**
 * Message format for chat completions
 */
interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Tool definition for function calling
 */
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Tool call response
 */
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Response from LLM with optional tool calls
 */
interface ToolCallResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: "stop" | "length" | "tool_calls" | "content_filter";
}

/**
 * LLM usage metrics for cost tracking
 */
interface LLMUsageMetrics {
  provider: LLMProviderType;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  durationMs: number;
}

/**
 * Custom error types for LLM operations
 */
class LLMError extends Error {
  constructor(
    message: string,
    public provider: LLMProviderType,
    public cause?: Error
  ) {
    super(message);
    this.name = "LLMError";
  }
}

class LLMRateLimitError extends LLMError {
  constructor(provider: LLMProviderType, retryAfterMs?: number) {
    super(`Rate limit exceeded for ${provider}`, provider);
    this.name = "LLMRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
  retryAfterMs?: number;
}

class LLMBudgetExceededError extends LLMError {
  constructor(currentSpend: number, budget: number) {
    super(
      `LLM budget exceeded: $${currentSpend.toFixed(2)} / $${budget.toFixed(
        2
      )}`,
      "openai" // Budget is tracked globally
    );
    this.name = "LLMBudgetExceededError";
  }
}
```

### 4.1.2 Provider Interface

```typescript
/**
 * Abstract interface that all LLM providers must implement
 */
interface LLMProvider {
  readonly name: LLMProviderType;
  readonly defaultModel: string;

  /**
   * Generate text completion from prompt
   */
  generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<Result<string, LLMError>>;

  /**
   * Generate completion with tool/function calling support
   */
  generateWithTools(
    messages: Message[],
    tools: Tool[],
    options?: CompletionOptions
  ): Promise<Result<ToolCallResponse, LLMError>>;

  /**
   * Estimate cost for given token count
   */
  estimateCost(tokens: number, model?: string): number;

  /**
   * Check if provider is available (API key valid, service up)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get usage metrics from last call
   */
  getLastUsageMetrics(): LLMUsageMetrics | null;
}
```

### 4.1.3 OpenAI Provider Implementation

```typescript
import OpenAI from "openai";

/**
 * OpenAI LLM provider implementation
 *
 * Models supported:
 * - gpt-4-turbo: $0.01/1K prompt tokens, $0.03/1K completion tokens
 * - gpt-4: $0.03/1K prompt tokens, $0.06/1K completion tokens
 * - gpt-3.5-turbo: $0.0005/1K prompt tokens, $0.0015/1K completion tokens
 */
export class OpenAIProvider implements LLMProvider {
  readonly name: LLMProviderType = "openai";
  readonly defaultModel = "gpt-4-turbo";

  private client: OpenAI;
  private lastUsage: LLMUsageMetrics | null = null;

  // Pricing per 1K tokens (USD)
  private readonly pricing: Record<
    string,
    { prompt: number; completion: number }
  > = {
    "gpt-4-turbo": { prompt: 0.01, completion: 0.03 },
    "gpt-4": { prompt: 0.03, completion: 0.06 },
    "gpt-3.5-turbo": { prompt: 0.0005, completion: 0.0015 },
  };

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateCompletion(
    prompt: string,
    options?: CompletionOptions
  ): Promise<Result<string, LLMError>> {
    const startTime = Date.now();

    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: "user", content: prompt }],
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
        stop: options?.stopSequences,
        top_p: options?.topP,
        frequency_penalty: options?.frequencyPenalty,
        presence_penalty: options?.presencePenalty,
      });

      const content = response.choices[0]?.message?.content ?? "";
      const usage = response.usage;

      if (usage) {
        this.lastUsage = {
          provider: "openai",
          model: this.defaultModel,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          estimatedCostUSD: this.calculateCost(
            usage.prompt_tokens,
            usage.completion_tokens
          ),
          durationMs: Date.now() - startTime,
        };
      }

      return { success: true, data: content };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        if (error.status === 429) {
          const retryAfter = error.headers?.["retry-after"];
          return {
            success: false,
            error: new LLMRateLimitError(
              "openai",
              retryAfter ? parseInt(retryAfter) * 1000 : undefined
            ),
          };
        }
        return {
          success: false,
          error: new LLMError(
            `OpenAI API error: ${error.message}`,
            "openai",
            error
          ),
        };
      }
      return {
        success: false,
        error: new LLMError(
          "Unknown error in OpenAI provider",
          "openai",
          error as Error
        ),
      };
    }
  }

  async generateWithTools(
    messages: Message[],
    tools: Tool[],
    options?: CompletionOptions
  ): Promise<Result<ToolCallResponse, LLMError>> {
    const startTime = Date.now();

    try {
      const response = await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        tools: tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 2000,
      });

      const choice = response.choices[0];
      const content = choice?.message?.content ?? "";
      const toolCalls = choice?.message?.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));

      const usage = response.usage;
      if (usage) {
        this.lastUsage = {
          provider: "openai",
          model: this.defaultModel,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          estimatedCostUSD: this.calculateCost(
            usage.prompt_tokens,
            usage.completion_tokens
          ),
          durationMs: Date.now() - startTime,
        };
      }

      return {
        success: true,
        value: {
          content,
          toolCalls,
          finishReason:
            choice?.finish_reason as ToolCallResponse["finishReason"],
        },
      };
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        if (error.status === 429) {
          return {
            success: false,
            error: new LLMRateLimitError("openai"),
          };
        }
        return {
          success: false,
          error: new LLMError(
            `OpenAI API error: ${error.message}`,
            "openai",
            error
          ),
        };
      }
      return {
        success: false,
        error: new LLMError(
          "Unknown error in OpenAI provider",
          "openai",
          error as Error
        ),
      };
    }
  }

  estimateCost(tokens: number, model?: string): number {
    const modelKey = model ?? this.defaultModel;
    const pricing = this.pricing[modelKey];
    if (!pricing) return 0;

    // Assume 75% prompt, 25% completion split for estimation
    const promptTokens = Math.floor(tokens * 0.75);
    const completionTokens = Math.floor(tokens * 0.25);

    return this.calculateCost(promptTokens, completionTokens, modelKey);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  getLastUsageMetrics(): LLMUsageMetrics | null {
    return this.lastUsage;
  }

  private calculateCost(
    promptTokens: number,
    completionTokens: number,
    model?: string
  ): number {
    const modelKey = model ?? this.defaultModel;
    const pricing = this.pricing[modelKey];
    if (!pricing) return 0;

    const promptCost = (promptTokens / 1000) * pricing.prompt;
    const completionCost = (completionTokens / 1000) * pricing.completion;

    return promptCost + completionCost;
  }
}
```

### 4.1.4 LLM Service Orchestrator

```typescript
import { Pool } from "pg";
import pino from "pino";

/**
 * Main LLM service that orchestrates multiple providers
 * Handles provider selection, failover, cost tracking, and usage logging
 */
export class LLMService {
  private providers: Map<LLMProviderType, LLMProvider>;
  private defaultProvider: LLMProviderType;
  private totalSpendUSD = 0;
  private budgetUSD: number;

  constructor(
    private db: Pool,
    private logger: pino.Logger,
    config: {
      openaiApiKey?: string;
      anthropicApiKey?: string;
      googleApiKey?: string;
      defaultProvider?: LLMProviderType;
      budgetUSD?: number;
    }
  ) {
    this.providers = new Map();
    this.defaultProvider = config.defaultProvider ?? "openai";
    this.budgetUSD = config.budgetUSD ?? 100;

    // Initialize providers
    if (config.openaiApiKey) {
      this.providers.set("openai", new OpenAIProvider(config.openaiApiKey));
    }
    // Anthropic and Google providers would be initialized similarly
  }

  /**
   * Initialize service by loading current month's spending from database
   * MUST be called after construction before any API calls
   */
  async initialize(): Promise<Result<void, Error>> {
    try {
      const result = await this.db.query(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0) as total
         FROM llm_usage_logs
         WHERE created_at >= date_trunc('month', NOW())`
      );

      this.totalSpendUSD = parseFloat(result.rows[0].total);

      this.logger.info("LLM Service initialized", {
        totalSpendUSD: this.totalSpendUSD,
        budgetUSD: this.budgetUSD,
        percentUsed: ((this.totalSpendUSD / this.budgetUSD) * 100).toFixed(2),
      });

      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error("Failed to initialize LLM Service", { error });
      return {
        success: false,
        error: error as Error,
      };
    }
  }

  /**
   * Generate completion with automatic provider failover
   */
  async generateCompletion(
    prompt: string,
    options?: CompletionOptions & { provider?: LLMProviderType }
  ): Promise<Result<string, LLMError>> {
    // Check budget
    if (this.totalSpendUSD >= this.budgetUSD) {
      return {
        success: false,
        error: new LLMBudgetExceededError(this.totalSpendUSD, this.budgetUSD),
      };
    }

    const provider = this.getProvider(options?.provider);
    if (!provider) {
      return {
        success: false,
        error: new LLMError(
          `Provider ${
            options?.provider ?? this.defaultProvider
          } not configured`,
          options?.provider ?? this.defaultProvider
        ),
      };
    }

    const result = await provider.generateCompletion(prompt, options);

    // Log usage
    if (result.success) {
      const usage = provider.getLastUsageMetrics();
      if (usage) {
        await this.logUsage(usage);
      }
    } else {
      this.logger.error("LLM completion failed", {
        provider: provider.name,
        error: result.error.message,
      });
    }

    return result;
  }

  /**
   * Generate completion with tool calling
   */
  async generateWithTools(
    messages: Message[],
    tools: Tool[],
    options?: CompletionOptions & { provider?: LLMProviderType }
  ): Promise<Result<ToolCallResponse, LLMError>> {
    if (this.totalSpendUSD >= this.budgetUSD) {
      return {
        success: false,
        error: new LLMBudgetExceededError(this.totalSpendUSD, this.budgetUSD),
      };
    }

    const provider = this.getProvider(options?.provider);
    if (!provider) {
      return {
        success: false,
        error: new LLMError(
          `Provider ${
            options?.provider ?? this.defaultProvider
          } not configured`,
          options?.provider ?? this.defaultProvider
        ),
      };
    }

    const result = await provider.generateWithTools(messages, tools, options);

    if (result.success) {
      const usage = provider.getLastUsageMetrics();
      if (usage) {
        await this.logUsage(usage);
      }
    } else {
      this.logger.error("LLM tool call failed", {
        provider: provider.name,
        error: result.error.message,
      });
    }

    return result;
  }

  /**
   * Get current spend and budget status
   */
  getBudgetStatus(): {
    spendUSD: number;
    budgetUSD: number;
    percentUsed: number;
  } {
    return {
      spendUSD: this.totalSpendUSD,
      budgetUSD: this.budgetUSD,
      percentUsed: (this.totalSpendUSD / this.budgetUSD) * 100,
    };
  }

  /**
   * Log usage to database (llm_usage_logs table)
   */
  private async logUsage(usage: LLMUsageMetrics): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO llm_usage_logs (
          provider, model, prompt_tokens, completion_tokens,
          total_tokens, estimated_cost_usd, duration_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          usage.provider,
          usage.model,
          usage.promptTokens,
          usage.completionTokens,
          usage.totalTokens,
          usage.estimatedCostUSD,
          usage.durationMs,
        ]
      );

      this.totalSpendUSD += usage.estimatedCostUSD;

      this.logger.info("LLM usage logged", {
        provider: usage.provider,
        model: usage.model,
        tokens: usage.totalTokens,
        cost: usage.estimatedCostUSD,
        totalSpend: this.totalSpendUSD,
      });
    } catch (error) {
      this.logger.error("Failed to log LLM usage", { error });
    }
  }

  private getProvider(type?: LLMProviderType): LLMProvider | undefined {
    return this.providers.get(type ?? this.defaultProvider);
  }
}
```

---

## 4.2 MCP Service

**File:** `src/shared/services/mcp/MCPService.ts`

**Purpose:** Integration layer for 13 Model Context Protocol (MCP) servers providing blockchain data, security analysis, and market intelligence.

### 4.2.1 MCP Server Configuration

```typescript
/**
 * MCP server metadata
 */
interface MCPServerConfig {
  id: string;
  name: string;
  package: string;
  version: string;
  capabilities: string[];
  requiresApiKey: boolean;
  envVarName?: string;
}

/**
 * 13 MCP servers for blockchain data, security, and market intelligence
 * Original 8 from FRD v4.0, plus 5 additions from migration queue review
 */
const MCP_SERVERS: MCPServerConfig[] = [
  {
    id: "thegraph",
    name: "The Graph MCP",
    package: "@kukapay/thegraph-mcp",
    version: "^1.0.0",
    capabilities: ["blockchain_queries", "subgraph_data"],
    requiresApiKey: true,
    envVarName: "THEGRAPH_API_KEY",
  },
  {
    id: "coingecko",
    name: "CoinGecko MCP",
    package: "coingecko-mcp",
    version: "^2.0.0",
    capabilities: ["price_data", "market_data", "historical_data"],
    requiresApiKey: true,
    envVarName: "COINGECKO_API_KEY",
  },
  {
    id: "defillama",
    name: "DefiLlama MCP",
    package: "defillama-mcp",
    version: "^1.5.0",
    capabilities: ["tvl_data", "protocol_data", "chain_data"],
    requiresApiKey: false,
  },
  {
    id: "lunarcrush",
    name: "LunarCrush MCP",
    package: "lunarcrush-mcp",
    version: "^3.0.0",
    capabilities: ["social_sentiment", "influencer_data", "galaxy_score"],
    requiresApiKey: true,
    envVarName: "LUNARCRUSH_API_KEY",
  },
  {
    id: "cryptopanic",
    name: "CryptoPanic MCP",
    package: "@kukapay/cryptopanic-mcp",
    version: "^1.2.0",
    capabilities: ["news_aggregation", "sentiment_analysis"],
    requiresApiKey: true,
    envVarName: "CRYPTOPANIC_API_KEY",
  },
  {
    id: "tradingview",
    name: "TradingView MCP",
    package: "@atilaahmettaner/tradingview-mcp",
    version: "^2.1.0",
    capabilities: ["technical_indicators", "chart_data", "screeners"],
    requiresApiKey: false,
  },
  {
    id: "binance",
    name: "Binance MCP",
    package: "@analyticace/binance-mcp",
    version: "^1.0.0",
    capabilities: ["exchange_data", "orderbook", "trades"],
    requiresApiKey: true,
    envVarName: "BINANCE_API_KEY",
  },
  {
    id: "ccxt",
    name: "CCXT MCP",
    package: "ccxt-mcp",
    version: "^4.0.0",
    capabilities: ["multi_exchange", "unified_api", "market_data"],
    requiresApiKey: false,
  },
  // --- Migration Queue Additions (Batch 1) ---
  {
    id: "goplus",
    name: "GoPlus Security MCP",
    package: "@anthropic/goplus-mcp",
    version: "^1.0.0",
    capabilities: ["honeypot_detection", "contract_security", "rugpull_risk", "token_analysis"],
    requiresApiKey: true,
    envVarName: "GOPLUS_API_KEY",
  },
  {
    id: "dexscreener",
    name: "DEX Screener MCP",
    package: "dexscreener-mcp",
    version: "^1.2.0",
    capabilities: ["dex_pairs", "liquidity_data", "new_listings", "price_charts"],
    requiresApiKey: false,  // works without key, but higher rate limits with key
    envVarName: "DEXSCREENER_API_KEY",
  },
  {
    id: "tenderly",
    name: "Tenderly MCP",
    package: "tenderly-mcp",
    version: "^0.5.0",
    capabilities: ["tx_simulation", "gas_estimation", "state_overrides", "trace_analysis"],
    requiresApiKey: true,
    envVarName: "TENDERLY_ACCESS_KEY",
  },
  {
    id: "block_explorer",
    name: "Block Explorer MCP",
    package: "etherscan-mcp",
    version: "^0.6.0",
    capabilities: ["tx_history", "contract_abi", "token_transfers", "gas_tracker"],
    requiresApiKey: true,
    // Multi-chain support: At least one explorer key is required.
    // The `envVarName` value below is used for Ethereum mainnet.
    // The system also auto-detects other chain-specific keys, including:
    // ARBISCAN_API_KEY (Arbitrum), BASESCAN_API_KEY (Base),
    // OPTIMISTIC_ETHERSCAN_API_KEY (Optimism), POLYGONSCAN_API_KEY (Polygon).
    envVarName: "ETHERSCAN_API_KEY",
  },
  {
    id: "coinmarketcap",
    name: "CoinMarketCap MCP",
    package: "coinmarketcap-mcp",
    version: "^1.1.0",
    capabilities: ["price_data", "market_cap", "new_listings", "trending"],
    requiresApiKey: false,  // optional secondary price feed, falls back to CoinGecko
    envVarName: "COINMARKETCAP_API_KEY",
  },
];
```

### 4.2.2 MCP Service Implementation

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * MCP tool definition
 */
interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP tool execution result
 */
interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Custom MCP errors
 */
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

/**
 * MCP Service for managing connections to 8 MCP servers
 */
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

  /**
   * Initialize all MCP server connections
   */
  async initialize(): Promise<Result<void, MCPError>> {
    const initResults: Array<Result<void, MCPError>> = [];

    for (const serverConfig of MCP_SERVERS) {
      const result = await this.initializeServer(serverConfig);
      initResults.push(result);

      if (!result.success) {
        this.logger.warn(`Failed to initialize MCP server: ${serverConfig.name}`, {
          error: result.error.message,
        });
      }
    }

    // Service succeeds even if some servers fail
    return { success: true, data: undefined };
  }

  /**
   * Get available tools from a specific MCP server
   */
  async getTools(serverId: string): Promise<Result<MCPTool[], MCPError>> {
    const client = this.clients.get(serverId);
    if (!client) {
      return {
        success: false,
        error: new MCPError(`MCP server ${serverId} not initialized`, serverId),
      };
    }

    try {
      const response = await client.listTools();
      return {
        success: true,
        value: response.tools.map(t => ({
          name: t.name,
          description: t.description ?? '',
          inputSchema: t.inputSchema,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: new MCPError(
          `Failed to list tools from ${serverId}`,
          serverId,
          error as Error
        ),
      };
    }
  }

  /**
   * Execute a tool on a specific MCP server
   */
  async executeTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<Result<MCPToolResult, MCPError>> {
    // check if server is available (successfully initialized)
    if (!this.availableServers.has(serverId)) {
      return {
        success: false,
        error: new MCPError(`MCP server ${serverId} not available`, serverId),
      };
    }

    const client = this.clients.get(serverId);
    if (!client) {
      return {
        success: false,
        error: new MCPError(`MCP server ${serverId} not initialized`, serverId),
      };
    }

    try {
      this.logger.info('Executing MCP tool', { serverId, toolName, args });

      const result = await client.callTool({
        name: toolName,
        arguments: args,
      });

      return {
        success: true,
        value: result as MCPToolResult,
      };
    } catch (error) {
      return {
        success: false,
        error: new MCPError(
          `Failed to execute tool ${toolName} on ${serverId}`,
          serverId,
          error as Error
        ),
      };
    }
  }

  /**
   * Get all available tools from all servers
   */
  async getAllTools(): Promise<
    Result<Array<{ serverId: string; tools: MCPTool[] }>, MCPError>
  > {
    const allTools: Array<{ serverId: string; tools: MCPTool[] }> = [];

    for (const [serverId] of this.clients) {
      const result = await this.getTools(serverId);
      if (result.success) {
        allTools.push({ serverId, tools: result.value });
      }
    }

    return { success: true, data: allTools };
  }

  /**
   * Shutdown all MCP connections
   */
  async shutdown(): Promise<void> {
    for (const [serverId, client] of this.clients) {
      try {
        await client.close();
        this.logger.info(`Closed MCP connection: ${serverId}`);
      } catch (error) {
        this.logger.error(`Failed to close MCP connection: ${serverId}`, { error });
      }
    }
    this.clients.clear();
  }

  private async initializeServer(
    serverConfig: MCPServerConfig
  ): Promise<Result<void, MCPError>> {
    try {
      // Check API key requirement
      if (serverConfig.requiresApiKey && serverConfig.envVarName) {
        const apiKey = this.config[serverConfig.envVarName];
        if (!apiKey) {
          return {
            success: false,
            error: new MCPError(
              `API key missing for ${serverConfig.name}: ${serverConfig.envVarName}`,
              serverConfig.id
            ),
          };
        }
      }

      // Create client transport
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', serverConfig.package],
        env: {
          ...process.env,
          ...(serverConfig.requiresApiKey &&
          serverConfig.envVarName &&
          this.config[serverConfig.envVarName]
            ? { [serverConfig.envVarName]: this.config[serverConfig.envVarName] }
            : {}),
        },
      });

      // Create and connect client
      const client = new Client(
        {
          name: 'crypto-trading-ai-agent',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await client.connect(transport);

      this.clients.set(serverConfig.id, client);
      this.availableServers.add(serverConfig.id);

      this.logger.info(`Initialized MCP server: ${serverConfig.name}`, {
        capabilities: serverConfig.capabilities,
      });

      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new MCPError(
          `Failed to initialize ${serverConfig.name}`,
          serverConfig.id,
          error as Error
        ),
      };
    }
  }
```

---

## 4.3 Logging Service

**Module:** Structured logging with Pino (ADD v2.1 Section 9.1)

**Purpose:** Provide high-performance JSON logging with context enrichment, child loggers, and log levels for observability.

### 4.3.1 Base Logger Configuration

```typescript
import pino from 'pino';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

/**
 * Create root logger with standard configuration
 */
export function createLogger(serviceName: string): pino.Logger {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: bindings.name,
      }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      env: process.env.NODE_ENV || 'development',
    },
  });
}
```

### 4.3.2 Child Loggers with Context

**Pattern:** Create child loggers for workflows, requests, or trade sessions to automatically include context in all log statements.

```typescript
import type pino from 'pino';
import { nanoid } from 'nanoid';

/**
 * Create child logger for a workflow execution
 */
export function createWorkflowLogger(
  logger: pino.Logger,
  workflowId: string,
  context?: Record<string, unknown>
): pino.Logger {
  return logger.child({
    workflowId,
    executionId: nanoid(),
    ...context,
  });
}

/**
 * Create child logger for an API request
 */
export function createRequestLogger(
  logger: pino.Logger,
  requestId: string,
  method: string,
  path: string
): pino.Logger {
  return logger.child({
    requestId,
    method,
    path,
  });
}

/**
 * Create child logger for a trading session
 */
export function createTradeLogger(
  logger: pino.Logger,
  sessionId: string,
  exchangeId: string,
  symbol: string
): pino.Logger {
  return logger.child({
    sessionId,
    exchangeId,
    symbol,
  });
}
```

### 4.3.3 Usage Patterns

**Pattern 1: Service-Level Logger**

```typescript
import pino from 'pino';
import { createLogger } from './logging';

export class LLMService {
  private logger: pino.Logger;

  constructor(logger: pino.Logger) {
    // create child logger specific to this service
    this.logger = logger.child({ service: 'llm-service' });
  }

  async chat(messages: Message[]): Promise<Result<string, LLMError>> {
    this.logger.info({ messageCount: messages.length }, 'starting llm chat');

    try {
      const response = await this.provider.chat(messages);
      this.logger.info({
        tokens: response.usage.totalTokens,
        cost: response.cost
      }, 'llm chat completed');
      return ok(response.content);
    } catch (error) {
      this.logger.error({ error }, 'llm chat failed');
      return err(new LLMError('chat failed', error));
    }
  }
}
```

**Pattern 2: Workflow Execution Logging**

```typescript
import type pino from 'pino';
import { createWorkflowLogger } from './logging';

export async function executeWorkflow(
  baseLogger: pino.Logger,
  workflowId: string,
  input: unknown
): Promise<Result<unknown, Error>> {
  const logger = createWorkflowLogger(baseLogger, workflowId, { input });

  logger.info('workflow started');

  try {
    const result = await runSteps(logger, input);
    logger.info({ result }, 'workflow completed');
    return ok(result);
  } catch (error) {
    logger.error({ error }, 'workflow failed');
    return err(error);
  }
}
```

**Pattern 3: Log Levels**

```typescript
// debug: detailed diagnostics (not in production)
logger.debug({ query: sql, params }, 'executing database query');

// info: normal operations, workflow milestones
logger.info({ orderId, symbol, quantity }, 'order submitted');

// warn: recoverable errors, degraded performance
logger.warn({ retryCount: 3, error }, 'retrying failed request');

// error: unrecoverable errors requiring attention
logger.error({ error, orderId }, 'order submission failed');

// fatal: system-critical failures (logs and exits)
logger.fatal({ error }, 'database connection lost');
```

### 4.3.4 Production Configuration

**Environment Variables:**
- `LOG_LEVEL`: Set to `info` in production, `debug` in development
- `NODE_ENV`: Set to `production` for optimized logging

**Pretty Printing (Development Only):**

```typescript
import pino from 'pino';

export function createLogger(serviceName: string): pino.Logger {
  const isDev = process.env.NODE_ENV === 'development';

  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    transport: isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  });
}
```

---

## 4.4 Queue Service

**Module:** Job queue abstraction with BullMQ provider (ADD v2.1 Section 10.6)

**Purpose:** Reliable background job processing with retry, priority, and graceful shutdown for workflow orchestration, trade execution, and data collection.

### 4.4.1 Queue Abstraction

```typescript
import { Queue, Worker, Job, QueueOptions, WorkerOptions } from '@satoshibits/queue';
import { Result, ok, err } from '@satoshibits/functional';
import type pino from 'pino';

/**
 * Queue names for different job types
 */
export const QUEUE_NAMES = {
  WORKFLOW: 'workflow-execution',
  TRADE: 'trade-execution',
  DATA_COLLECTION: 'data-collection',
  NOTIFICATIONS: 'notifications',
} as const;

/**
 * Job data types
 */
export interface WorkflowJobData {
  workflowId: string;
  executionId: string;
  input: unknown;
}

export interface TradeJobData {
  orderId: string;
  exchangeId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price?: number;
}

export interface DataCollectionJobData {
  source: string;
  symbol: string;
  timeframe: string;
  startTime: Date;
  endTime: Date;
}
```

### 4.4.2 Queue Setup

```typescript
import { createQueue, createWorker } from '@satoshibits/queue';
import { Redis } from 'ioredis';

/**
 * Initialize queue with BullMQ provider
 */
export function initializeQueue<T = any>(
  queueName: string,
  logger: pino.Logger
): Queue<T> {
  const connection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null, // bullmq requirement
  });

  return createQueue<T>({
    name: queueName,
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // 2s, 4s, 8s
      },
      removeOnComplete: {
        age: 86400, // keep completed jobs for 24 hours
        count: 1000,
      },
      removeOnFail: {
        age: 604800, // keep failed jobs for 7 days
      },
    },
  });
}
```

### 4.4.3 Worker Patterns

**Pattern 1: Basic Worker**

```typescript
import { createWorker, Job } from '@satoshibits/queue';
import type pino from 'pino';

export function createWorkflowWorker(
  logger: pino.Logger,
  executor: WorkflowExecutor
): Worker<WorkflowJobData> {
  return createWorker<WorkflowJobData>({
    name: QUEUE_NAMES.WORKFLOW,
    connection: new Redis(process.env.REDIS_URL!),
    processor: async (job: Job<WorkflowJobData>) => {
      const jobLogger = logger.child({
        jobId: job.id,
        workflowId: job.data.workflowId,
        executionId: job.data.executionId,
      });

      jobLogger.info('processing workflow job');

      const result = await executor.execute(job.data);

      if (result.isErr()) {
        jobLogger.error({ error: result.error }, 'workflow job failed');
        throw result.error; // trigger retry
      }

      jobLogger.info('workflow job completed');
      return result.value;
    },
    concurrency: 5, // process up to 5 jobs in parallel
  });
}
```

**Pattern 2: Priority Queue**

```typescript
import { Queue } from '@satoshibits/queue';

const tradeQueue = initializeQueue<TradeJobData>(QUEUE_NAMES.TRADE, logger);

// high priority for market orders
await tradeQueue.add('market-order', {
  orderId: 'order-123',
  exchangeId: 'binance',
  symbol: 'BTC/USDT',
  side: 'buy',
  quantity: 0.01,
}, {
  priority: 1, // higher priority = processed first
});

// normal priority for limit orders
await tradeQueue.add('limit-order', {
  orderId: 'order-456',
  exchangeId: 'binance',
  symbol: 'BTC/USDT',
  side: 'buy',
  quantity: 0.01,
  price: 50000,
}, {
  priority: 10,
});
```

**Pattern 3: Delayed Jobs**

```typescript
// schedule data collection for 1 hour from now
await dataQueue.add('historical-data', {
  source: 'binance',
  symbol: 'BTC/USDT',
  timeframe: '1h',
  startTime: new Date('2025-01-01'),
  endTime: new Date('2025-01-31'),
}, {
  delay: 3600000, // 1 hour in milliseconds
});
```

### 4.4.4 Error Handling and Retry

```typescript
import { createWorker, Job } from '@satoshibits/queue';
import { Result, ok, err } from '@satoshibits/functional';

export function createTradeWorker(
  logger: pino.Logger,
  tradeService: TradeService
): Worker<TradeJobData> {
  return createWorker<TradeJobData>({
    name: QUEUE_NAMES.TRADE,
    connection: new Redis(process.env.REDIS_URL!),
    processor: async (job: Job<TradeJobData>) => {
      const jobLogger = logger.child({
        jobId: job.id,
        orderId: job.data.orderId,
        attempt: job.attemptsMade + 1,
      });

      jobLogger.info('processing trade job');

      const result = await tradeService.submitOrder(job.data);

      if (result.isErr()) {
        const error = result.error;

        // check if error is retryable
        if (error.code === 'RATE_LIMIT' || error.code === 'NETWORK_ERROR') {
          jobLogger.warn({ error, nextRetry: job.attemptsMade + 1 }, 'retrying job');
          throw error; // trigger retry with exponential backoff
        }

        // non-retryable error (invalid order, insufficient funds)
        jobLogger.error({ error }, 'trade job failed permanently');
        // don't throw - mark job as failed without retry
        return;
      }

      jobLogger.info({ orderId: result.value.id }, 'trade job completed');
      return result.value;
    },
  });
}
```

### 4.4.5 Graceful Shutdown

```typescript
import { Queue, Worker } from '@satoshibits/queue';
import type pino from 'pino';

/**
 * Graceful shutdown handler for queues and workers
 */
export async function shutdownQueues(
  logger: pino.Logger,
  queues: Queue[],
  workers: Worker[]
): Promise<void> {
  logger.info('shutting down queues and workers');

  // close workers first (stop accepting new jobs)
  await Promise.all(workers.map(async (worker) => {
    logger.info({ workerName: worker.name }, 'closing worker');
    await worker.close();
  }));

  // close queues
  await Promise.all(queues.map(async (queue) => {
    logger.info({ queueName: queue.name }, 'closing queue');
    await queue.close();
  }));

  logger.info('all queues and workers closed');
}

// usage in application shutdown
process.on('SIGTERM', async () => {
  await shutdownQueues(logger, [workflowQueue, tradeQueue], [workflowWorker, tradeWorker]);
  process.exit(0);
});
```

---

## 4.5 Notification Service

**File:** `src/shared/services/notifications/NotificationService.ts`

**Purpose:** Send notifications via multiple channels (email, Telegram, SMS) for HITL approval requests and system alerts.

### 4.5.1 Notification Types

```typescript
/**
 * Notification channel types
 */
type NotificationChannel = "email" | "telegram" | "sms";

/**
 * Notification request
 */
interface NotificationRequest {
  userId: number;
  channel: NotificationChannel;
  title: string;
  message: string;
  priority?: "low" | "normal" | "high";
}

/**
 * Custom notification errors
 */
class NotificationError extends Error {
  constructor(
    message: string,
    public channel: NotificationChannel,
    public cause?: Error
  ) {
    super(message);
    this.name = "NotificationError";
  }
}
```

### 4.5.2 Notification Service Implementation

```typescript
import nodemailer from "nodemailer";
import axios from "axios";
import { Pool } from "pg";
import pino from "pino";

/**
 * Notification Service for multi-channel messaging
 */
export class NotificationService {
  private mailTransporter?: nodemailer.Transporter;
  private telegramBotToken?: string;
  private telegramApiUrl = "https://api.telegram.org/bot";

  constructor(
    private db: Pool,
    private logger: pino.Logger,
    private config: {
      // Email (SMTP)
      smtpHost?: string;
      smtpPort?: number;
      smtpUser?: string;
      smtpPassword?: string;
      smtpFrom?: string;
      // Telegram
      telegramBotToken?: string;
      // SMS (future: Twilio)
      twilioAccountSid?: string;
      twilioAuthToken?: string;
      twilioFromNumber?: string;
    }
  ) {
    // Initialize email transporter if SMTP configured
    if (config.smtpHost && config.smtpUser && config.smtpPassword) {
      this.mailTransporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort || 587,
        secure: config.smtpPort === 465,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPassword,
        },
      });
    }

    // Initialize Telegram
    if (config.telegramBotToken) {
      this.telegramBotToken = config.telegramBotToken;
    }
  }

  /**
   * Send notification via specified channel
   */
  async send(
    request: NotificationRequest
  ): Promise<Result<void, NotificationError>> {
    try {
      // Get user's channel-specific address (email, Telegram chat ID, phone)
      const userResult = await this.getUserChannelAddress(
        request.userId,
        request.channel
      );

      if (!userResult.success) {
        return {
          success: false,
          error: new NotificationError(
            `User ${request.userId} has no ${request.channel} address configured`,
            request.channel
          ),
        };
      }

      const address = userResult.value;

      // Send via appropriate channel
      switch (request.channel) {
        case "email":
          return await this.sendEmail(address, request.title, request.message);

        case "telegram":
          return await this.sendTelegram(
            address,
            request.title,
            request.message
          );

        case "sms":
          return await this.sendSMS(address, request.title, request.message);

        default:
          return {
            success: false,
            error: new NotificationError(
              `Unsupported channel: ${request.channel}`,
              request.channel
            ),
          };
      }
    } catch (error) {
      return {
        success: false,
        error: new NotificationError(
          `Failed to send notification: ${(error as Error).message}`,
          request.channel,
          error as Error
        ),
      };
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(
    to: string,
    subject: string,
    text: string
  ): Promise<Result<void, NotificationError>> {
    if (!this.mailTransporter) {
      return {
        success: false,
        error: new NotificationError("Email service not configured", "email"),
      };
    }

    try {
      await this.mailTransporter.sendMail({
        from: this.config.smtpFrom || this.config.smtpUser,
        to,
        subject,
        text,
        html: `<p>${text.replace(/\n/g, "<br>")}</p>`,
      });

      this.logger.info("Email sent", { to, subject });
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new NotificationError(
          `Failed to send email: ${(error as Error).message}`,
          "email",
          error as Error
        ),
      };
    }
  }

  /**
   * Send Telegram notification
   */
  private async sendTelegram(
    chatId: string,
    title: string,
    message: string
  ): Promise<Result<void, NotificationError>> {
    if (!this.telegramBotToken) {
      return {
        success: false,
        error: new NotificationError("Telegram bot not configured", "telegram"),
      };
    }

    try {
      const text = `*${title}*\n\n${message}`;

      await axios.post(
        `${this.telegramApiUrl}${this.telegramBotToken}/sendMessage`,
        {
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
        }
      );

      this.logger.info("Telegram message sent", { chatId, title });
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: new NotificationError(
          `Failed to send Telegram message: ${(error as Error).message}`,
          "telegram",
          error as Error
        ),
      };
    }
  }

  /**
   * Send SMS notification (stub - implement with Twilio)
   */
  private async sendSMS(
    phoneNumber: string,
    title: string,
    message: string
  ): Promise<Result<void, NotificationError>> {
    // TODO: Implement with Twilio
    this.logger.warn("SMS notifications not yet implemented", { phoneNumber });
    return {
      success: false,
      error: new NotificationError("SMS service not yet implemented", "sms"),
    };
  }

  /**
   * Get user's channel-specific address from database
   */
  private async getUserChannelAddress(
    userId: number,
    channel: NotificationChannel
  ): Promise<Result<string, Error>> {
    try {
      let columnName: string;

      switch (channel) {
        case "email":
          columnName = "email";
          break;
        case "telegram":
          columnName = "telegram_chat_id";
          break;
        case "sms":
          columnName = "phone_number";
          break;
        default:
          return {
            success: false,
            error: new Error(`Unknown channel: ${channel}`),
          };
      }

      const result = await this.db.query(
        `SELECT ${columnName} FROM users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0 || !result.rows[0][columnName]) {
        return {
          success: false,
          error: new Error(`User ${userId} has no ${columnName} configured`),
        };
      }

      return {
        success: true,
        value: result.rows[0][columnName],
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
      };
    }
  }
}
```

### 4.5.3 Usage Example

```typescript
// Initialize service
const notificationService = new NotificationService(db, logger, {
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT || "587"),
  smtpUser: process.env.SMTP_USER,
  smtpPassword: process.env.SMTP_PASSWORD,
  smtpFrom: "noreply@crypto-trading-ai.com",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
});

// Send email notification
const result = await notificationService.send({
  userId: 42,
  channel: "email",
  title: "Trade Signal Approval Required",
  message:
    "Your smart-money-tracking workflow requires approval. Review in dashboard.",
  priority: "high",
});

if (!result.success) {
  logger.error("Failed to send notification", { error: result.error });
}
```

---

## 4.6 HITL Service

**File:** `src/shared/services/hitl/HITLService.ts`

**Purpose:** Human-in-the-loop approval queue for trade signals with 24-hour timeout.

### 4.6.1 HITL Types

```typescript
/**
 * Approval request status
 */
type ApprovalStatus = "pending" | "approved" | "rejected" | "timed_out";

/**
 * Approval request
 */
interface ApprovalRequest {
  id: string;
  userId: number;
  workflowIdentifier: string;
  requestData: Record<string, unknown>;
  status: ApprovalStatus;
  timeoutAt: Date;
  createdAt: Date;
  respondedAt?: Date;
  responseReason?: string;
}

/**
 * Notification channel
 */
type NotificationChannel = "email" | "push" | "sms";

class HITLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HITLError";
  }
}
```

### 4.6.2 HITL Service Implementation

```typescript
export class HITLService {
  // 24-hour timeout (FRD FR-HITL-003)
  private readonly TIMEOUT_MS = 24 * 60 * 60 * 1000;

  constructor(
    private db: Pool,
    private logger: pino.Logger,
    private notificationService: NotificationService
  ) {}

  /**
   * Create approval request
   */
  async createApprovalRequest(
    userId: number,
    workflowIdentifier: string,
    requestData: Record<string, unknown>
  ): Promise<Result<ApprovalRequest, HITLError>> {
    const id = randomBytes(16).toString("hex");
    const timeoutAt = new Date(Date.now() + this.TIMEOUT_MS);

    try {
      await this.db.query(
        `INSERT INTO approval_requests (id, user_id, workflow_identifier, request_data, status, timeout_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          userId,
          workflowIdentifier,
          JSON.stringify(requestData),
          "pending",
          timeoutAt,
        ]
      );

      // Send notification
      await this.notificationService.send({
        userId,
        channel: "email",
        title: "Trade Signal Approval Required",
        message: `Your ${workflowIdentifier} workflow requires approval. Review in dashboard.`,
      });

      const request: ApprovalRequest = {
        id,
        userId,
        workflowIdentifier,
        requestData,
        status: "pending",
        timeoutAt,
        createdAt: new Date(),
      };

      this.logger.info("Approval request created", {
        id,
        userId,
        workflowIdentifier,
      });

      return { success: true, data: request };
    } catch (error) {
      return {
        success: false,
        error: new HITLError(
          `Failed to create approval request: ${(error as Error).message}`
        ),
      };
    }
  }

  /**
   * Get approval request by ID
   */
  async getApprovalRequest(
    requestId: string
  ): Promise<Result<ApprovalRequest | null, HITLError>> {
    try {
      const result = await this.db.query(
        "SELECT * FROM approval_requests WHERE id = $1",
        [requestId]
      );

      if (result.rows.length === 0) {
        return { success: true, data: null };
      }

      const row = result.rows[0];
      return {
        success: true,
        value: {
          id: row.id,
          userId: row.user_id,
          workflowIdentifier: row.workflow_identifier,
          requestData: row.request_data,
          status: row.status,
          timeoutAt: row.timeout_at,
          createdAt: row.created_at,
          respondedAt: row.responded_at,
          responseReason: row.response_reason,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: new HITLError(
          `Failed to get approval request: ${(error as Error).message}`
        ),
      };
    }
  }

  /**
   * Approve request
   */
  async approve(
    requestId: string,
    reason?: string
  ): Promise<Result<ApprovalRequest, HITLError>> {
    return this.respond(requestId, "approved", reason);
  }

  /**
   * Reject request
   */
  async reject(
    requestId: string,
    reason?: string
  ): Promise<Result<ApprovalRequest, HITLError>> {
    return this.respond(requestId, "rejected", reason);
  }

  /**
   * Check and timeout expired requests
   */
  async processTimeouts(): Promise<Result<number, HITLError>> {
    try {
      const result = await this.db.query(
        `UPDATE approval_requests
         SET status = 'timed_out', responded_at = NOW()
         WHERE status = 'pending' AND timeout_at < NOW()
         RETURNING id`
      );

      const timedOutCount = result.rowCount ?? 0;

      if (timedOutCount > 0) {
        this.logger.info("Approval requests timed out", {
          count: timedOutCount,
        });
      }

      return { success: true, data: timedOutCount };
    } catch (error) {
      return {
        success: false,
        error: new HITLError(
          `Failed to process timeouts: ${(error as Error).message}`
        ),
      };
    }
  }

  /**
   * Get pending requests for user
   */
  async getPendingRequests(
    userId: number
  ): Promise<Result<ApprovalRequest[], HITLError>> {
    try {
      const result = await this.db.query(
        `SELECT * FROM approval_requests
         WHERE user_id = $1 AND status = 'pending'
         ORDER BY created_at DESC`,
        [userId]
      );

      const requests: ApprovalRequest[] = result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        workflowIdentifier: row.workflow_identifier,
        requestData: row.request_data,
        status: row.status,
        timeoutAt: row.timeout_at,
        createdAt: row.created_at,
        respondedAt: row.responded_at,
        responseReason: row.response_reason,
      }));

      return { success: true, data: requests };
    } catch (error) {
      return {
        success: false,
        error: new HITLError(
          `Failed to get pending requests: ${(error as Error).message}`
        ),
      };
    }
  }

  private async respond(
    requestId: string,
    status: "approved" | "rejected",
    reason?: string
  ): Promise<Result<ApprovalRequest, HITLError>> {
    try {
      const result = await this.db.query(
        `UPDATE approval_requests
         SET status = $1, responded_at = NOW(), response_reason = $2
         WHERE id = $3 AND status = 'pending'
         RETURNING *`,
        [status, reason ?? null, requestId]
      );

      if (result.rows.length === 0) {
        return {
          success: false,
          error: new HITLError("Request not found or already responded"),
        };
      }

      const row = result.rows[0];
      const request: ApprovalRequest = {
        id: row.id,
        userId: row.user_id,
        workflowIdentifier: row.workflow_identifier,
        requestData: row.request_data,
        status: row.status,
        timeoutAt: row.timeout_at,
        createdAt: row.created_at,
        respondedAt: row.responded_at,
        responseReason: row.response_reason,
      };

      this.logger.info("Approval request responded", {
        requestId,
        status,
        reason,
      });

      return { success: true, data: request };
    } catch (error) {
      return {
        success: false,
        error: new HITLError(
          `Failed to respond to request: ${(error as Error).message}`
        ),
      };
    }
  }
}
```

---

## Installation Dependencies

All services require these npm packages:

```bash
npm install --save \
  openai \
  @anthropic-ai/sdk \
  @google/generative-ai \
  @modelcontextprotocol/sdk \
  @satoshibits/queue \
  @satoshibits/functional \
  bullmq \
  ioredis \
  nodemailer \
  axios \
  pino \
  nanoid \
  cockatiel \
  pg

npm install --save-dev \
  @types/nodemailer \
  @types/pg \
  pino-pretty
```

---

## 4.7 Resilience Patterns

**Purpose:** Implement retry, timeout, and circuit breaker patterns for all external API calls using cockatiel.

**Package:** `cockatiel@^3.1.0` (see ADD Section 10.5.4 for architectural rationale)

### 4.7.1 Resilience Policies

**File:** `src/shared/resilience/policies.ts`

```typescript
import {
  CircuitBreaker,
  ExponentialBackoff,
  retry,
  timeout,
  wrap,
} from "cockatiel";

/**
 * MCP service policy - retry + timeout + circuit breaker
 * Use for: The Graph, CoinGecko, DefiLlama, LunarCrush, CryptoPanic, TradingView
 */
export const mcpPolicy = wrap(
  retry(new ExponentialBackoff({ maxAttempts: 3, initialDelay: 1000 })),
  timeout(5000), // 5 second timeout
  new CircuitBreaker({
    halfOpenAfter: 10_000, // Retry after 10 seconds
    breaker: {
      threshold: 0.2, // Open circuit if 20% of requests fail
      duration: 30_000, // Over 30 second window
      minimumRps: 5, // Need at least 5 requests before evaluating
    },
  })
);

/**
 * LLM provider policy - retry + timeout + circuit breaker
 * Use for: OpenAI, Anthropic, Google API calls
 */
export const llmPolicy = wrap(
  retry(new ExponentialBackoff({ maxAttempts: 2, initialDelay: 2000 })),
  timeout(30_000), // 30 second timeout for LLM calls
  new CircuitBreaker({ halfOpenAfter: 15_000 })
);

/**
 * Database policy - retry only (no circuit breaker)
 * Use for: PostgreSQL queries via Kysely
 */
export const dbPolicy = retry(
  new ExponentialBackoff({ maxAttempts: 3, initialDelay: 500 })
);

/**
 * External API policy - aggressive timeout
 * Use for: Binance, other exchange APIs
 */
export const apiPolicy = wrap(
  retry(new ExponentialBackoff({ maxAttempts: 2, initialDelay: 500 })),
  timeout(3000), // 3 second timeout
  new CircuitBreaker({ halfOpenAfter: 5_000 })
);
```

### 4.7.2 Policy Monitoring

**Monitor circuit breaker state for observability:**

```typescript
import { mcpPolicy, llmPolicy } from "./policies";
import logger from "../logging/logger";

// MCP circuit breaker events
mcpPolicy.onBreak(() => {
  logger.error("Circuit breaker opened - MCP service degraded");
});

mcpPolicy.onReset(() => {
  logger.info("Circuit breaker closed - MCP service recovered");
});

mcpPolicy.onHalfOpen(() => {
  logger.warn("Circuit breaker half-open - testing MCP service");
});

// LLM circuit breaker events
llmPolicy.onBreak(() => {
  logger.error("Circuit breaker opened - LLM provider degraded");
});

llmPolicy.onReset(() => {
  logger.info("Circuit breaker closed - LLM provider recovered");
});
```

### 4.7.3 Usage in Services

**Apply resilience policy to external API calls:**

```typescript
import { llmPolicy, mcpPolicy } from "../resilience/policies";
import { Result } from "@satoshibits/functional/result";

// Example: LLM API call with resilience
export class OpenAIProvider implements LLMProvider {
  async generateCompletion(
    messages: Message[],
    options: CompletionOptions = {}
  ): Promise<Result<string, LLMError>> {
    try {
      // Apply resilience policy (retry, timeout, circuit breaker)
      const response = await llmPolicy.execute(async () => {
        return this.client.chat.completions.create({
          model: "gpt-4-turbo-preview",
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1000,
        });
      });

      const content = response.choices[0]?.message?.content ?? "";
      return { success: true, data: content };
    } catch (error) {
      // Handle rate limits, circuit breaker open, timeout, or exhausted retries
      if (error instanceof OpenAI.APIError && error.status === 429) {
        const retryAfter = error.headers?.["retry-after"];
        return {
          success: false,
          error: new LLMRateLimitError(
            "openai",
            retryAfter ? parseInt(retryAfter) * 1000 : undefined
          ),
        };
      }

      return {
        success: false,
        error: new LLMError(
          `Request failed: ${error.message}`,
          "openai",
          error as Error
        ),
      };
    }
  }
}

// Example: MCP API call with resilience
export class CoinGeckoMCP {
  async getPrice(tokenId: string): Promise<Result<number, Error>> {
    try {
      // Apply resilience policy
      const data = await mcpPolicy.execute(async () => {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${tokenId}&vs_currencies=usd`,
          {
            headers: this.apiKey ? { "X-CG-API-Key": this.apiKey } : {},
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
      });

      const price = data[tokenId]?.usd;
      if (!price) {
        return {
          success: false,
          error: new Error(`Token ${tokenId} not found`),
        };
      }

      return { success: true, data: price };
    } catch (error) {
      return {
        success: false,
        error: new Error(`Failed to fetch price: ${error.message}`),
      };
    }
  }
}
```

---

## 4.8 Backtesting Service

**File:** `src/shared/services/backtesting/BacktestingService.ts`

**Purpose:** Strategy validation before live trading (Phase 0 requirement). TypeScript-only implementation to maintain single-language stack.

### 4.8.1 Backtesting Types

```typescript
/**
 * Historical candle data for backtesting
 */
interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Trade signal from strategy
 */
interface Signal {
  type: 'buy' | 'sell' | 'hold';
  symbol: string;
  price: number;
  quantity: number;
  confidence: number;
  reason: string;
}

/**
 * Backtest result metrics
 */
interface BacktestResult {
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  profitableTrades: number;
  trades: BacktestTrade[];
}

/**
 * Active position during backtest
 */
interface Position {
  entryDate: Date;
  entryPrice: number;
  quantity: number;
  side: 'long' | 'short';
}

/**
 * Individual trade in backtest
 */
interface BacktestTrade {
  entryDate: Date;
  exitDate: Date;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  side: 'long' | 'short';
}

/**
 * Strategy interface - same interface for live and backtest
 */
interface Strategy {
  name: string;
  analyze(candles: Candle[], position: Position | null): Promise<Signal>;
}
```

### 4.8.2 Backtesting Engine

```typescript
import type pino from 'pino';
import { Result, ok, err } from '@satoshibits/functional';

/**
 * Event-driven backtesting engine
 * Uses same Strategy interface as live trading for consistency
 */
export class BacktestingService {
  constructor(
    private logger: pino.Logger,
    private config: {
      initialCapital: number;
      slippageBps: number;  // basis points
      commissionBps: number;
    }
  ) {}

  /**
   * Run backtest on historical data
   */
  async runBacktest(
    strategy: Strategy,
    candles: Candle[],
    symbol: string
  ): Promise<Result<BacktestResult, Error>> {
    const startTime = Date.now();
    let capital = this.config.initialCapital;
    let position: Position | null = null;
    const trades: BacktestTrade[] = [];

    this.logger.info('Starting backtest', {
      strategy: strategy.name,
      symbol,
      candleCount: candles.length,
      initialCapital: capital,
    });

    try {
      // iterate through candles chronologically
      for (let i = 50; i < candles.length; i++) {
        const historicalCandles = candles.slice(0, i + 1);
        const currentCandle = candles[i];

        // get signal from strategy
        const signal = await strategy.analyze(historicalCandles, position);

        // execute signal
        if (signal.type === 'buy' && !position) {
          const slippage = currentCandle.close * (this.config.slippageBps / 10000);
          const entryPrice = currentCandle.close + slippage;
          const commission = entryPrice * signal.quantity * (this.config.commissionBps / 10000);

          position = {
            entryDate: currentCandle.timestamp,
            entryPrice,
            quantity: signal.quantity,
            side: 'long',
          };
          capital -= commission;
        } else if (signal.type === 'sell' && position) {
          const slippage = currentCandle.close * (this.config.slippageBps / 10000);
          const exitPrice = currentCandle.close - slippage;
          const commission = exitPrice * position.quantity * (this.config.commissionBps / 10000);

          const pnl = (exitPrice - position.entryPrice) * position.quantity - commission;

          trades.push({
            entryDate: position.entryDate,
            exitDate: currentCandle.timestamp,
            entryPrice: position.entryPrice,
            exitPrice,
            quantity: position.quantity,
            pnl,
            pnlPercent: (exitPrice - position.entryPrice) / position.entryPrice * 100,
            side: position.side,
          });

          capital += pnl;
          position = null;
        }
      }

      // calculate metrics
      const result = this.calculateMetrics(trades, capital, candles, symbol);

      this.logger.info('Backtest completed', {
        strategy: strategy.name,
        durationMs: Date.now() - startTime,
        totalReturn: result.totalReturn,
        sharpeRatio: result.sharpeRatio,
      });

      return ok(result);
    } catch (error) {
      return err(error as Error);
    }
  }

  private calculateMetrics(
    trades: BacktestTrade[],
    finalCapital: number,
    candles: Candle[],
    symbol: string
  ): BacktestResult {
    const profitableTrades = trades.filter(t => t.pnl > 0).length;
    const returns = trades.map(t => t.pnlPercent);

    // sharpe ratio (simplified - annualized)
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length || 0;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    ) || 1;
    const sharpeRatio = (avgReturn / stdDev) * Math.sqrt(252);

    // max drawdown
    let peak = this.config.initialCapital;
    let maxDrawdown = 0;
    let runningCapital = this.config.initialCapital;
    for (const trade of trades) {
      runningCapital += trade.pnl;
      if (runningCapital > peak) peak = runningCapital;
      const drawdown = (peak - runningCapital) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      symbol,
      startDate: candles[0].timestamp,
      endDate: candles[candles.length - 1].timestamp,
      initialCapital: this.config.initialCapital,
      finalCapital,
      totalReturn: (finalCapital - this.config.initialCapital) / this.config.initialCapital * 100,
      sharpeRatio,
      maxDrawdown: maxDrawdown * 100,
      winRate: trades.length > 0 ? (profitableTrades / trades.length) * 100 : 0,
      totalTrades: trades.length,
      profitableTrades,
      trades,
    };
  }
}
```

---

## 4.9 Wallet Service

**File:** `src/shared/services/wallet/WalletService.ts`

**Purpose:** Secure transaction signing using Safe multi-sig with pre-sign security validation (PhishFort, GoPlus).

**Package:** `@safe-global/protocol-kit@^4.0.0` (L2-first: supports Arbitrum, Base, Optimism, Polygon)

### 4.9.1 Wallet Types

```typescript
import { SafeTransaction } from '@safe-global/safe-core-sdk-types';

/**
 * Supported chains for Safe multi-sig
 */
type SupportedChain = 'arbitrum' | 'base' | 'optimism' | 'polygon' | 'ethereum';

/**
 * Transaction proposal for Safe execution
 */
interface TransactionProposal {
  to: string;
  value: string;
  data: string;
  operation: 0 | 1;  // 0 = Call, 1 = DelegateCall
  safeTxGas?: string;
  baseGas?: string;
  gasPrice?: string;
}

/**
 * Pre-sign security check result
 */
interface SecurityCheckResult {
  passed: boolean;
  checks: {
    phishfort: { passed: boolean; reason?: string };
    goplus: { passed: boolean; riskScore?: number; reason?: string };
    blocklist: { passed: boolean; reason?: string };
  };
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Wallet service errors
 */
class WalletError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'WalletError';
  }
}
```

### 4.9.2 Pre-Sign Security Middleware

```typescript
/**
 * Security validation before any transaction signing
 * Combines PhishFort, GoPlus, and custom blocklist
 */
export class PreSignSecurityCheck {
  constructor(
    private logger: pino.Logger,
    private config: {
      phishfortApiKey?: string;
      goplusApiKey: string;
      customBlocklist: Set<string>;
    }
  ) {}

  /**
   * Run all security checks before signing
   */
  async validate(
    targetAddress: string,
    chainId: number
  ): Promise<Result<SecurityCheckResult, Error>> {
    const checks: SecurityCheckResult['checks'] = {
      phishfort: { passed: true },
      goplus: { passed: true },
      blocklist: { passed: true },
    };

    // 1. custom blocklist check (instant)
    if (this.config.customBlocklist.has(targetAddress.toLowerCase())) {
      checks.blocklist = { passed: false, reason: 'Address in custom blocklist' };
    }

    // 2. phishfort check (if configured)
    if (this.config.phishfortApiKey) {
      try {
        const response = await fetch(
          `https://api.phishfort.com/v1/check/${targetAddress}`,
          { headers: { 'Authorization': `Bearer ${this.config.phishfortApiKey}` } }
        );
        const data = await response.json();
        if (data.isPhishing) {
          checks.phishfort = { passed: false, reason: 'Flagged as phishing by PhishFort' };
        }
      } catch (error) {
        this.logger.warn('PhishFort check failed', { error });
        // fail open for PhishFort - it's supplementary
      }
    }

    // 3. goplus contract security check
    try {
      const response = await fetch(
        `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${targetAddress}`,
        { headers: { 'Authorization': this.config.goplusApiKey } }
      );
      const data = await response.json();
      const result = data.result?.[targetAddress.toLowerCase()];

      if (result) {
        const isHoneypot = result.is_honeypot === '1';
        const riskScore = parseInt(result.trust_list || '0');

        if (isHoneypot) {
          checks.goplus = { passed: false, riskScore, reason: 'Detected as honeypot' };
        } else if (riskScore > 70) {
          checks.goplus = { passed: false, riskScore, reason: `High risk score: ${riskScore}` };
        } else {
          checks.goplus = { passed: true, riskScore };
        }
      }
    } catch (error) {
      this.logger.warn('GoPlus check failed', { error });
      // fail closed for GoPlus - it's critical
      checks.goplus = { passed: false, reason: 'GoPlus check failed - failing safe' };
    }

    // determine overall risk
    const failedChecks = Object.values(checks).filter(c => !c.passed);
    let overallRisk: SecurityCheckResult['overallRisk'] = 'low';

    if (failedChecks.length > 0) {
      overallRisk = failedChecks.length >= 2 ? 'critical' : 'high';
    }

    return ok({
      passed: failedChecks.length === 0,
      checks,
      overallRisk,
    });
  }
}
```

### 4.9.3 Wallet Service Implementation

```typescript
import Safe from '@safe-global/protocol-kit';
import { EthersAdapter } from '@safe-global/protocol-kit';
import { ethers } from 'ethers';

/**
 * Wallet Service for Safe multi-sig operations
 * All transactions go through pre-sign security validation
 */
export class WalletService {
  private safe?: Safe;
  private securityCheck: PreSignSecurityCheck;

  constructor(
    private logger: pino.Logger,
    private config: {
      safeAddress: string;
      signerPrivateKey: string;
      rpcUrl: string;
      chainId: number;
      phishfortApiKey?: string;
      goplusApiKey: string;
      customBlocklist?: string[];
    }
  ) {
    this.securityCheck = new PreSignSecurityCheck(logger, {
      phishfortApiKey: config.phishfortApiKey,
      goplusApiKey: config.goplusApiKey,
      customBlocklist: new Set(config.customBlocklist?.map(a => a.toLowerCase()) || []),
    });
  }

  /**
   * Initialize Safe SDK connection
   */
  async initialize(): Promise<Result<void, WalletError>> {
    try {
      const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      const signer = new ethers.Wallet(this.config.signerPrivateKey, provider);

      // create EthersAdapter for Safe SDK v4
      const ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: signer,
      });

      this.safe = await Safe.create({
        ethAdapter,
        safeAddress: this.config.safeAddress,
      });

      this.logger.info('Wallet service initialized', {
        safeAddress: this.config.safeAddress,
        chainId: this.config.chainId,
      });

      return ok(undefined);
    } catch (error) {
      return err(new WalletError(
        `Failed to initialize Safe: ${(error as Error).message}`,
        'INIT_FAILED'
      ));
    }
  }

  /**
   * Propose and sign transaction with security validation
   */
  async proposeTransaction(
    proposal: TransactionProposal
  ): Promise<Result<SafeTransaction, WalletError>> {
    if (!this.safe) {
      return err(new WalletError('Wallet not initialized', 'NOT_INITIALIZED'));
    }

    // pre-sign security check
    const securityResult = await this.securityCheck.validate(
      proposal.to,
      this.config.chainId
    );

    if (!securityResult.success) {
      return err(new WalletError('Security check failed', 'SECURITY_ERROR'));
    }

    if (!securityResult.data.passed) {
      this.logger.error('Transaction blocked by security check', {
        target: proposal.to,
        checks: securityResult.data.checks,
        overallRisk: securityResult.data.overallRisk,
      });
      return err(new WalletError(
        `Security check failed: ${securityResult.data.overallRisk} risk`,
        'SECURITY_BLOCKED'
      ));
    }

    try {
      // create safe transaction
      const safeTransaction = await this.safe.createTransaction({
        transactions: [{
          to: proposal.to,
          value: proposal.value,
          data: proposal.data,
          operation: proposal.operation,
        }],
      });

      // sign the transaction
      const signedTx = await this.safe.signTransaction(safeTransaction);

      this.logger.info('Transaction proposed and signed', {
        to: proposal.to,
        value: proposal.value,
        safeTxHash: signedTx.getHash(),
      });

      return ok(signedTx);
    } catch (error) {
      return err(new WalletError(
        `Failed to propose transaction: ${(error as Error).message}`,
        'PROPOSE_FAILED'
      ));
    }
  }

  /**
   * Execute a fully signed Safe transaction
   */
  async executeTransaction(
    signedTx: SafeTransaction
  ): Promise<Result<string, WalletError>> {
    if (!this.safe) {
      return err(new WalletError('Wallet not initialized', 'NOT_INITIALIZED'));
    }

    try {
      const executionResult = await this.safe.executeTransaction(signedTx);
      const txHash = executionResult.hash;

      this.logger.info('Transaction executed', { txHash });

      return ok(txHash);
    } catch (error) {
      return err(new WalletError(
        `Failed to execute transaction: ${(error as Error).message}`,
        'EXECUTE_FAILED'
      ));
    }
  }
}
```

---

## 4.10 Portfolio Service

**File:** `src/shared/services/portfolio/PortfolioService.ts`

**Purpose:** Aggregate wallet holdings across L2 chains using DeBank API.

### 4.10.1 Portfolio Types

```typescript
/**
 * Token holding across chains
 */
interface TokenHolding {
  chainId: string;
  tokenAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  balanceUsd: number;
  price: number;
  priceChange24h: number;
}

/**
 * DeFi protocol position
 */
interface ProtocolPosition {
  protocolId: string;
  protocolName: string;
  chainId: string;
  positionType: 'lending' | 'liquidity' | 'staking' | 'farming' | 'other';
  supplyUsd: number;
  borrowUsd: number;
  rewardUsd: number;
  netUsd: number;
}

/**
 * Complete portfolio snapshot
 */
interface PortfolioSnapshot {
  walletAddress: string;
  timestamp: Date;
  totalUsd: number;
  tokens: TokenHolding[];
  protocols: ProtocolPosition[];
  chainBreakdown: Record<string, number>;
}
```

### 4.10.2 Portfolio Service Implementation

```typescript
import type pino from 'pino';
import type { Redis } from 'ioredis';
import { Result, ok, err } from '@satoshibits/functional';

/**
 * Portfolio Service using DeBank API
 * Provides L2-first portfolio aggregation
 */
export class PortfolioService {
  private readonly debankApiUrl = 'https://pro-openapi.debank.com/v1';

  constructor(
    private logger: pino.Logger,
    private config: {
      debankApiKey: string;
      cacheTtlSeconds: number;
    },
    private redis?: Redis
  ) {}

  /**
   * Get complete portfolio for wallet address
   */
  async getPortfolio(
    walletAddress: string
  ): Promise<Result<PortfolioSnapshot, Error>> {
    // check cache first
    if (this.redis) {
      const cached = await this.redis.get(`portfolio:${walletAddress}`);
      if (cached) {
        return ok(JSON.parse(cached));
      }
    }

    try {
      // fetch token balances and protocol positions in parallel
      const [tokensResult, protocolsResult] = await Promise.all([
        this.fetchTokenBalances(walletAddress),
        this.fetchProtocolPositions(walletAddress),
      ]);

      if (!tokensResult.success) return tokensResult;
      if (!protocolsResult.success) return protocolsResult;

      const tokens = tokensResult.data;
      const protocols = protocolsResult.data;

      // calculate totals
      const tokenTotal = tokens.reduce((sum, t) => sum + t.balanceUsd, 0);
      const protocolTotal = protocols.reduce((sum, p) => sum + p.netUsd, 0);
      const totalUsd = tokenTotal + protocolTotal;

      // chain breakdown
      const chainBreakdown: Record<string, number> = {};
      for (const token of tokens) {
        chainBreakdown[token.chainId] = (chainBreakdown[token.chainId] || 0) + token.balanceUsd;
      }
      for (const protocol of protocols) {
        chainBreakdown[protocol.chainId] = (chainBreakdown[protocol.chainId] || 0) + protocol.netUsd;
      }

      const snapshot: PortfolioSnapshot = {
        walletAddress,
        timestamp: new Date(),
        totalUsd,
        tokens,
        protocols,
        chainBreakdown,
      };

      // cache result
      if (this.redis) {
        await this.redis.setex(
          `portfolio:${walletAddress}`,
          this.config.cacheTtlSeconds,
          JSON.stringify(snapshot)
        );
      }

      this.logger.info('Portfolio fetched', {
        walletAddress,
        totalUsd,
        tokenCount: tokens.length,
        protocolCount: protocols.length,
      });

      return ok(snapshot);
    } catch (error) {
      return err(error as Error);
    }
  }

  private async fetchTokenBalances(
    walletAddress: string
  ): Promise<Result<TokenHolding[], Error>> {
    try {
      const response = await fetch(
        `${this.debankApiUrl}/user/all_token_list?id=${walletAddress}`,
        {
          headers: { 'AccessKey': this.config.debankApiKey },
        }
      );

      if (!response.ok) {
        throw new Error(`DeBank API error: ${response.status}`);
      }

      const data = await response.json();

      const tokens: TokenHolding[] = data.map((t: any) => ({
        chainId: t.chain,
        tokenAddress: t.id,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        balance: t.raw_amount_hex_str,
        balanceUsd: t.amount * t.price,
        price: t.price,
        priceChange24h: t.price_24h_change || 0,
      }));

      return ok(tokens);
    } catch (error) {
      return err(error as Error);
    }
  }

  private async fetchProtocolPositions(
    walletAddress: string
  ): Promise<Result<ProtocolPosition[], Error>> {
    try {
      const response = await fetch(
        `${this.debankApiUrl}/user/all_complex_protocol_list?id=${walletAddress}`,
        {
          headers: { 'AccessKey': this.config.debankApiKey },
        }
      );

      if (!response.ok) {
        throw new Error(`DeBank API error: ${response.status}`);
      }

      const data = await response.json();

      const protocols: ProtocolPosition[] = data.map((p: any) => ({
        protocolId: p.id,
        protocolName: p.name,
        chainId: p.chain,
        positionType: this.mapPositionType(p.portfolio_item_list?.[0]?.name),
        supplyUsd: p.net_usd_value > 0 ? p.net_usd_value : 0,
        borrowUsd: p.net_usd_value < 0 ? Math.abs(p.net_usd_value) : 0,
        rewardUsd: 0,
        netUsd: p.net_usd_value,
      }));

      return ok(protocols);
    } catch (error) {
      return err(error as Error);
    }
  }

  private mapPositionType(name?: string): ProtocolPosition['positionType'] {
    if (!name) return 'other';
    const lower = name.toLowerCase();
    if (lower.includes('lend') || lower.includes('supply')) return 'lending';
    if (lower.includes('liquidity') || lower.includes('lp')) return 'liquidity';
    if (lower.includes('stake')) return 'staking';
    if (lower.includes('farm') || lower.includes('yield')) return 'farming';
    return 'other';
  }
}
```

---

## Environment Variables Required

All services require these variables from TSD-Configuration.md:

```bash
# LLM Service
OPENAI_API_KEY="sk-..."
ANTHROPIC_API_KEY="sk-ant-..."
GOOGLE_API_KEY="..."
LLM_COST_BUDGET_USD=50

# MCP Service (13 servers)
THEGRAPH_API_KEY="..."
COINGECKO_API_KEY="CG-..."
DEFILLAMA_API_KEY="..."  # Optional - has free tier
LUNARCRUSH_API_KEY="..."
CRYPTOPANIC_API_KEY="..."
BINANCE_API_KEY="..."
BINANCE_API_SECRET="..."
# Migration Queue Additions (Batch 1)
GOPLUS_API_KEY="..."  # Required - honeypot/rugpull detection
DEXSCREENER_API_KEY="..."  # Optional - subject to public rate limits if omitted
TENDERLY_ACCESS_KEY="..."  # Required - transaction simulation
TENDERLY_PROJECT="..."
TENDERLY_ACCOUNT="..."
# Block Explorer API Keys (L2-first)
ETHERSCAN_API_KEY="..."  # Ethereum mainnet
ARBISCAN_API_KEY="..."  # Arbitrum
BASESCAN_API_KEY="..."  # Base
OPTIMISTIC_ETHERSCAN_API_KEY="..."  # Optimism
POLYGONSCAN_API_KEY="..."  # Polygon
COINMARKETCAP_API_KEY="..."  # Optional - professional tier access

# Auth Service
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-min-32-chars"
JWT_EXPIRY="15m"
JWT_REFRESH_EXPIRY="7d"

# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/crypto_trading_ai"
```

---

## Next Steps

1. Implement Anthropic and Google LLM providers following OpenAI pattern
2. Create NotificationService for HITL email/push notifications
3. Implement service health checks for monitoring
4. Add integration tests for each service

---

**Related Modules:**

- [TSD-Database.md](./04-TSD-Database.md) - Database schemas used by services
- [TSD-Configuration.md](./04-TSD-Configuration.md) - Environment variables
- [TSD-API.md](./04-TSD-API.md) - REST endpoints using these services
- [TSD-DevOps.md](./04-TSD-DevOps.md) - Service deployment configuration

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | January 21, 2025 | Initial TSD-Services with 8 MCP servers |
| 2.1 | January 15, 2026 | Migration Queue Batch 1: Added 5 MCP servers (GoPlus, DEX Screener, Tenderly, Block Explorer, CoinMarketCap); Block Explorer supports multi-chain (Arbiscan, Basescan, etc.); Updated env vars with L2 explorer keys |
