/**
 * S6-CF-03: route-level body limit guard for next.js api routes
 * @task S6-CF-03
 * @warning S1-W11, S1-W12
 *
 * wraps next.js api route handlers with body size and json depth validation.
 * designed for the app router (request: Request) pattern.
 *
 * next.js edge middleware cannot reliably consume the request body without
 * breaking downstream handlers, so body limits must be enforced at the
 * route level. this higher-order function reads the body once, validates
 * size and depth, then passes the parsed body to the inner handler.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  isBodyWithinLimit,
  checkJsonDepth,
  API_MAX_BODY_BYTES,
  MAX_JSON_DEPTH,
} from './body-limits.js';

// -- types --

export interface BodyLimitOptions {
  /** maximum body size in bytes (default: API_MAX_BODY_BYTES = 1MB) */
  maxBytes?: number;
  /** maximum json nesting depth (default: MAX_JSON_DEPTH = 10) */
  maxDepth?: number;
}

export type RouteHandler = (
  request: NextRequest,
  context?: unknown,
) => Promise<Response> | Response;

export type GuardedRouteHandler = (
  request: NextRequest,
  parsedBody: unknown,
  context?: unknown,
) => Promise<Response> | Response;

// -- guard --

/**
 * wraps a next.js api route handler with body size and json depth validation.
 * reads the body once, validates, then passes the parsed body to the handler.
 *
 * returns 413 for oversized bodies, 400 for excessive nesting or invalid json.
 */
export function withBodyLimits(
  handler: GuardedRouteHandler,
  options?: BodyLimitOptions,
): RouteHandler {
  const maxBytes = options?.maxBytes ?? API_MAX_BODY_BYTES;
  const maxDepth = options?.maxDepth ?? MAX_JSON_DEPTH;

  return async (request: NextRequest, context?: unknown) => {
    // only validate bodies on methods that have them
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return handler(request, undefined, context);
    }

    // read raw body
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return problemResponse(400, 'Invalid Request Body', 'Failed to read request body');
    }

    // check size
    if (!isBodyWithinLimit(rawBody, maxBytes)) {
      return problemResponse(413, 'Payload Too Large', 'Request body exceeds maximum allowed size');
    }

    // empty body → pass through with undefined parsedBody (handler decides if required)
    if (rawBody.length === 0) {
      return handler(request, undefined, context);
    }

    // parse json if content-type is json or body looks like json
    const contentType = request.headers.get('content-type') ?? '';
    if (
      contentType.includes('application/json') ||
      rawBody.startsWith('{') ||
      rawBody.startsWith('[')
    ) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return problemResponse(400, 'Invalid Request Body', 'Request body must be valid JSON');
      }

      // check depth
      if (!checkJsonDepth(parsed, maxDepth)) {
        return problemResponse(400, 'Invalid Request Body', 'JSON nesting depth exceeds limit');
      }

      return handler(request, parsed, context);
    }

    // non-json body — pass raw string
    return handler(request, rawBody, context);
  };
}

// RFC 7807 Problem Details response helper
function problemResponse(status: number, title: string, detail: string): NextResponse {
  return NextResponse.json(
    {
      type: `https://aptivo.dev/errors/${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      status,
      detail,
    },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}
