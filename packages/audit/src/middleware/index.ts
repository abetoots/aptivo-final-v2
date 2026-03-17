/**
 * AUD-03: Audit middleware barrel export
 */

export { createAuditMiddleware } from './audit-middleware.js';
export { mapHttpAction, AUDIT_ACTIONS } from './action-mapper.js';

export type {
  RequestContext,
  HitlDecisionContext,
  RbacChangeContext,
  AuditMiddlewareLogger,
} from './audit-middleware.js';

// OBS-04: pii read audit trail
export {
  createPiiReadAuditMiddleware,
  createPiiFieldRegistry,
  withPiiReadAudit,
  DEFAULT_PII_FIELDS,
} from './pii-read-audit.js';

export type {
  PiiReadAuditDeps,
  PiiFieldRegistry,
} from './pii-read-audit.js';
