/**
 * INT-06: security hardening utilities
 * @task INT-06
 */

export { validateWebhookUrl, isPrivateIp } from './ssrf-validator.js';
export type { SsrfError } from './ssrf-validator.js';

export { safeFetch } from './safe-fetch.js';
export type { SafeFetchError } from './safe-fetch.js';

export {
  WEBHOOK_MAX_BODY_BYTES,
  API_MAX_BODY_BYTES,
  MAX_JSON_DEPTH,
  checkJsonDepth,
  verifyHmacSignature,
  isBodyWithinLimit,
} from './body-limits.js';

export { sanitizeForLogging, hashQueryParam } from './sanitize-logging.js';

export { withBodyLimits } from './route-guard.js';
export type { BodyLimitOptions, RouteHandler, GuardedRouteHandler } from './route-guard.js';
