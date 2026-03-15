/**
 * P1.5-03: novu SDK client factory
 * @task P1.5-03
 *
 * env-gated novu client initialization. provides a real SDK client when
 * NOVU_API_KEY is available, or a no-op stub for dev/test environments.
 *
 * uses the NovuClient interface from @aptivo/notifications — same
 * SDK-decoupled pattern as all other adapters.
 */

import type { NovuClient, NovuTriggerPayload, NovuTriggerResult } from '@aptivo/notifications';

// ---------------------------------------------------------------------------
// types for injectable novu SDK instance
// ---------------------------------------------------------------------------

/** minimal shape of an initialized @novu/node instance */
export interface NovuSdkInstance {
  trigger(workflowId: string, payload: NovuTriggerPayload): Promise<NovuTriggerResult>;
  subscribers: {
    identify(subscriberId: string, data: Record<string, unknown>): Promise<unknown>;
  };
}

// ---------------------------------------------------------------------------
// real SDK client — wraps an initialized @novu/node instance
// ---------------------------------------------------------------------------

export function createNovuSdkClient(novu: NovuSdkInstance): NovuClient {
  return {
    trigger: async (workflowId: string, payload: NovuTriggerPayload): Promise<NovuTriggerResult> => {
      return novu.trigger(workflowId, payload);
    },
    identify: async (subscriberId: string, data: Record<string, unknown>): Promise<void> => {
      await novu.subscribers.identify(subscriberId, data);
    },
  };
}

// ---------------------------------------------------------------------------
// stub client — for dev/test when no API key is set
// ---------------------------------------------------------------------------

export function createNovuStubClient(): NovuClient {
  return {
    trigger: async (): Promise<NovuTriggerResult> => ({ acknowledged: true }),
    // no identify — omitted intentionally for stub
  };
}
