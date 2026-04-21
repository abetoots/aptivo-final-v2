/**
 * LLM3-02: Replicate ModelClient adapter
 *
 * Minimal HTTP client for Replicate's predictions endpoint. Intentionally
 * thin — only the bits needed by the ML injection classifier. If a
 * different vendor (HuggingFace, self-hosted) needs to be supported, add
 * another factory that implements the same `ModelClient` contract — the
 * wrapper above doesn't care which one it gets.
 *
 * The factory accepts a `fetch` implementation via DI so tests can pass
 * a mock without touching global fetch. In production, `services.ts`
 * binds `globalThis.fetch`.
 */

import type { ModelClient, ModelVerdict } from './ml-injection-classifier.js';

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------

export interface ReplicateClientConfig {
  /** full predictions endpoint URL, e.g. https://api.replicate.com/v1/predictions/... */
  url: string;
  /** API token */
  token: string;
  /** fetch implementation; defaults to globalThis.fetch if available */
  fetch?: typeof globalThis.fetch;
  /** optional model version ID for Replicate's `version` field */
  version?: string;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createReplicateClient(config: ReplicateClientConfig): ModelClient {
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('createReplicateClient: no fetch implementation available (pass config.fetch or run on a platform with globalThis.fetch)');
  }

  return {
    async predict(prompt: string): Promise<ModelVerdict> {
      const body: Record<string, unknown> = {
        input: { prompt },
      };
      if (config.version) body.version = config.version;

      const res = await fetchImpl(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Token ${config.token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error(`replicate predict failed: HTTP ${res.status} ${res.statusText}`);
      }

      const envelope = await res.json() as unknown;
      // Replicate's predictions endpoint returns `{ output: ... }` (among
      // other fields). For a classifier model we expect `output` to carry
      // the ModelVerdict shape — validation/parse failure is surfaced by
      // the caller via the Zod schema, so this function just unwraps
      // and returns whatever the model produced.
      if (envelope && typeof envelope === 'object' && 'output' in envelope) {
        return (envelope as { output: ModelVerdict }).output;
      }
      // some configs return the verdict directly — fall through
      return envelope as ModelVerdict;
    },
  };
}
