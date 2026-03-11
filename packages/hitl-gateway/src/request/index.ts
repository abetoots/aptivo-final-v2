/**
 * HITL-05: Request Service — barrel export
 * @task HITL-05
 */

export { createRequest } from './request-service.js';
export type { RequestStore, RequestServiceConfig, RequestServiceDeps } from './request-service.js';
export { CreateRequestInputSchema } from './request-types.js';
export type {
  CreateRequestInput,
  CreateRequestResult,
  HitlRequestRecord,
  RequestError,
} from './request-types.js';
