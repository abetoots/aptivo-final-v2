/**
 * Auth — barrel export
 * @task ID-02, HITL-11
 */

// rbac middleware (ID-02)
export { RbacService } from './rbac-middleware.js';
export type {
  RbacStore,
  RbacConfig,
  AuthzResult,
  RoleRecord,
  RolePermissionRecord,
} from './rbac-types.js';
export { DEFAULT_RBAC_CONFIG } from './rbac-types.js';

// session revocation (HITL-11)
export { revokeSession, isSessionRevoked } from './session-revocation.js';
export type {
  SessionStore,
  RevocationError,
  RevokeSessionInput,
  RevokeSessionResult,
} from './session-revocation.js';
