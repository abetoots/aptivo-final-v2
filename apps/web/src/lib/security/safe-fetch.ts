/**
 * P1.5-06 (RR-7): SSRF-validating fetch wrapper
 * @task P1.5-06
 *
 * wraps the global fetch with validateWebhookUrl() so that outbound HTTP
 * to user-supplied URLs is blocked when the target is a private IP,
 * loopback, link-local, or cloud metadata endpoint.
 */

import { Result } from '@aptivo/types';
import { validateWebhookUrl } from './ssrf-validator.js';
import type { SsrfError } from './ssrf-validator.js';

// ---------------------------------------------------------------------------
// error type
// ---------------------------------------------------------------------------

export type SafeFetchError =
  | { _tag: 'SsrfBlocked'; url: string; cause: SsrfError }
  | { _tag: 'FetchFailed'; url: string; message: string };

// ---------------------------------------------------------------------------
// safe fetch
// ---------------------------------------------------------------------------

/**
 * validates the url against SSRF rules before issuing the fetch.
 * returns a Result so callers can handle errors without try/catch.
 */
export async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<Result<Response, SafeFetchError>> {
  const validation = validateWebhookUrl(url);

  if (!validation.ok) {
    return Result.err({
      _tag: 'SsrfBlocked' as const,
      url,
      cause: validation.error,
    });
  }

  try {
    const response = await fetch(validation.value.toString(), init);
    return Result.ok(response);
  } catch (err) {
    return Result.err({
      _tag: 'FetchFailed' as const,
      url,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
