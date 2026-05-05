/**
 * AUD-03: Audit middleware
 * @task AUD-03
 * @frd FR-CORE-AUD-001, FR-CORE-HITL-006
 * @guidelines §2.1 (Functional core — non-blocking, fire-and-forget)
 *
 * Auto-emit audit events for state-changing API operations.
 * Failures are non-blocking — logged but never interrupt the request.
 */

import type { ActorType } from '@aptivo/types';
import type { AuditService, AuditEventInput } from '../types.js';
import { mapHttpAction, AUDIT_ACTIONS } from './action-mapper.js';

// ---------------------------------------------------------------------------
// types
// ---------------------------------------------------------------------------

export interface RequestContext {
  method: string;
  route?: string;
  actor: { id: string; type: ActorType };
  resource: { type: string; id: string };
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface HitlDecisionContext {
  requestId: string;
  approverId: string;
  decision: 'approved' | 'rejected';
  comment?: string;
  originalSummary?: string;
}

export interface RbacChangeContext {
  granterId: string;
  granteeId: string;
  role: string;
  domain?: string;
  action: 'grant' | 'revoke';
}

export interface AuditMiddlewareLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

/**
 * Creates audit middleware functions for automatic audit event emission.
 *
 * All methods are fire-and-forget — audit failures are logged but
 * never block the calling operation.
 */
export function createAuditMiddleware(
  auditService: AuditService,
  logger?: AuditMiddlewareLogger,
) {
  const log = logger ?? { warn() {} };

  return {
    /**
     * Emit an audit event for an HTTP request (POST/PATCH/DELETE).
     * Returns immediately — does not await the audit write.
     * GET/HEAD/OPTIONS are silently ignored.
     */
    auditRequest(ctx: RequestContext): void {
      const action = mapHttpAction(ctx.method, ctx.route);
      if (!action) return;

      fireAndForget(auditService, {
        actor: ctx.actor,
        action,
        resource: ctx.resource,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: ctx.metadata,
      }, log);
    },

    /**
     * Emit an audit event for a HITL decision.
     * Includes requestId, decision, comment, and original request context.
     */
    auditHitlDecision(ctx: HitlDecisionContext): void {
      const action = ctx.decision === 'approved'
        ? AUDIT_ACTIONS.HITL_DECISION_APPROVED
        : AUDIT_ACTIONS.HITL_DECISION_REJECTED;

      fireAndForget(auditService, {
        actor: { id: ctx.approverId, type: 'user' },
        action,
        resource: { type: 'hitl-request', id: ctx.requestId },
        metadata: {
          decision: ctx.decision,
          comment: ctx.comment,
          originalSummary: ctx.originalSummary,
        },
      }, log);
    },

    /**
     * Emit an audit event for an RBAC role grant/revoke.
     */
    auditRbacChange(ctx: RbacChangeContext): void {
      const action = ctx.action === 'grant'
        ? AUDIT_ACTIONS.RBAC_ROLE_GRANTED
        : AUDIT_ACTIONS.RBAC_ROLE_REVOKED;

      fireAndForget(auditService, {
        actor: { id: ctx.granterId, type: 'user' },
        action,
        resource: { type: 'user-role', id: ctx.granteeId },
        domain: ctx.domain,
        metadata: {
          role: ctx.role,
          granteeId: ctx.granteeId,
          action: ctx.action,
        },
      }, log);
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** fire-and-forget: call emit, swallow errors, log on failure */
function fireAndForget(
  auditService: AuditService,
  event: AuditEventInput,
  logger: AuditMiddlewareLogger,
): void {
  auditService.emit(event).then((result) => {
    if (!result.ok) {
      logger.warn('audit middleware: emit returned error', {
        action: event.action,
        error: result.error._tag,
      });
    }
  }).catch((err) => {
    logger.warn('audit middleware: emit threw unexpectedly', {
      action: event.action,
      error: String(err),
    });
  });
}
