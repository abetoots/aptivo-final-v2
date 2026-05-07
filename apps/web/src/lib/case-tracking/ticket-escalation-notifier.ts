/**
 * S18-C1c: ticket-escalation notification adapter.
 *
 * Bridges the escalation service's narrow `NotificationAdapter`
 * contract (`notifyTierChange(...)`) onto the platform's
 * `@aptivo/notifications.NotificationAdapter` (`send(...)`),
 * with the AD-S18-6 Redis-SET-NX-EX dedupe primitive replicated
 * from the S18-B3 budget pattern so a single tier-change fires at
 * most one notification per `(ticketId, fromTier, toTier)` across
 * the entire web cluster.
 *
 * Design parity with S18-B3:
 *   • GLOBAL dedupe scope (NOT per-instance) — multi-replica web
 *     workers all converge on one notification per tier change.
 *   • Claim-then-send + release-on-failure: fail of the platform
 *     adapter releases the dedupe slot so a retry can succeed.
 *     The original lossy "burn-first" mode caught at S18-B3 R1
 *     would have suppressed every subsequent attempt for the
 *     entire dedupe TTL.
 *   • Fail-OPEN on Redis: a Redis hiccup duplicates a notification
 *     rather than silencing it. Same trade-off as B3's primitive.
 *
 * Dedupe TTL: 1 hour. Tier changes within the same ticket happen at
 * minute-to-hour scale; 1h is comfortably above any plausible inter-
 * replica delivery skew while small enough that operator
 * intervention can re-fire by waiting an hour rather than waiting
 * for a calendar boundary.
 *
 * Recipient resolution: the platform `NotificationAdapter.send` needs
 * a `recipientId`. For ticket escalation the recipient is the
 * assignee at the new tier. The ticket store doesn't currently model
 * tier-to-user mapping (that's a Phase 3.5+ admin UI feature), so
 * S18 falls back to a single env-var-configured ticket-ops group ID
 * (`TICKET_ESCALATION_RECIPIENT_ID`). When absent, the adapter logs
 * `ticket_escalation_recipient_unconfigured` and returns without
 * sending — but the dedupe slot is RELEASED so subsequent
 * configurations can fire.
 */

import type { NotificationAdapter as PlatformNotificationAdapter } from '@aptivo/notifications';
import type { NotificationAdapter as EscalationNotificationAdapter } from './ticket-escalation.js';

// ---------------------------------------------------------------------------
// dedupe primitive (mirrors S18-B3 BudgetDedupeRedis surface)
// ---------------------------------------------------------------------------

export interface TicketEscalationDedupeRedis {
  set(
    key: string,
    value: string,
    options: { onlyIfNotExists: true; expirySeconds: number },
  ): Promise<boolean>;
  /**
   * Release a dedupe slot so a retry can succeed. Idempotent. The
   * release-on-failure semantics from S18-B3 R1 are mandatory here:
   * burning the slot before send would suppress every subsequent
   * attempt within the TTL window after a single transient outage.
   */
  del(key: string): Promise<number>;
}

const DEDUPE_KEY_PREFIX = 'ticket:escalation:dedupe:';
const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

// ---------------------------------------------------------------------------
// public surface
// ---------------------------------------------------------------------------

export interface TicketEscalationNotifierDeps {
  /** Platform notification adapter (Novu/SMTP failover). */
  readonly platformAdapter: PlatformNotificationAdapter;
  /**
   * The cluster-shared dedupe primitive. Null disables dedupe
   * entirely — every replica fires (used for tests + local dev).
   */
  readonly dedupeRedis: TicketEscalationDedupeRedis | null;
  /**
   * RecipientId for the ticket-ops group that should receive
   * tier-change notifications. When null the adapter logs and
   * returns; the dedupe slot is released so a subsequent
   * configuration can fire.
   */
  readonly recipientId: string | null;
  readonly logger?: {
    warn(event: string, ctx?: Record<string, unknown>): void;
    info?: (event: string, ctx?: Record<string, unknown>) => void;
  };
  /** TTL override for tests. Default 3600s. */
  readonly ttlSeconds?: number;
  /** Channel override for the platform adapter. Default 'email'. */
  readonly channel?: 'email' | 'telegram' | 'push';
}

export function createTicketEscalationNotifier(
  deps: TicketEscalationNotifierDeps,
): EscalationNotificationAdapter {
  const ttlSeconds = deps.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const channel = deps.channel ?? 'email';

  function buildKey(input: { ticketId: string; fromTier: string | null; toTier: string }): string {
    const from = input.fromTier ?? 'initial';
    return `${DEDUPE_KEY_PREFIX}${input.ticketId}:${from}->${input.toTier}`;
  }

  async function claim(key: string): Promise<boolean> {
    if (!deps.dedupeRedis) return true;
    try {
      return await deps.dedupeRedis.set(key, '1', {
        onlyIfNotExists: true,
        expirySeconds: ttlSeconds,
      });
    } catch (cause) {
      deps.logger?.warn('ticket_escalation_dedupe_failed', {
        key,
        cause: cause instanceof Error ? cause.message : String(cause),
      });
      // fail-OPEN: notification > silence
      return true;
    }
  }

  async function release(key: string): Promise<void> {
    if (!deps.dedupeRedis) return;
    try {
      await deps.dedupeRedis.del(key);
    } catch (cause) {
      deps.logger?.warn('ticket_escalation_dedupe_release_failed', {
        key,
        cause: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return {
    async notifyTierChange(input) {
      const key = buildKey(input);
      const won = await claim(key);
      if (!won) {
        deps.logger?.info?.('ticket_escalation_notify_skipped_deduped', {
          ticketId: input.ticketId,
          toTier: input.toTier,
        });
        return;
      }

      if (!deps.recipientId) {
        deps.logger?.warn('ticket_escalation_recipient_unconfigured', {
          ticketId: input.ticketId,
          toTier: input.toTier,
        });
        // release so a subsequent observation (after recipient is
        // configured) can fire — same suppression-recovery pattern as
        // S18-B3 R1.
        await release(key);
        return;
      }

      const fromLabel = input.fromTier ?? 'initial';
      const subject = `Ticket ${input.ticketId} escalated: ${fromLabel} → ${input.toTier}`;
      const body = input.reason
        ? `Ticket ${input.ticketId} (priority: ${input.priority}) escalated from ${fromLabel} to ${input.toTier}.\n\nReason: ${input.reason}`
        : `Ticket ${input.ticketId} (priority: ${input.priority}) auto-escalated from ${fromLabel} to ${input.toTier}.`;

      const result = await deps.platformAdapter.send({
        recipientId: deps.recipientId,
        channel,
        subject,
        body,
        transactionId: `ticket-escalation-${input.ticketId}-${fromLabel}-${input.toTier}`,
        metadata: {
          ticketId: input.ticketId,
          fromTier: input.fromTier,
          toTier: input.toTier,
          priority: input.priority,
          reason: input.reason,
        },
      });

      if (!result.ok) {
        deps.logger?.warn('ticket_escalation_send_failed', {
          ticketId: input.ticketId,
          toTier: input.toTier,
          cause: result.error,
        });
        await release(key);
        return;
      }

      deps.logger?.info?.('ticket_escalation_notification_sent', {
        ticketId: input.ticketId,
        toTier: input.toTier,
        notificationId: result.value.id,
      });
    },
  };
}
