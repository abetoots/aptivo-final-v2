/**
 * S17-CT-1: Inngest event schemas for ticket lifecycle.
 *
 * Three events ship now:
 *   - `ticket.created` — emitted by the ticket service after persist
 *   - `ticket.escalated` — emitted by the CT-3 escalation service
 *     when a ticket advances tiers (placeholder shape; CT-3 may
 *     widen)
 *   - `ticket.sla_breached` — emitted by the CT-2 SLA cron when a
 *     ticket crosses its priority's resolve window without closing
 *
 * Schemas use `zod/v3` because Inngest's EventSchemas type-checker
 * is bound to the v3 line; the rest of the repo uses v4 for
 * application-layer Zod, but Inngest's type bridge requires v3.
 * Same pattern as apps/web/src/lib/inngest.ts.
 */

import { z } from 'zod/v3';

export const TicketCreatedDataSchema = z.object({
  ticketId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  departmentId: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  workflowDefinitionId: z.string().uuid().optional(),
  createdAt: z.string().datetime({ offset: true }),
});

export const TicketEscalatedDataSchema = z.object({
  ticketId: z.string().uuid(),
  /** tier id within the escalation chain (e.g. 'L2'). Free-form for now. */
  toTier: z.string().min(1),
  reason: z.string().min(1).optional(),
  escalatedAt: z.string().datetime({ offset: true }),
});

export const TicketSlaBreachedDataSchema = z.object({
  ticketId: z.string().uuid(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  /** ISO timestamp when the SLA window expired */
  breachedAt: z.string().datetime({ offset: true }),
  /** ms over the SLA window when the breach was detected */
  overdueByMs: z.number().int().nonnegative(),
});

export type TicketCreatedData = z.infer<typeof TicketCreatedDataSchema>;
export type TicketEscalatedData = z.infer<typeof TicketEscalatedDataSchema>;
export type TicketSlaBreachedData = z.infer<typeof TicketSlaBreachedDataSchema>;

export const TICKET_CREATED_EVENT = 'platform/ticket.created' as const;
export const TICKET_ESCALATED_EVENT = 'platform/ticket.escalated' as const;
export const TICKET_SLA_BREACHED_EVENT = 'platform/ticket.sla_breached' as const;

/**
 * Inngest event-record shape for the `EventSchemas.fromRecord<...>()`
 * call in apps/web/src/lib/inngest.ts. Adding a ticket event:
 *   1. Define its data schema above.
 *   2. Add the entry to this record type.
 *   3. Add a const for the event name.
 *   4. Reference the const at every emit site.
 */
export type TicketEvents = {
  [TICKET_CREATED_EVENT]: { data: TicketCreatedData };
  [TICKET_ESCALATED_EVENT]: { data: TicketEscalatedData };
  [TICKET_SLA_BREACHED_EVENT]: { data: TicketSlaBreachedData };
};
