/**
 * LLM3-02: Replicate client tests — HTTP wire-up + response unwrap
 */

import { describe, it, expect, vi } from 'vitest';
import { createReplicateClient } from '../../src/safety/model-client.js';

// ---------------------------------------------------------------------------
// mock fetch helper — records calls and returns caller-supplied bodies
// ---------------------------------------------------------------------------

function mockFetch(
  responder: (req: { url: string; init: RequestInit }) => Response | Promise<Response>,
): { fetch: typeof globalThis.fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = ((url: string | URL | Request, init: RequestInit = {}) => {
    const u = typeof url === 'string' ? url : url.toString();
    calls.push({ url: u, init });
    return Promise.resolve(responder({ url: u, init }));
  }) as unknown as typeof globalThis.fetch;
  return { fetch: fn, calls };
}

describe('LLM3-02: createReplicateClient', () => {
  it('POSTs to the configured URL with Authorization and JSON body', async () => {
    const { fetch, calls } = mockFetch(() =>
      new Response(JSON.stringify({ output: { verdict: 'allow', confidence: 0.1 } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createReplicateClient({ url: 'https://api.example.com/predict', token: 'tok-abc', fetch });
    const v = await client.predict('hello');
    expect(v.verdict).toBe('allow');
    expect(v.confidence).toBeCloseTo(0.1);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.example.com/predict');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Token tok-abc');
  });

  it('includes `version` in the body when configured', async () => {
    const { fetch, calls } = mockFetch(() =>
      new Response(JSON.stringify({ output: { verdict: 'allow', confidence: 0 } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createReplicateClient({
      url: 'https://api.example.com/predict',
      token: 't', fetch,
      version: 'model-v1-sha',
    });
    await client.predict('x');
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.version).toBe('model-v1-sha');
    expect(body.input.prompt).toBe('x');
  });

  it('unwraps { output: ... } envelopes correctly', async () => {
    const { fetch } = mockFetch(() =>
      new Response(JSON.stringify({ output: { verdict: 'block', confidence: 0.9, category: 'role_play' } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createReplicateClient({ url: 'https://x', token: 't', fetch });
    const v = await client.predict('anything');
    expect(v.verdict).toBe('block');
    expect(v.category).toBe('role_play');
  });

  it('falls through to the raw body when the response lacks an `output` field', async () => {
    // a plausible alternative vendor shape: verdict directly at the root
    const { fetch } = mockFetch(() =>
      new Response(JSON.stringify({ verdict: 'challenge', confidence: 0.5 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    );
    const client = createReplicateClient({ url: 'https://x', token: 't', fetch });
    const v = await client.predict('y');
    expect(v.verdict).toBe('challenge');
  });

  it('throws on non-2xx responses', async () => {
    const { fetch } = mockFetch(() =>
      new Response('upstream bad', { status: 502, statusText: 'Bad Gateway' }),
    );
    const client = createReplicateClient({ url: 'https://x', token: 't', fetch });
    await expect(client.predict('z')).rejects.toThrow(/HTTP 502/);
  });

  it('throws at construction time if fetch is unavailable', () => {
    const originalFetch = globalThis.fetch;
    // @ts-expect-error — deliberate removal to simulate a platform without global fetch
    delete globalThis.fetch;
    try {
      expect(() => createReplicateClient({ url: 'https://x', token: 't' })).toThrow(/no fetch/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
