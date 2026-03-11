/**
 * MCP-09: Validated event sender
 * @task MCP-09
 *
 * Wraps an event sender (e.g. Inngest) with Zod schema validation.
 * Invalid payloads are dropped and logged — never published.
 */

import type { z } from 'zod';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// interfaces
// ---------------------------------------------------------------------------

/** minimal event sender interface — compatible with Inngest `client.send()` */
export interface EventSender {
  send(event: { name: string; data: Record<string, unknown> }): Promise<void>;
}

export type EventSchemaMap = Record<string, z.ZodType>;

export type ValidatedSendError =
  | { _tag: 'UnknownEventType'; name: string }
  | { _tag: 'ValidationFailed'; name: string; issues: string[] }
  | { _tag: 'SendFailed'; name: string; cause: unknown };

export interface ValidatedSenderLogger {
  error(message: string, data?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

/**
 * Creates a validated event sender that validates payloads against
 * registered Zod schemas before sending.
 *
 * - Unknown event types → dropped + logged
 * - Invalid payloads → dropped + logged
 * - Send failures → Result.err (never throws)
 */
export function createValidatedSender(
  sender: EventSender,
  schemaMap: EventSchemaMap,
  logger?: ValidatedSenderLogger,
): ValidatedEventSender {
  const log = logger ?? { error() {} };

  return {
    async send(
      name: string,
      data: Record<string, unknown>,
    ): Promise<Result<void, ValidatedSendError>> {
      // 1. check schema exists for event type
      const schema = schemaMap[name];
      if (!schema) {
        log.error('unknown event type dropped', { name });
        return Result.err({ _tag: 'UnknownEventType', name });
      }

      // 2. validate payload
      const parseResult = schema.safeParse(data);
      if (!parseResult.success) {
        const issues = parseResult.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`,
        );
        log.error('invalid event payload dropped', { name, issues });
        return Result.err({ _tag: 'ValidationFailed', name, issues });
      }

      // 3. send
      try {
        await sender.send({ name, data: parseResult.data as Record<string, unknown> });
        return Result.ok(undefined);
      } catch (err) {
        log.error('event send failed', { name, error: String(err) });
        return Result.err({ _tag: 'SendFailed', name, cause: err });
      }
    },
  };
}

export interface ValidatedEventSender {
  send(
    name: string,
    data: Record<string, unknown>,
  ): Promise<Result<void, ValidatedSendError>>;
}
