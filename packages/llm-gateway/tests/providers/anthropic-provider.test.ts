/**
 * LLM-05: Anthropic Provider Tests
 * @task LLM-05
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from '../../src/providers/anthropic-provider.js';
import type { AnthropicClient, AnthropicMessage } from '../../src/providers/anthropic-provider.js';
import { makeRequest } from '../fixtures/index.js';

function createMockClient(response?: Partial<AnthropicMessage>): AnthropicClient {
  const defaultResponse: AnthropicMessage = {
    id: 'msg-123',
    content: [{ type: 'text', text: 'Hello from Claude!' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 20 },
    ...response,
  };

  return {
    messages: {
      create: vi.fn().mockResolvedValue(defaultResponse),
    },
  };
}

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let client: AnthropicClient;

  beforeEach(() => {
    client = createMockClient();
    provider = new AnthropicProvider(client);
  });

  it('has correct provider metadata', () => {
    expect(provider.id).toBe('anthropic');
    expect(provider.name).toBe('Anthropic');
    expect(provider.supportsStreaming).toBe(true);
  });

  describe('complete', () => {
    it('returns success for valid request', async () => {
      const result = await provider.complete(makeRequest({ model: 'claude-3-5-sonnet' }));

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('msg-123');
        expect(result.value.content).toBe('Hello from Claude!');
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
          expect(result.error.provider).toBe('anthropic');
        }
      }
    });

    it('extracts system message for Anthropic API', async () => {
      await provider.complete(makeRequest({
        model: 'claude-3-5-sonnet',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hi' },
        ],
      }));

      const createCall = vi.mocked(client.messages.create);
      expect(createCall).toHaveBeenCalledWith(
        expect.objectContaining({ system: 'You are helpful' }),
      );
    });

    it('maps 429 error to RateLimit', async () => {
      const error = new Error('rate limited') as Error & { status: number };
      error.status = 429;
      client = { messages: { create: vi.fn().mockRejectedValue(error) } };
      provider = new AnthropicProvider(client);

      const result = await provider.complete(makeRequest({ model: 'claude-3-5-sonnet' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('RateLimit');
      }
    });

    it('maps 5xx error to ServiceUnavailable', async () => {
      const error = new Error('overloaded') as Error & { status: number };
      error.status = 529;
      client = { messages: { create: vi.fn().mockRejectedValue(error) } };
      provider = new AnthropicProvider(client);

      const result = await provider.complete(makeRequest({ model: 'claude-3-5-haiku' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ServiceUnavailable');
      }
    });

    it('maps timeout error', async () => {
      const error = new Error('timeout exceeded');
      client = { messages: { create: vi.fn().mockRejectedValue(error) } };
      provider = new AnthropicProvider(client);

      const result = await provider.complete(makeRequest({ model: 'claude-3-5-sonnet' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('Timeout');
      }
    });

    it('maps tool_use stop reason', async () => {
      client = createMockClient({
        content: [
          { type: 'tool_use', id: 'tu-1', name: 'get_weather', input: { city: 'NYC' } },
        ],
        stop_reason: 'tool_use',
      });
      provider = new AnthropicProvider(client);

      const result = await provider.complete(makeRequest({ model: 'claude-3-5-sonnet' }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.finishReason).toBe('tool_calls');
        expect(result.value.toolCalls).toHaveLength(1);
        expect(result.value.toolCalls![0]!.function.name).toBe('get_weather');
        expect(result.value.toolCalls![0]!.function.arguments).toBe('{"city":"NYC"}');
      }
    });

    it('maps max_tokens stop reason to length', async () => {
      client = createMockClient({ stop_reason: 'max_tokens' });
      provider = new AnthropicProvider(client);

      const result = await provider.complete(makeRequest({ model: 'claude-3-5-sonnet' }));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.finishReason).toBe('length');
      }
    });

    it('maps unknown errors to NetworkError', async () => {
      client = { messages: { create: vi.fn().mockRejectedValue('chaos') } };
      provider = new AnthropicProvider(client);

      const result = await provider.complete(makeRequest({ model: 'claude-3-5-sonnet' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('NetworkError');
      }
    });

    it('maps content_policy error', async () => {
      const error = new Error('content_policy violation');
      client = { messages: { create: vi.fn().mockRejectedValue(error) } };
      provider = new AnthropicProvider(client);

      const result = await provider.complete(makeRequest({ model: 'claude-3-5-sonnet' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('ContentFilter');
      }
    });

    it('maps 400 to InvalidRequest', async () => {
      const error = new Error('bad request') as Error & { status: number };
      error.status = 400;
      client = { messages: { create: vi.fn().mockRejectedValue(error) } };
      provider = new AnthropicProvider(client);

      const result = await provider.complete(makeRequest({ model: 'claude-3-5-sonnet' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error._tag).toBe('InvalidRequest');
      }
    });

    it('passes tools to Anthropic format', async () => {
      await provider.complete(makeRequest({
        model: 'claude-3-5-sonnet',
        temperature: 0.7,
        tools: [{
          type: 'function',
          function: { name: 'test', description: 'desc', parameters: { type: 'object' } },
        }],
      }));

      expect(client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          tools: [{ name: 'test', description: 'desc', input_schema: { type: 'object' } }],
        }),
      );
    });
  });

  describe('stream', () => {
    it('yields a chunk', async () => {
      const chunks: unknown[] = [];
      for await (const chunk of provider.stream(makeRequest({ model: 'claude-3-5-sonnet' }))) {
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
      client = { messages: { create: vi.fn().mockRejectedValue(new Error('down')) } };
      provider = new AnthropicProvider(client);
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('calculates cost for claude-3-5-sonnet', () => {
      // claude-3-5-sonnet: input 3.00/1M, output 15.00/1M
      const cost = provider.estimateCost('claude-3-5-sonnet', { prompt: 1000, completion: 2000 });
      // (1000 * 3.00 + 2000 * 15.00) / 1_000_000 = 0.033
      expect(cost).toBeCloseTo(0.033, 6);
    });

    it('returns 0 for unknown model', () => {
      expect(provider.estimateCost('unknown', { prompt: 1000, completion: 2000 })).toBe(0);
    });
  });
});
