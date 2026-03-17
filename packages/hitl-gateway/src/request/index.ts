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

// multi-approver request service (HITL2-02)
export { createMultiApproverRequestService } from './multi-request-service.js';
export type { MultiRequestServiceDeps } from './multi-request-service.js';
export { CreateMultiApproverRequestInputSchema } from './multi-request-types.js';
export type {
  CreateMultiApproverRequestInput,
  ApproverTokenResult,
  MultiApproverRequestResult,
  MultiRequestError,
  HitlRequestTokenRecord,
  RequestTokenStore,
} from './multi-request-types.js';

// resubmit service (HITL2-05)
export { createResubmitService } from './resubmit-service.js';
export type {
  ResubmitError,
  ResubmitResult,
  ResubmitStoreDeps,
  ResubmitServiceDeps,
} from './resubmit-service.js';
