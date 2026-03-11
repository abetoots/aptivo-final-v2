/**
 * AUD-04: Async audit writer
 * @task AUD-04
 * @warning T1-W21 (closes)
 * @guidelines §2.1 (Functional core — non-blocking)
 *
 * Fire-and-forget audit event publisher.
 * API calls asyncWriter.emit() which publishes to Inngest within a 5s timeout.
 * The Inngest function (processAuditEvent) handles durable write + DLQ.
 */

import { Result } from '@aptivo/types';
import { AUDIT_EVENT_SCHEMAS, AUDIT_EVENT_NAME } from './event-schemas.js';
import type { AuditEventInput } from '../types.js';

// ---------------------------------------------------------------------------
// interfaces
// ---------------------------------------------------------------------------

/** minimal inngest-compatible event sender */
export interface AuditEventSender {
  send(event: { name: string; data: Record<string, unknown> }): Promise<void>;
}

export type AsyncAuditError =
  | { _tag: 'PublishTimeout'; timeoutMs: number }
  | { _tag: 'PublishFailed'; cause: unknown }
  | { _tag: 'ValidationFailed'; issues: string[] };

export interface AsyncAuditWriter {
  emit(event: AuditEventInput): Promise<Result<void, AsyncAuditError>>;
}

export interface AsyncAuditWriterLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Creates an async audit writer that publishes events via Inngest.
 *
 * - Validates event payload against Zod schema before publishing
 * - Publishes within a 5s timeout budget (non-blocking on caller)
 * - Returns Result — never throws
 */
export function createAsyncAuditWriter(
  sender: AuditEventSender,
  options?: { timeoutMs?: number; logger?: AsyncAuditWriterLogger },
): AsyncAuditWriter {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = options?.logger ?? { warn() {} };
  const schema = AUDIT_EVENT_SCHEMAS[AUDIT_EVENT_NAME];

  return {
    async emit(event: AuditEventInput): Promise<Result<void, AsyncAuditError>> {
      // 1. validate
      const data = {
        actor: event.actor,
        action: event.action,
        resource: event.resource,
        domain: event.domain,
        metadata: event.metadata,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      };

      const parseResult = schema.safeParse(data);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`,
        );
        log.warn('audit event validation failed', { issues });
        return Result.err({ _tag: 'ValidationFailed', issues });
      }

      // 2. publish with timeout
      try {
        await Promise.race([
          sender.send({ name: AUDIT_EVENT_NAME, data: parseResult.data as Record<string, unknown> }),
          rejectAfterTimeout(timeoutMs),
        ]);
        return Result.ok(undefined);
      } catch (err) {
        if (err instanceof TimeoutError) {
          log.warn('audit event publish timeout', { timeoutMs });
          return Result.err({ _tag: 'PublishTimeout', timeoutMs });
        }
        log.warn('audit event publish failed', { error: String(err) });
        return Result.err({ _tag: 'PublishFailed', cause: err });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`publish timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

function rejectAfterTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
}
