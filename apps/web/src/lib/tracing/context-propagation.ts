/**
 * INT-08: trace context propagation helpers
 * @task INT-08
 * @warning S7-W24, S7-W26, S7-W27, S7-W29, S7-W30
 *
 * w3c traceparent utilities for propagating trace context across
 * async boundaries (inngest, novu, mcp, jwt, webhooks).
 */
import { randomBytes } from 'crypto';

// w3c traceparent format: 00-{traceId}-{spanId}-{flags}
const TRACEPARENT_REGEX = /^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/;

export interface TraceContext {
  traceparent: string;
  traceId: string;
  spanId: string;
  flags: string;
}

/** generate a new w3c traceparent string with sampled flag */
export function generateTraceparent(): string {
  const traceId = randomBytes(16).toString('hex');
  const spanId = randomBytes(8).toString('hex');
  return `00-${traceId}-${spanId}-01`;
}

/** parse a w3c traceparent string into its components, or null if invalid */
export function parseTraceparent(traceparent: string): TraceContext | null {
  const match = traceparent.match(TRACEPARENT_REGEX);
  if (!match) return null;
  return { traceparent, traceId: match[1], spanId: match[2], flags: match[3] };
}

/** extract traceparent from a payload object, returning parsed context or null */
export function extractTraceparent(payload: Record<string, unknown>): TraceContext | null {
  const tp = payload?.traceparent;
  if (typeof tp !== 'string') return null;
  return parseTraceparent(tp);
}

/** inject traceparent into a payload, using provided value or generating a new one */
export function injectTraceparent(
  payload: Record<string, unknown>,
  traceparent?: string,
): Record<string, unknown> {
  return { ...payload, traceparent: traceparent ?? generateTraceparent() };
}
