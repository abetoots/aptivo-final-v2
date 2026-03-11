---
id: TSD-LLM-GATEWAY
title: LLM Gateway Specification
status: Draft
version: 1.1.0
owner: '@owner'
last_updated: '2026-02-03'
parent: ../../03-architecture/platform-core-add.md
domain: core
---

# LLM Gateway Specification

**Platform Core – LLM Provider Abstraction & Cost Tracking**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.1.0 | 2026-02-03 | Document Consolidation | Merged comprehensive schemas and provider implementations |
| v1.0.0 | 2026-02-03 | Multi-Model Consensus | Initial creation |

---

## 1. Overview

The LLM Gateway provides provider abstraction and cost tracking for all AI operations. This is a **BRD-mandated requirement** (BO-CORE-003: "LLM costs tracked per workflow").

**FRD Reference**: FR-CORE-LLM-001 to FR-CORE-LLM-003

### 1.1 Why Custom Build (Not Buy)

| Reason | Explanation |
|--------|-------------|
| BRD Requirement | BO-CORE-003 explicitly requires per-workflow cost tracking |
| Budget Enforcement | Must block requests when budget exceeded |
| Provider Flexibility | Switch providers without code changes |

### 1.2 Phase 1 Scope

| Feature | Phase 1 | Phase 2+ |
|---------|---------|----------|
| Provider abstraction | ✅ | ✅ |
| Per-workflow cost logging | ✅ | ✅ |
| Daily/monthly budget caps | ✅ | ✅ |
| Multi-provider routing | ❌ | ✅ |
| Basic one-hop fallback | ✅ | ✅ |
| Advanced routing/optimization | ❌ | ✅ |
| Model benchmarking | ❌ | ✅ |
| Streaming support | ✅ | ✅ |
| Tool/function calling | ✅ | ✅ |

---

## 2. Provider Abstraction

### 2.1 Provider Interface

```typescript
interface LLMProvider {
  id: string;
  name: string;

  // capabilities
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsTools: boolean;

  // operations
  complete(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>>;
  stream(request: CompletionRequest): AsyncGenerator<StreamChunk, void, unknown>;
  embed(request: EmbeddingRequest): Promise<Result<EmbeddingResponse, LLMError>>;

  // health
  isAvailable(): Promise<boolean>;

  // cost
  estimateCost(model: string, tokens: TokenCount): number;
}

interface CompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  responseFormat?: 'text' | 'json';
  // context for tracking
  workflowId?: string;
  workflowStepId?: string;
  domain: 'crypto' | 'hr' | 'core';
}

interface CompletionResponse {
  id: string;
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: ToolCall[];
}

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  name?: string;
  toolCallId?: string;
}
```

### 2.2 Provider Implementations

```typescript
// lib/llm-providers/openai.ts
class OpenAIProvider implements LLMProvider {
  id = 'openai';
  name = 'OpenAI';
  supportsStreaming = true;
  supportsVision = true;
  supportsTools = true;

  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>> {
    try {
      const response = await this.client.chat.completions.create({
        model: request.model,
        messages: this.mapMessages(request.messages),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        tools: request.tools ? this.mapTools(request.tools) : undefined,
      });

      return Result.ok({
        id: response.id,
        content: response.choices[0].message.content ?? '',
        finishReason: this.mapFinishReason(response.choices[0].finish_reason),
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        toolCalls: response.choices[0].message.tool_calls?.map(this.mapToolCall),
      });
    } catch (error) {
      return Result.err(this.mapError(error));
    }
  }

  estimateCost(model: string, tokens: TokenCount): number {
    const pricing = OPENAI_PRICING[model];
    if (!pricing) return 0;
    return (tokens.prompt * pricing.input + tokens.completion * pricing.output) / 1_000_000;
  }
}

// lib/llm-providers/anthropic.ts
class AnthropicProvider implements LLMProvider {
  id = 'anthropic';
  name = 'Anthropic';
  supportsStreaming = true;
  supportsVision = true;
  supportsTools = true;

  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>> {
    try {
      const response = await this.client.messages.create({
        model: request.model,
        messages: this.mapMessages(request.messages),
        max_tokens: request.maxTokens || 1024,
      });

      return Result.ok({
        id: response.id,
        content: response.content[0].type === 'text' ? response.content[0].text : '',
        finishReason: this.mapStopReason(response.stop_reason),
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      });
    } catch (error) {
      return Result.err(this.mapError(error));
    }
  }

  estimateCost(model: string, tokens: TokenCount): number {
    const pricing = ANTHROPIC_PRICING[model];
    if (!pricing) return 0;
    return (tokens.prompt * pricing.input + tokens.completion * pricing.output) / 1_000_000;
  }
}
```

---

## 3. Database Schema (Drizzle ORM)

### 3.1 LLM Usage Logs Table

```typescript
export const llmUsageLogs = pgTable('llm_usage_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  // workflow context
  workflowId: uuid('workflow_id'),
  workflowStepId: varchar('workflow_step_id', { length: 100 }),
  domain: varchar('domain', { length: 50 }).notNull(), // 'hr', 'crypto', 'core'
  // provider details
  provider: varchar('provider', { length: 50 }).notNull(), // 'openai', 'anthropic', 'google'
  model: varchar('model', { length: 100 }).notNull(),
  // token counts
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  // cost (USD)
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
  // request metadata
  requestType: varchar('request_type', { length: 50 }), // 'completion', 'embedding', 'vision'
  latencyMs: integer('latency_ms'),
  // fallback tracking
  wasFallback: boolean('was_fallback').default(false),
  primaryProvider: varchar('primary_provider', { length: 50 }),
  // timing
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  workflowIdx: index('llm_usage_logs_workflow_id_idx').on(table.workflowId),
  domainIdx: index('llm_usage_logs_domain_idx').on(table.domain),
  timestampIdx: index('llm_usage_logs_timestamp_idx').on(table.timestamp),
  providerIdx: index('llm_usage_logs_provider_idx').on(table.provider),
}));
```

### 3.2 LLM Budget Configs Table

```typescript
export const llmBudgetConfigs = pgTable('llm_budget_configs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  domain: varchar('domain', { length: 50 }).notNull().unique(),
  // daily budget
  dailyLimitUsd: numeric('daily_limit_usd', { precision: 10, scale: 2 }).notNull(),
  dailyWarningThreshold: numeric('daily_warning_threshold', { precision: 3, scale: 2 }).default('0.90'), // 90%
  // monthly budget
  monthlyLimitUsd: numeric('monthly_limit_usd', { precision: 10, scale: 2 }).notNull(),
  monthlyWarningThreshold: numeric('monthly_warning_threshold', { precision: 3, scale: 2 }).default('0.90'),
  // behavior
  blockOnExceed: boolean('block_on_exceed').default(true),
  notifyOnWarning: boolean('notify_on_warning').default(true),
  // audit
  ...timestamps,
});
```

---

## 4. Cost Tracking

### 4.1 Pricing Tables

```typescript
// lib/llm-pricing.ts

// pricing per 1M tokens (as of 2026-02)
const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
};

const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku': { input: 0.25, output: 1.25 },
};

const GOOGLE_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-1.5-pro': { input: 3.50, output: 10.50 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
};

export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = { ...OPENAI_PRICING, ...ANTHROPIC_PRICING, ...GOOGLE_PRICING }[model];
  if (!pricing) {
    console.warn(`Unknown model pricing: ${model}, using gpt-4o-mini rates`);
    return calculateCost('gpt-4o-mini', promptTokens, completionTokens);
  }

  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}
```

### 3.3 Usage Logging

```typescript
// lib/llm-gateway.ts
async function logUsage(
  request: CompletionRequest,
  response: CompletionResponse,
  provider: string
): Promise<void> {
  const cost = calculateCost(
    response.model,
    response.usage.promptTokens,
    response.usage.completionTokens
  );

  await db.llmUsageLogs.insert({
    workflowId: request.workflowId,
    domain: request.domain,
    provider,
    model: response.model,
    promptTokens: response.usage.promptTokens,
    completionTokens: response.usage.completionTokens,
    costUsd: cost,
  });
}
```

---

## 4. Budget Enforcement

### 4.1 Budget Configuration

```typescript
// config/llm-budgets.ts
export const LLM_BUDGETS = {
  daily: {
    crypto: 25,  // $25/day
    hr: 10,      // $10/day
    core: 5,     // $5/day
  },
  monthly: {
    crypto: 400, // $400/month
    hr: 150,     // $150/month
    core: 50,    // $50/month
  },
  warningThreshold: 0.9, // warn at 90%
};
```

### 4.2 Budget Check

```typescript
// lib/llm-budget.ts
interface BudgetStatus {
  dailyUsed: number;
  dailyLimit: number;
  dailyExceeded: boolean;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyExceeded: boolean;
  warningAt90: boolean;
}

export async function checkBudget(domain: 'crypto' | 'hr' | 'core'): Promise<BudgetStatus> {
  const [dailyResult, monthlyResult] = await Promise.all([
    db.query(`
      SELECT COALESCE(SUM(cost_usd), 0) as total
      FROM llm_usage_logs
      WHERE domain = $1 AND timestamp >= date_trunc('day', NOW())
    `, [domain]),
    db.query(`
      SELECT COALESCE(SUM(cost_usd), 0) as total
      FROM llm_usage_logs
      WHERE domain = $1 AND timestamp >= date_trunc('month', NOW())
    `, [domain]),
  ]);

  const dailyUsed = parseFloat(dailyResult.rows[0].total);
  const monthlyUsed = parseFloat(monthlyResult.rows[0].total);
  const dailyLimit = LLM_BUDGETS.daily[domain];
  const monthlyLimit = LLM_BUDGETS.monthly[domain];

  return {
    dailyUsed,
    dailyLimit,
    dailyExceeded: dailyUsed >= dailyLimit,
    monthlyUsed,
    monthlyLimit,
    monthlyExceeded: monthlyUsed >= monthlyLimit,
    warningAt90:
      dailyUsed >= dailyLimit * LLM_BUDGETS.warningThreshold ||
      monthlyUsed >= monthlyLimit * LLM_BUDGETS.warningThreshold,
  };
}
```

### 4.3 Gateway with Budget Enforcement

```typescript
// lib/llm-gateway.ts
export async function complete(
  request: CompletionRequest
): Promise<Result<CompletionResponse, LLMError>> {
  // check budget before request
  const budget = await checkBudget(request.domain);

  if (budget.dailyExceeded) {
    return Result.err({
      code: 'DAILY_BUDGET_EXCEEDED',
      message: `Daily LLM budget exceeded for ${request.domain}`,
      budget,
    });
  }

  if (budget.monthlyExceeded) {
    return Result.err({
      code: 'MONTHLY_BUDGET_EXCEEDED',
      message: `Monthly LLM budget exceeded for ${request.domain}`,
      budget,
    });
  }

  // warn if approaching limit
  if (budget.warningAt90) {
    console.warn(`LLM budget warning: ${request.domain} at 90%+`, budget);
  }

  // determine provider from model
  const provider = getProviderForModel(request.model);

  try {
    const response = provider === 'openai'
      ? await callOpenAI(request)
      : await callAnthropic(request);

    // log usage
    await logUsage(request, response, provider);

    return Result.ok(response);
  } catch (error) {
    return Result.err({
      code: 'LLM_REQUEST_FAILED',
      message: error.message,
      provider,
    });
  }
}

function getProviderForModel(model: string): 'openai' | 'anthropic' {
  if (model.startsWith('gpt-') || model.startsWith('o1')) return 'openai';
  if (model.startsWith('claude-')) return 'anthropic';
  throw new Error(`Unknown model: ${model}`);
}
```

---

## 5. Usage in Workflows

```typescript
// workflows/smart-money.ts
import { inngest } from '../client';
import { llmGateway } from '../lib/llm-gateway';

export const smartMoneyWorkflow = inngest.createFunction(
  { id: 'smart-money-tracking' },
  { event: 'crypto/wallet.transaction' },
  async ({ event, step }) => {
    // use llm gateway with automatic cost tracking
    const reasoning = await step.run('generate-reasoning', async () => {
      const result = await llmGateway.complete({
        model: 'gpt-4o-mini', // cost-effective for analysis
        messages: [
          { role: 'system', content: 'Analyze this crypto transaction...' },
          { role: 'user', content: JSON.stringify(event.data) },
        ],
        workflowId: event.id,
        domain: 'crypto',
      });

      if (!result.ok) {
        throw new Error(result.error.message);
      }

      return result.value.content;
    });

    // ... continue workflow
  }
);
```

---

## 6. Monitoring & Alerts

```typescript
// scheduled job: budget alerts
export const budgetAlerts = inngest.createFunction(
  { id: 'llm-budget-alerts' },
  { cron: '0 * * * *' }, // every hour
  async ({ step }) => {
    const domains = ['crypto', 'hr', 'core'] as const;

    for (const domain of domains) {
      const budget = await step.run(`check-${domain}`, () => checkBudget(domain));

      if (budget.warningAt90) {
        await step.run(`alert-${domain}`, async () => {
          await novu.trigger('llm-budget-warning', {
            to: { subscriberId: 'admin' },
            payload: {
              domain,
              dailyUsed: budget.dailyUsed.toFixed(2),
              dailyLimit: budget.dailyLimit,
              monthlyUsed: budget.monthlyUsed.toFixed(2),
              monthlyLimit: budget.monthlyLimit,
            },
          });
        });
      }
    }
  }
);
```

---

## 7. Model Fallback Mapping

### 7.1 Fallback Configuration

```typescript
// config/llm-fallback.ts
// when falling back, map to equivalent model
const MODEL_EQUIVALENTS: Record<string, Record<string, string>> = {
  openai: {
    'claude-3-opus': 'gpt-4o',
    'claude-3-5-sonnet': 'gpt-4o-mini',
    'gemini-1.5-pro': 'gpt-4o',
  },
  anthropic: {
    'gpt-4o': 'claude-3-5-sonnet',
    'gpt-4o-mini': 'claude-3-5-haiku',
    'gemini-1.5-pro': 'claude-3-5-sonnet',
  },
  google: {
    'gpt-4o': 'gemini-1.5-pro',
    'claude-3-opus': 'gemini-1.5-pro',
  },
};

// environment-based fallback provider chain
const llmConfig = z.object({
  LLM_DEFAULT_PROVIDER: z.enum(['openai', 'anthropic', 'google']).default('openai'),
  LLM_DEFAULT_MODEL: z.string().default('gpt-4o-mini'),
  LLM_FALLBACK_MAP: z.string().transform(JSON.parse).default('{"openai":"anthropic","anthropic":"openai","google":"openai"}'),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),
}).parse(process.env);
```

### 7.2 Fallback Logic

```typescript
private shouldFallback(error: LLMError): boolean {
  return ['RateLimit', 'ServiceUnavailable', 'Timeout'].includes(error._tag);
}

private mapModel(model: string, targetProvider: string): string {
  return MODEL_EQUIVALENTS[targetProvider]?.[model] ?? llmConfig.LLM_DEFAULT_MODEL;
}
```

---

## 8. Observability

### 8.1 Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `llm_requests_total` | Counter | provider, model, domain, status | Total LLM requests |
| `llm_tokens_total` | Counter | provider, model, domain, type | Total tokens (prompt/completion) |
| `llm_cost_usd_total` | Counter | provider, model, domain | Total cost in USD |
| `llm_latency_ms` | Histogram | provider, model | Request latency |
| `llm_fallback_total` | Counter | primary, fallback | Fallback events |

### 8.2 Structured Logging

```typescript
// structured log for each request
logger.info({
  event: 'llm_request_completed',
  workflowId: request.workflowId,
  domain: request.domain,
  provider: response.provider,
  model: request.model,
  promptTokens: response.usage.promptTokens,
  completionTokens: response.usage.completionTokens,
  costUsd: response.cost,
  latencyMs,
  wasFallback: response.wasFallback,
});
```

---

## 9. Error Types

```typescript
type LLMError =
  | { _tag: 'ProviderNotFound'; providerId: string }
  | { _tag: 'ModelNotSupported'; model: string; provider: string }
  | { _tag: 'RateLimit'; retryAfter?: number }
  | { _tag: 'ServiceUnavailable'; provider: string }
  | { _tag: 'Timeout'; provider: string }
  | { _tag: 'ContentFilter'; reason: string }
  | { _tag: 'InvalidRequest'; message: string }
  | { _tag: 'DailyBudgetExceeded'; dailyUsed: number; dailyLimit: number }
  | { _tag: 'MonthlyBudgetExceeded'; monthlyUsed: number; monthlyLimit: number }
  | { _tag: 'NetworkError'; cause: unknown };
```

---

## 10. Phase 2+ Roadmap

- Multi-provider routing (cost vs latency optimization)
- Automatic fallback on provider failure
- Model benchmarking for quality vs cost
- Token estimation before request
- Prompt caching for repeated queries
- Vision and multimodal support
- Embeddings API

---

## Traceability

### Upstream References

| Requirement | Source Document | Section |
|-------------|-----------------|---------|
| Provider Abstraction | platform-core-frd.md | FR-CORE-LLM-001 |
| Cost Logging per Workflow | platform-core-frd.md | FR-CORE-LLM-002 |
| Budget Cap Enforcement | platform-core-frd.md | FR-CORE-LLM-003 |
| LLM Gateway | platform-core-add.md | Section 7 |
| LLM Cost Tracking | platform-core-brd.md | BO-CORE-003 |

### Downstream References

| Implementation | Target Document | Section |
|----------------|-----------------|---------|
| AI Reasoning Generation | crypto/workflow-engine.md | LLM calls |
| Resume Parsing | hr/candidate-management.md | AI integration |
