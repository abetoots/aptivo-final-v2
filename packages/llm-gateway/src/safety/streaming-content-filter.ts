/**
 * LLM3-01: Streaming Content Filter MVP
 * @task LLM3-01
 *
 * applies domain-aware content filtering to streaming llm responses.
 * evaluates accumulated content at configurable intervals (chars or chunks)
 * and kills the stream when harmful content is detected.
 *
 * includes a feature-flag kill-switch — when disabled, all chunks pass through
 * without evaluation for zero-overhead fallback.
 */

import { Result } from '@aptivo/types';

// -- config --

export interface StreamingFilterConfig {
  /** delegate that evaluates accumulated content against domain policy */
  filterResponse: (
    content: string,
    domain: string,
  ) => Result<{ allowed: boolean; reason?: string }, unknown>;
  /** evaluate every N characters of accumulated content (default: 200) */
  evaluateEveryChars?: number;
  /** evaluate every N chunks (default: 5) */
  evaluateEveryChunks?: number;
  /** feature flag kill-switch — when returns false, filter is bypassed */
  isEnabled?: () => boolean;
}

// -- chunk result --

export interface ChunkResult {
  action: 'pass' | 'kill';
  accumulatedContent: string;
  reason?: string;
}

// -- factory --

export function createStreamingContentFilter(config: StreamingFilterConfig) {
  const evalChars = config.evaluateEveryChars ?? 200;
  const evalChunks = config.evaluateEveryChunks ?? 5;

  let buffer = '';
  let chunkCount = 0;
  let killed = false;
  let killReason: string | undefined;
  let lastEvalLength = 0;

  function shouldEvaluate(): boolean {
    return (
      (buffer.length - lastEvalLength >= evalChars) ||
      (chunkCount % evalChunks === 0 && chunkCount > 0)
    );
  }

  return {
    /**
     * processes a single chunk from the streaming response.
     * returns 'pass' to continue or 'kill' to abort the stream.
     */
    processChunk(chunk: string, domain: string): ChunkResult {
      // kill-switch: if feature disabled, always pass
      if (config.isEnabled && !config.isEnabled()) {
        buffer += chunk;
        chunkCount++;
        return { action: 'pass', accumulatedContent: buffer };
      }

      // already killed — all subsequent chunks are kill
      if (killed) {
        buffer += chunk;
        return { action: 'kill', accumulatedContent: buffer, reason: killReason };
      }

      buffer += chunk;
      chunkCount++;

      // evaluate at threshold
      if (shouldEvaluate()) {
        lastEvalLength = buffer.length;
        const result = config.filterResponse(buffer, domain);
        if (!result.ok || !result.value.allowed) {
          killed = true;
          killReason = result.ok ? result.value.reason : 'filter error';
          return { action: 'kill', accumulatedContent: buffer, reason: killReason };
        }
      }

      return { action: 'pass', accumulatedContent: buffer };
    },

    /** resets the filter state for a new stream */
    reset(): void {
      buffer = '';
      chunkCount = 0;
      killed = false;
      killReason = undefined;
      lastEvalLength = 0;
    },

    /** returns the accumulated content buffer */
    getAccumulatedContent(): string {
      return buffer;
    },
  };
}
