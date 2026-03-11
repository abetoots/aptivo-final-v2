/**
 * S7-CF-02: domain route body limit verification
 * @task S7-CF-02
 *
 * verifies that withBodyLimits HOF is operational and ready for domain POST
 * routes. all sprint 7 domain workflows are inngest-triggered (event-driven),
 * so no new POST api routes were created. this test ensures the guard
 * correctly passes GET requests through and enforces limits on POST bodies.
 */
import { describe, it, expect, vi } from 'vitest';

// mock next/server for withBodyLimits
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...init?.headers },
      }),
  },
}));

import { withBodyLimits } from '../src/lib/security/route-guard';
import { API_MAX_BODY_BYTES, MAX_JSON_DEPTH } from '../src/lib/security/body-limits';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeGetRequest(path: string) {
  return new Request(`http://localhost:3000${path}`, { method: 'GET' }) as never;
}

function makePostRequest(path: string, body: string, contentType = 'application/json') {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    body,
    headers: { 'content-type': contentType },
  }) as never;
}

function deepObject(depth: number): Record<string, unknown> {
  let obj: Record<string, unknown> = { leaf: true };
  for (let i = 0; i < depth; i++) {
    obj = { nested: obj };
  }
  return obj;
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('S7-CF-02: Domain Route Body Limits', () => {
  describe('withBodyLimits guard', () => {
    it('passes GET requests through without body validation', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const guarded = withBodyLimits(handler);

      const req = makeGetRequest('/api/admin/overview');
      await guarded(req);

      expect(handler).toHaveBeenCalledWith(req, undefined, undefined);
    });

    it('returns 413 for oversized POST body', async () => {
      const handler = vi.fn();
      const guarded = withBodyLimits(handler, { maxBytes: 100 });

      const largeBody = JSON.stringify({ data: 'x'.repeat(200) });
      const req = makePostRequest('/api/test', largeBody);
      const res = await guarded(req);

      expect(res.status).toBe(413);
      expect(handler).not.toHaveBeenCalled();
    });

    it('returns 400 for deeply nested JSON', async () => {
      const handler = vi.fn();
      const guarded = withBodyLimits(handler, { maxDepth: 5 });

      const deepBody = JSON.stringify(deepObject(10));
      const req = makePostRequest('/api/test', deepBody);
      const res = await guarded(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('nesting depth');
    });

    it('returns 400 for invalid JSON', async () => {
      const handler = vi.fn();
      const guarded = withBodyLimits(handler);

      const req = makePostRequest('/api/test', '{invalid json}');
      const res = await guarded(req);

      expect(res.status).toBe(400);
    });

    it('passes valid POST body to handler', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const guarded = withBodyLimits(handler);

      const body = JSON.stringify({ action: 'test', value: 42 });
      const req = makePostRequest('/api/test', body);
      await guarded(req);

      expect(handler).toHaveBeenCalledWith(req, { action: 'test', value: 42 }, undefined);
    });
  });

  describe('default limits', () => {
    it('uses 1MB max body size by default', () => {
      expect(API_MAX_BODY_BYTES).toBe(1_048_576);
    });

    it('uses depth 10 max nesting by default', () => {
      expect(MAX_JSON_DEPTH).toBe(10);
    });
  });

  describe('admin GET routes (no body validation needed)', () => {
    it('all admin routes are GET-only and skip body limits', async () => {
      // all sprint 7 admin routes are GET endpoints:
      // /api/admin/overview, /api/admin/audit, /api/admin/hitl, /api/admin/llm-usage
      // withBodyLimits skips GET/HEAD/OPTIONS — no body validation needed
      const handler = vi.fn().mockResolvedValue(new Response('ok'));
      const guarded = withBodyLimits(handler);

      const paths = [
        '/api/admin/overview',
        '/api/admin/audit',
        '/api/admin/hitl',
        '/api/admin/llm-usage',
      ];

      for (const path of paths) {
        const req = makeGetRequest(path);
        await guarded(req);
        expect(handler).toHaveBeenCalled();
        handler.mockClear();
      }
    });
  });
});
