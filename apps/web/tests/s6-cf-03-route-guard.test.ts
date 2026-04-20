/**
 * S6-CF-03: route guard tests
 * @task S6-CF-03
 * @warning S1-W11, S1-W12
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { withBodyLimits } from '../src/lib/security/route-guard';
import { API_MAX_BODY_BYTES, MAX_JSON_DEPTH } from '../src/lib/security/body-limits';

// helper to create NextRequest with body
function createRequest(
  body: string,
  method = 'POST',
  contentType = 'application/json',
): NextRequest {
  return new NextRequest('http://localhost:3000/api/test', {
    method,
    body,
    headers: { 'Content-Type': contentType },
  });
}

// simple handler that echoes the parsed body
const echoHandler = vi.fn(async (_req: NextRequest, parsedBody: unknown) =>
  Response.json({ received: parsedBody }),
);

beforeEach(() => {
  echoHandler.mockClear();
});

describe('S6-CF-03: Route Guard - withBodyLimits', () => {
  // 1. rejects oversized body with 413
  it('rejects body exceeding size limit with 413', async () => {
    const oversized = 'x'.repeat(API_MAX_BODY_BYTES + 1);
    const req = createRequest(oversized, 'POST', 'text/plain');
    const handler = withBodyLimits(echoHandler);

    const response = await handler(req);

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.title).toBe('Payload Too Large');
    expect(body.detail).toContain('exceeds maximum allowed size');
    expect(echoHandler).not.toHaveBeenCalled();
  });

  // 2. rejects deeply nested JSON with 400
  it('rejects JSON exceeding depth limit with 400', async () => {
    // build nested json that exceeds MAX_JSON_DEPTH of 10
    let nested = '{"a": "leaf"}';
    for (let i = 0; i < MAX_JSON_DEPTH; i++) {
      nested = `{"level${i}": ${nested}}`;
    }
    const req = createRequest(nested);
    const handler = withBodyLimits(echoHandler);

    const response = await handler(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.title).toBe('Invalid Request Body');
    expect(body.detail).toContain('nesting depth');
  });

  // 3. passes valid request through to handler
  it('passes valid JSON body to handler', async () => {
    const validJson = JSON.stringify({ key: 'value', count: 42 });
    const req = createRequest(validJson);
    const handler = withBodyLimits(echoHandler);

    const response = await handler(req);

    expect(response.status).toBe(200);
    expect(echoHandler).toHaveBeenCalledTimes(1);
    // verify parsed body was passed
    const [, parsedBody] = echoHandler.mock.calls[0]!;
    expect(parsedBody).toEqual({ key: 'value', count: 42 });
  });

  // 4. custom size limit
  it('uses custom size limit when provided', async () => {
    const body = 'x'.repeat(300);
    const req = createRequest(body, 'POST', 'text/plain');
    const handler = withBodyLimits(echoHandler, { maxBytes: 200 });

    const response = await handler(req);

    expect(response.status).toBe(413);
  });

  // 5. GET requests pass through without body validation
  it('passes GET requests through without body checks', async () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'GET',
    });
    const handler = withBodyLimits(echoHandler);

    const response = await handler(req);

    expect(response.status).toBe(200);
    expect(echoHandler).toHaveBeenCalledTimes(1);
  });

  // 6. invalid JSON returns 400
  it('rejects invalid JSON with 400', async () => {
    const req = createRequest('{invalid json}');
    const handler = withBodyLimits(echoHandler);

    const response = await handler(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.title).toBe('Invalid Request Body');
    expect(body.detail).toContain('valid JSON');
  });

  // 7. valid body within custom depth limit passes
  it('passes body within custom depth limit', async () => {
    const req = createRequest(JSON.stringify({ a: { b: 'c' } }));
    const handler = withBodyLimits(echoHandler, { maxDepth: 5 });

    const response = await handler(req);

    expect(response.status).toBe(200);
    expect(echoHandler).toHaveBeenCalled();
  });

  // 8. HEAD and OPTIONS also skip body validation
  it('passes HEAD requests through without body checks', async () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'HEAD',
    });
    const handler = withBodyLimits(echoHandler);

    const response = await handler(req);

    expect(response.status).toBe(200);
    expect(echoHandler).toHaveBeenCalledTimes(1);
  });

  it('passes OPTIONS requests through without body checks', async () => {
    const req = new NextRequest('http://localhost:3000/api/test', {
      method: 'OPTIONS',
    });
    const handler = withBodyLimits(echoHandler);

    const response = await handler(req);

    expect(response.status).toBe(200);
    expect(echoHandler).toHaveBeenCalledTimes(1);
  });

  // 9. non-json body passes raw string to handler
  it('passes non-json body as raw string to handler', async () => {
    const rawText = 'plain text body';
    const req = createRequest(rawText, 'POST', 'text/plain');
    const handler = withBodyLimits(echoHandler);

    const response = await handler(req);

    expect(response.status).toBe(200);
    expect(echoHandler).toHaveBeenCalledTimes(1);
    const [, parsedBody] = echoHandler.mock.calls[0]!;
    expect(parsedBody).toBe('plain text body');
  });

  // 10. PUT method is also guarded
  it('validates PUT request bodies', async () => {
    const oversized = 'x'.repeat(API_MAX_BODY_BYTES + 1);
    const req = createRequest(oversized, 'PUT', 'text/plain');
    const handler = withBodyLimits(echoHandler);

    const response = await handler(req);

    expect(response.status).toBe(413);
    expect(echoHandler).not.toHaveBeenCalled();
  });

  // 11. custom depth limit rejects appropriately
  it('rejects JSON exceeding custom depth limit', async () => {
    // 3-level nesting exceeds custom depth of 2
    const nested = JSON.stringify({ a: { b: { c: 'deep' } } });
    const req = createRequest(nested);
    const handler = withBodyLimits(echoHandler, { maxDepth: 2 });

    const response = await handler(req);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.title).toBe('Invalid Request Body');
    expect(body.detail).toContain('nesting depth');
  });

  // 12. body that starts with [ is treated as json
  it('parses array json body starting with [', async () => {
    const arrayJson = JSON.stringify([1, 2, 3]);
    const req = createRequest(arrayJson, 'POST', 'text/plain');
    const handler = withBodyLimits(echoHandler);

    const response = await handler(req);

    expect(response.status).toBe(200);
    const [, parsedBody] = echoHandler.mock.calls[0]!;
    expect(parsedBody).toEqual([1, 2, 3]);
  });
});
