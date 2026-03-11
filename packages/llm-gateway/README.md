# @aptivo/llm-gateway

Provider-agnostic LLM abstraction with per-workflow cost tracking, budget enforcement, and per-user rate limiting.

**BRD**: BO-CORE-003
**Spec**: [docs/04-specs/platform-core/llm-gateway.md](../../docs/04-specs/platform-core/llm-gateway.md)

## Modules

| Export path | Description |
|---|---|
| `@aptivo/llm-gateway` | Main entry — `createLlmGateway(deps)` factory |
| `@aptivo/llm-gateway/providers` | `LLMProvider` interface, `OpenAIProvider`, `AnthropicProvider` |
| `@aptivo/llm-gateway/cost` | `calculateCost()`, `MODEL_PRICING` registry, `CostBreakdown` |
| `@aptivo/llm-gateway/budget` | `BudgetService` — daily/monthly limit enforcement |
| `@aptivo/llm-gateway/usage` | `UsageLogger` — fire-and-forget usage recording |
| `@aptivo/llm-gateway/validation` | `validateOutput()` — Zod schema validation on LLM responses |
| `@aptivo/llm-gateway/rate-limit` | `TokenBucket` — per-user rate limiting with pluggable store |

## Usage

```typescript
import { createLlmGateway, OpenAIProvider, AnthropicProvider } from '@aptivo/llm-gateway';
import { BudgetService } from '@aptivo/llm-gateway/budget';
import { UsageLogger } from '@aptivo/llm-gateway/usage';
import { TokenBucket, InMemoryRateLimitStore } from '@aptivo/llm-gateway/rate-limit';

const gateway = createLlmGateway({
  providers: new Map([
    ['openai', new OpenAIProvider(openaiClient)],
    ['anthropic', new AnthropicProvider(anthropicClient)],
  ]),
  budgetService: new BudgetService(budgetStore),
  usageLogger: new UsageLogger(usageStore),
  rateLimiter: new TokenBucket(new InMemoryRateLimitStore()),
  modelToProvider: {
    'gpt-4o': 'openai',
    'gpt-4o-mini': 'openai',
    'claude-3-5-sonnet': 'anthropic',
  },
  fallbackMap: {
    openai: 'anthropic',
    anthropic: 'openai',
  },
});

const result = await gateway.complete(
  { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hello' }] },
  { userId: 'user-123', domain: 'crypto', outputSchema: myZodSchema },
);

if (result.ok) {
  console.log(result.value.completion.content);
  console.log(`Cost: $${result.value.costUsd}`);
}
```

## Request flow

1. **Rate limit** — per-user token bucket (skipped if no `userId`)
2. **Budget check** — daily + monthly limits with pre-request cost projection
3. **Provider resolution** — model → provider mapping
4. **Primary call** — send to resolved provider
5. **One-hop fallback** — on retryable errors (429, 5xx, timeout), try secondary provider
6. **Output validation** — optional Zod schema validation on JSON responses
7. **Usage logging** — fire-and-forget insert (failures don't block the response)
8. **Return** — `Result<GatewayResponse, LLMError>`

## Error handling

All operations return `Result<T, LLMError>` — no thrown exceptions. Error tags:

| Tag | Retryable | Triggers fallback |
|---|---|---|
| `RateLimit` | Yes | Yes |
| `ServiceUnavailable` | Yes | Yes |
| `Timeout` | Yes | Yes |
| `NetworkError` | Yes | Yes |
| `ContentFilter` | No | No |
| `InvalidRequest` | No | No |
| `ModelNotSupported` | No | No |
| `DailyBudgetExceeded` | No | No |
| `MonthlyBudgetExceeded` | No | No |
| `RateLimitExceeded` | No | No |
| `OutputValidationFailed` | No | No |
| `ProviderNotFound` | No | No |

## Testing

```bash
pnpm -F @aptivo/llm-gateway test          # run tests
pnpm -F @aptivo/llm-gateway test:coverage  # run with 80% coverage gate
pnpm -F @aptivo/llm-gateway typecheck      # type check
```

115 tests across 10 test files. Coverage: 98% statements, 90% branches, 100% functions.

## Architecture decisions

- **SDK decoupling**: Providers accept client interfaces (`OpenAIClient`, `AnthropicClient`), not SDK instances. Tests use plain mocks — no SDK dependency in test code.
- **Adapter interfaces**: `BudgetStore`, `UsageStore`, `RateLimitStore` — in-memory implementations for Phase 1, swap to Redis/Postgres in Phase 2.
- **Fail-closed budget**: Missing budget config blocks requests (returns `DailyBudgetExceeded`).
- **Fail-closed rate limit**: Store errors block requests (returns `RateLimitExceeded`).
- **Fire-and-forget logging**: Usage insert failures log to console.error but don't fail the request.
