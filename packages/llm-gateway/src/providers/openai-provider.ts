/**
 * LLM-04: OpenAI Provider
 * @task LLM-04
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
  Tool,
  ToolCall,
} from './types.js';

// ---------------------------------------------------------------------------
// openai sdk types (minimal interface for decoupling)
// ---------------------------------------------------------------------------

export interface OpenAIClient {
  chat: {
    completions: {
      create(params: Record<string, unknown>): Promise<OpenAIChatCompletion>;
    };
  };
}

export interface OpenAIChatCompletion {
  id: string;
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// pricing per 1M tokens
// ---------------------------------------------------------------------------

const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
};

const SUPPORTED_MODELS = new Set(Object.keys(OPENAI_PRICING));

// ---------------------------------------------------------------------------
// message mappers (pure functions)
// ---------------------------------------------------------------------------

function mapMessages(messages: Message[]): Array<Record<string, unknown>> {
  return messages.map((m) => {
    const mapped: Record<string, unknown> = {
      role: m.role,
      content: m.content,
    };
    if (m.name) mapped['name'] = m.name;
    if (m.toolCallId) mapped['tool_call_id'] = m.toolCallId;
    return mapped;
  });
}

function mapTools(tools: Tool[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: t.type,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));
}

function mapFinishReason(reason: string): FinishReason {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'tool_calls': return 'tool_calls';
    default: return 'stop';
  }
}

function mapToolCalls(
  toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>,
): ToolCall[] | undefined {
  if (!toolCalls || toolCalls.length === 0) return undefined;
  return toolCalls.map((tc) => ({
    id: tc.id,
    type: tc.type,
    function: { name: tc.function.name, arguments: tc.function.arguments },
  }));
}

// ---------------------------------------------------------------------------
// error mapper
// ---------------------------------------------------------------------------

function mapError(error: unknown): LLMError {
  if (error instanceof Error) {
    const statusCode = (error as { status?: number }).status;

    if (statusCode === 429) {
      const retryAfter = (error as { headers?: Record<string, string> }).headers?.['retry-after'];
      return { _tag: 'RateLimit', retryAfter: retryAfter ? Number(retryAfter) : undefined };
    }

    if (statusCode !== undefined && statusCode >= 500) {
      return { _tag: 'ServiceUnavailable', provider: 'openai' };
    }

    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return { _tag: 'Timeout', provider: 'openai' };
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

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI';
  readonly supportsStreaming = true;

  constructor(private readonly client: OpenAIClient) {}

  async complete(request: CompletionRequest): Promise<Result<CompletionResponse, LLMError>> {
    if (!SUPPORTED_MODELS.has(request.model)) {
      return Result.err({ _tag: 'ModelNotSupported', model: request.model, provider: 'openai' });
    }

    try {
      const params: Record<string, unknown> = {
        model: request.model,
        messages: mapMessages(request.messages),
      };
      if (request.temperature !== undefined) params['temperature'] = request.temperature;
      if (request.maxTokens !== undefined) params['max_tokens'] = request.maxTokens;
      if (request.tools) params['tools'] = mapTools(request.tools);
      if (request.responseFormat === 'json') {
        params['response_format'] = { type: 'json_object' };
      }

      const response = await this.client.chat.completions.create(params);

      const choice = response.choices[0];
      if (!choice) {
        return Result.err({ _tag: 'InvalidRequest', message: 'no choices returned' });
      }

      return Result.ok({
        id: response.id,
        content: choice.message.content ?? '',
        finishReason: mapFinishReason(choice.finish_reason),
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        toolCalls: mapToolCalls(choice.message.tool_calls),
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
    const pricing = OPENAI_PRICING[model];
    if (!pricing) return 0;
    return (tokens.prompt * pricing.input + tokens.completion * pricing.output) / 1_000_000;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }
}
