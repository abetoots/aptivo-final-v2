/**
 * OBS-03: Retention barrel export
 */

export { createRetentionService } from './retention-service.js';
export type { RetentionServiceDeps } from './retention-service.js';

export {
  DEFAULT_RETENTION_POLICIES,
} from './retention-types.js';

export type {
  RetentionPolicy,
  RetentionPurgeResult,
  RetentionStore,
} from './retention-types.js';
