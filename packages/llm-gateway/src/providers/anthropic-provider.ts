/**
 * LLM-05: Anthropic Provider
 * @task LLM-05
 * @spec docs/04-specs/platform-core/llm-gateway.md §2.2
 */

import { Result } from '@aptivo/types';
import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  LLMError,
  TokenCount,
  FinishReason,
  Message,
  ToolCall,
} from './types.js';

// ---------------------------------------------------------------------------
// anthropic sdk types (minimal interface for decoupling)
// ---------------------------------------------------------------------------

export interface AnthropicClient {
  messages: {
    create(params: Record<string, unknown>): Promise<AnthropicMessage>;
  };
}

export interface AnthropicMessage {
  id: string;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// pricing per 1M tokens
// ---------------------------------------------------------------------------

const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-opus': { input: 15.00, output: 75.00 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku': { input: 0.25, output: 1.25 },
};

const SUPPORTED_MODELS = new Set(Object.keys(ANTHROPIC_PRICING));

// ---------------------------------------------------------------------------
// message mappers (pure functions)
// ---------------------------------------------------------------------------

function mapMessages(messages: Message[]): {
  system?: string;
  messages: Array<Record<string, unknown>>;
} {
  let system: string | undefined;
  const mapped: Array<Record<string, unknown>> = [];

  for (const m of messages) {
    if (m.role === 'system') {
      // anthropic uses a top-level system parameter
      system = typeof m.content === 'string' ? m.content : '';
      continue;
    }
    const entry: Record<string, unknown> = {
      role: m.role,
      content: m.content,
    };
    if (m.toolCallId) entry['tool_use_id'] = m.toolCallId;
    mapped.push(entry);
  }

  return { system, messages: mapped };
}

function mapStopReason(reason: string | null): FinishReason {
  switch (reason) {
    case 'end_turn': return 'stop';
    case 'max_tokens': return 'length';
    case 'tool_use': return 'tool_calls';
    default: return 'stop';
  }
}

function mapToolCalls(
  content: AnthropicMessage['content'],
): ToolCall[] | undefined {
  const toolUses = content.filter((c) => c.type === 'tool_use');
  if (toolUses.length === 0) return undefined;
  return toolUses.map((t) => ({
    id: t.type === 'tool_use' ? t.id : '',
    type: 'function' as const,
    function: {
      name: t.type === 'tool_use' ? t.name : '',
      arguments: t.type === 'tool_use' ? JSON.stringify(t.input) : '',
    },
  }));
}

// ---------------------------------------------------------------------------
// error mapper (shared retryable detection with openai)
// ---------------------------------------------------------------------------

function mapError(error: unknown): LLMError {
  if (error instanceof Error) {
    const statusCode = (error as { status?: number }).status;

    if (statusCode === 429) {
      const retryAfter = (error as { headers?: Record<string, string> }).headers?.['retry-after'];
      return { _tag: 'RateLimit', retryAfter: retryAfter ? Number(retryAfter) : undefined };
    }

    if (statusCode !== undefined && statusCode >= 500) {
      return { _tag: 'ServiceUnavailable', provider: 'anthropic' };
    }

    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return { _tag: 'Timeout', provider: 'anthropic' };
    }

    if (statusCode === 400) {
      return { _tag: 'InvalidRequest', message: error.message };
    }

    if (error.message.includes('content_filter') || error.message.includes('content_policy')) {
      return { _tag: 'ContentFilter', reason: error.message };
    }
  }

  return { _tag: 'NetworkError', cause: error };
}

// ---------------------------------------------------------------------------
// provider implementation
// ---------------------------------------------------------------------------

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic';
  readonly supportsStreaming = true;

  constructor(private readonly client: AnthropicClient) {}

  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>> {
    if (!SUPPORTED_MODELS.has(request.model)) {
      return Result.err({ _tag: 'ModelNotSupported', model: request.model, provider: 'anthropic' });
    }

    try {
      const { system, messages } = mapMessages(request.messages);

      const params: Record<string, unknown> = {
        model: request.model,
        messages,
        max_tokens: request.maxTokens ?? 1024,
      };
      if (system) params['system'] = system;
      if (request.temperature !== undefined) params['temperature'] = request.temperature;
      if (request.tools) {
        params['tools'] = request.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: t.function.parameters,
        }));
      }

      const response = await this.client.messages.create(params);

      const textContent = response.content.find((c) => c.type === 'text');
      const content = textContent?.type === 'text' ? textContent.text : '';
      const totalTokens = response.usage.input_tokens + response.usage.output_tokens;

      return Result.ok({
        id: response.id,
        content,
        finishReason: mapStopReason(response.stop_reason),
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens,
        },
        toolCalls: mapToolCalls(response.content),
      });
    } catch (error) {
      return Result.err(mapError(error));
    }
  }

  async *stream(_request: CompletionRequest): AsyncGenerator<StreamChunk, void, unknown> {
    // streaming implementation deferred to Phase 2 full integration
    yield { content: '', finishReason: 'stop' };
  }

  estimateCost(model: string, tokens: TokenCount): number {
    const pricing = ANTHROPIC_PRICING[model];
    if (!pricing) return 0;
    return (tokens.prompt * pricing.input + tokens.completion * pricing.output) / 1_000_000;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: 'claude-3-5-haiku',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }
}
