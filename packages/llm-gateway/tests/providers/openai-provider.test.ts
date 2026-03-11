/**
 * LLM-04: OpenAI Provider Tests
 * @task LLM-04
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../../src/providers/openai-provider.js';
import type { OpenAIClient, OpenAIChatCompletion } from '../../src/providers/openai-provider.js';
import { makeRequest } from '../fixtures/index.js';

function createMockClient(response?: Partial<OpenAIChatCompletion>): OpenAIClient {
  const defaultResponse: OpenAIChatCompletion = {
    id: 'chatcmpl-123',
    choices: [{
      message: {
        content: 'Hello there!',
        tool_calls: undefined,
      },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
    },
    ...response,
  };

  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(defaultResponse),
      },
    },
  };
}

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let client: OpenAIClient;

  beforeEach(() => {
    client = createMockClient();
    provider = new OpenAIProvider(client);
  });

  it('has correct provider metadata', () => {
    expect(provider.id).toBe('openai');
    expect(provider.name).toBe('OpenAI');
    expect(provider.supportsStreaming).toBe(true);
  });

  describe('complete', () => {
    it('returns success for valid request', async () => {
      const result = await provider.complete(makeRequest({ model: 'gpt-4o-mini' }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('chatcmpl-123');
        expect(result.value.content).toBe('Hello there!');
        expect(result.value.finishReason).toBe('stop');
        expect(result.value.usage.promptTokens).toBe(10);
        expect(result.value.usage.completionTokens).toBe(20);
        expect(result.value.usage.totalTokens).toBe(30);
      }
    });

    it('returns ModelNotSupported for unknown model', async () => {
      const result = await provider.complete(makeRequest({ model: 'unknown-model' }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ModelNotSupported');
        if (result.error._tag === 'ModelNotSupported') {
          expect(result.error.model).toBe('unknown-model');
          expect(result.error.provider).toBe('openai');
        }
      }
    });

    it('maps 429 error to RateLimit', async () => {
      const error = new Error('rate limited') as Error & { status: number };
      error.status = 429;
      client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(error),
          },
        },
      };
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o-mini' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('RateLimit');
      }
    });

    it('maps 5xx error to ServiceUnavailable', async () => {
      const error = new Error('server error') as Error & { status: number };
      error.status = 500;
      client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(error),
          },
        },
      };
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ServiceUnavailable');
      }
    });

    it('maps timeout error', async () => {
      const error = new Error('timeout exceeded');
      client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(error),
          },
        },
      };
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('Timeout');
      }
    });

    it('maps tool calls correctly', async () => {
      client = createMockClient({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call-1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      });
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o' }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.finishReason).toBe('tool_calls');
        expect(result.value.toolCalls).toHaveLength(1);
        expect(result.value.toolCalls![0]!.function.name).toBe('get_weather');
      }
    });

    it('handles null content gracefully', async () => {
      client = createMockClient({
        choices: [{
          message: { content: null },
          finish_reason: 'stop',
        }],
      });
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o' }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.content).toBe('');
      }
    });

    it('handles missing usage gracefully', async () => {
      client = createMockClient({ usage: undefined });
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o' }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.usage.promptTokens).toBe(0);
        expect(result.value.usage.completionTokens).toBe(0);
      }
    });

    it('maps 400 to InvalidRequest', async () => {
      const error = new Error('bad request') as Error & { status: number };
      error.status = 400;
      client = {
        chat: { completions: { create: vi.fn().mockRejectedValue(error) } },
      };
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidRequest');
      }
    });

    it('maps unknown errors to NetworkError', async () => {
      client = {
        chat: { completions: { create: vi.fn().mockRejectedValue('chaos') } },
      };
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('NetworkError');
      }
    });

    it('maps content_filter error', async () => {
      const error = new Error('content_filter triggered');
      client = {
        chat: { completions: { create: vi.fn().mockRejectedValue(error) } },
      };
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ContentFilter');
      }
    });

    it('passes optional parameters correctly', async () => {
      const result = await provider.complete(makeRequest({
        model: 'gpt-4o',
        temperature: 0.5,
        maxTokens: 100,
        responseFormat: 'json',
        tools: [{
          type: 'function',
          function: { name: 'test', description: 'test', parameters: {} },
        }],
      }));

      expect(result.ok).toBe(true);
      expect(client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 100,
          response_format: { type: 'json_object' },
          tools: expect.any(Array),
        }),
      );
    });

    it('handles empty choices array', async () => {
      client = createMockClient({ choices: [] });
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidRequest');
      }
    });

    it('maps length finish reason', async () => {
      client = createMockClient({
        choices: [{ message: { content: 'truncated' }, finish_reason: 'length' }],
      });
      provider = new OpenAIProvider(client);

      const result = await provider.complete(makeRequest({ model: 'gpt-4o' }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.finishReason).toBe('length');
      }
    });
  });

  describe('stream', () => {
    it('yields a chunk', async () => {
      const chunks: unknown[] = [];
      for await (const chunk of provider.stream(makeRequest({ model: 'gpt-4o' }))) {
        chunks.push(chunk);
      }
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('isAvailable', () => {
    it('returns true when API responds', async () => {
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when API fails', async () => {
      client = {
        chat: { completions: { create: vi.fn().mockRejectedValue(new Error('down')) } },
      };
      provider = new OpenAIProvider(client);

      const available = await provider.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('calculates cost for known model', () => {
      // gpt-4o: input 2.50/1M, output 10.00/1M
      const cost = provider.estimateCost('gpt-4o', { prompt: 1000, completion: 2000 });
      // (1000 * 2.50 + 2000 * 10.00) / 1_000_000 = (2500 + 20000) / 1_000_000 = 0.0225
      expect(cost).toBeCloseTo(0.0225, 6);
    });

    it('returns 0 for unknown model', () => {
      const cost = provider.estimateCost('unknown', { prompt: 1000, completion: 2000 });
      expect(cost).toBe(0);
    });
  });
});
