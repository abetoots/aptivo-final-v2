/**
 * AUD-03: HTTP method → audit action mapper
 * @task AUD-03
 *
 * Maps HTTP methods and route context to standardized audit action strings.
 */

/**
 * Map an HTTP method to a generic audit action.
 * Returns null for GET/HEAD/OPTIONS (read-only, not audited).
 */
export function mapHttpAction(method: string, route?: string): string | null {
  const upper = method.toUpperCase();
  switch (upper) {
    case 'POST':
      return `${route ?? 'resource'}.create`;
    case 'PUT':
    case 'PATCH':
      return `${route ?? 'resource'}.update`;
    case 'DELETE':
      return `${route ?? 'resource'}.delete`;
    default:
      // GET, HEAD, OPTIONS — not audited
      return null;
  }
}

/**
 * Pre-defined audit actions for HITL and RBAC operations.
 */
export const AUDIT_ACTIONS = {
  HITL_DECISION_APPROVED: 'hitl.decision.approved',
  HITL_DECISION_REJECTED: 'hitl.decision.rejected',
  RBAC_ROLE_GRANTED: 'rbac.role.granted',
  RBAC_ROLE_REVOKED: 'rbac.role.revoked',
} as const;
