/**
 * AUD-04: Audit event Zod schemas
 * @task AUD-04
 * @warning T1-W21 (closes)
 *
 * Zod schemas for audit Inngest events.
 * Same pattern as MCP-09 createValidatedSender().
 */

import { z } from 'zod';
import { ACTOR_TYPES } from '@aptivo/types';

export const AUDIT_EVENT_SCHEMAS = {
  'audit/event.published': z.object({
    actor: z.object({
      id: z.string().min(1),
      type: z.enum(ACTOR_TYPES),
    }),
    action: z.string().min(1),
    resource: z.object({
      type: z.string().min(1),
      id: z.string().min(1),
    }),
    domain: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  }),
} as const;

export type AuditEventName = keyof typeof AUDIT_EVENT_SCHEMAS;

export const AUDIT_EVENT_NAME = 'audit/event.published' as const;
