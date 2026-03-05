/**
 * FW-04: Shared Types Package
 * @task FW-04
 * @spec docs/04-specs/common-patterns.md §5.2
 * @guidelines docs/05-guidelines/05a-Coding-Guidelines.md §4.7
 */

import { z } from 'zod';

/**
 * Creates a Zod schema for a CloudEvents-inspired event envelope.
 * The envelope wraps domain-specific payloads with standard metadata
 * fields required for event routing, ordering, and correlation.
 *
 * @param dataSchema - A Zod schema describing the domain-specific event payload
 * @returns A Zod object schema for the complete event envelope
 *
 * @example
 * ```typescript
 * const UserCreatedSchema = EventEnvelopeSchema(
 *   z.object({ userId: z.string().uuid(), email: z.string().email() })
 * );
 * type UserCreatedEvent = z.infer<typeof UserCreatedSchema>;
 * ```
 */
export const EventEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    id: z.string().ulid(),
    type: z.string(),
    source: z.string(),
    time: z.string().datetime({ offset: true }),
    dataContentType: z.literal('application/json'),
    data: dataSchema,
    correlationId: z.string().optional(),
    causationId: z.string().optional(),
  });

/** Inferred TypeScript type for a generic event envelope. */
export type EventEnvelope<T> = {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly time: string;
  readonly dataContentType: 'application/json';
  readonly data: T;
  readonly correlationId?: string;
  readonly causationId?: string;
};
