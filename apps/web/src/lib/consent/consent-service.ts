/**
 * FEAT-04: Consent Withdrawal API
 * @task FEAT-04
 *
 * allows users to withdraw consent for marketing, analytics, data processing,
 * or all categories. records withdrawal in audit trail and emits an inngest
 * event for downstream processors.
 */

import { z } from 'zod';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// validation schema
// ---------------------------------------------------------------------------

export const WithdrawConsentInput = z.object({
  userId: z.string().uuid(),
  consentType: z.enum(['marketing', 'analytics', 'data_processing', 'all']),
  reason: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type ConsentError =
  | { readonly _tag: 'ValidationError'; readonly message: string }
  | { readonly _tag: 'ConsentWithdrawalError'; readonly cause: unknown };

// ---------------------------------------------------------------------------
// result type
// ---------------------------------------------------------------------------

export interface ConsentWithdrawalResult {
  userId: string;
  consentType: string;
  withdrawnAt: Date;
  auditRecorded: boolean;
}

// ---------------------------------------------------------------------------
// dependencies
// ---------------------------------------------------------------------------

export interface ConsentServiceDeps {
  emitAudit: (event: {
    action: string;
    actor: string;
    resource: { type: string; id: string };
    metadata: Record<string, unknown>;
  }) => Promise<void>;
  emitEvent?: (event: {
    name: string;
    data: Record<string, unknown>;
  }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createConsentService(deps: ConsentServiceDeps) {
  return {
    async withdrawConsent(input: unknown): Promise<Result<ConsentWithdrawalResult, ConsentError>> {
      const parsed = WithdrawConsentInput.safeParse(input);
      if (!parsed.success) {
        return Result.err({ _tag: 'ValidationError' as const, message: parsed.error.message });
      }

      const { userId, consentType, reason } = parsed.data;

      try {
        // record in audit trail
        await deps.emitAudit({
          action: 'consent.withdrawn',
          actor: userId,
          resource: { type: 'consent', id: `${userId}:${consentType}` },
          metadata: { consentType, reason: reason ?? 'no reason provided' },
        });

        // emit inngest event for downstream processors (fire-and-forget)
        if (deps.emitEvent) {
          await deps.emitEvent({
            name: 'platform/consent.withdrawn',
            data: { userId, consentType, reason: reason ?? '', withdrawnAt: new Date().toISOString() },
          }).catch(() => {
            // fire-and-forget — event emission failure must not block withdrawal
          });
        }

        return Result.ok({
          userId,
          consentType,
          withdrawnAt: new Date(),
          auditRecorded: true,
        });
      } catch (cause) {
        return Result.err({ _tag: 'ConsentWithdrawalError' as const, cause });
      }
    },
  };
}
