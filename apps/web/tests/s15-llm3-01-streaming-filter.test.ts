/**
 * LLM3-01: Streaming Content Filter MVP tests
 * @task LLM3-01
 *
 * verifies streaming content filter: chunk processing, kill semantics,
 * evaluation thresholds, kill-switch bypass, reset behavior, and
 * filter error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function createAllowFilter() {
  return vi.fn().mockImplementation((_content: string, _domain: string) =>
    Result.ok({ allowed: true }),
  );
}

function createBlockFilter(triggerWord: string) {
  return vi.fn().mockImplementation((content: string, _domain: string) => {
    if (content.includes(triggerWord)) {
      return Result.ok({ allowed: false, reason: `blocked: contains "${triggerWord}"` });
    }
    return Result.ok({ allowed: true });
  });
}

function createErrorFilter() {
  return vi.fn().mockImplementation((_content: string, _domain: string) =>
    Result.err({ _tag: 'ContentBlocked', reason: 'filter crashed' }),
  );
}

// ---------------------------------------------------------------------------
// LLM3-01: clean stream
// ---------------------------------------------------------------------------

describe('LLM3-01: createStreamingContentFilter — clean stream', () => {
  it('10 clean chunks all pass', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filter = createStreamingContentFilter({
      filterResponse: createAllowFilter(),
      evaluateEveryChars: 50,
      evaluateEveryChunks: 3,
    });

    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(filter.processChunk(`chunk-${i} `, 'core'));
    }

    expect(results.every((r) => r.action === 'pass')).toBe(true);
    expect(filter.getAccumulatedContent()).toContain('chunk-9');
  });

  it('accumulated content grows with each chunk', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filter = createStreamingContentFilter({
      filterResponse: createAllowFilter(),
    });

    filter.processChunk('hello ', 'core');
    expect(filter.getAccumulatedContent()).toBe('hello ');

    filter.processChunk('world', 'core');
    expect(filter.getAccumulatedContent()).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// LLM3-01: harmful content detection
// ---------------------------------------------------------------------------

describe('LLM3-01: createStreamingContentFilter — harmful content', () => {
  it('kills stream when harmful content detected at evaluation threshold', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    // block when "HARMFUL" appears in accumulated content
    const filterFn = createBlockFilter('HARMFUL');

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 30,
      evaluateEveryChunks: 100, // high so only char threshold triggers
    });

    // send clean chunks first (each ~10 chars)
    const r1 = filter.processChunk('safe text ', 'hr');
    expect(r1.action).toBe('pass');

    const r2 = filter.processChunk('more safe ', 'hr');
    expect(r2.action).toBe('pass');

    // this chunk pushes past char threshold and contains harmful content
    const r3 = filter.processChunk('now HARMFUL data', 'hr');
    expect(r3.action).toBe('kill');
    expect(r3.reason).toContain('HARMFUL');
  });

  it('after kill, subsequent chunks are also killed', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filterFn = createBlockFilter('HARMFUL');

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 10,
      evaluateEveryChunks: 1,
    });

    // trigger kill
    const r1 = filter.processChunk('HARMFUL content', 'hr');
    expect(r1.action).toBe('kill');

    // subsequent chunks should also be kill
    const r2 = filter.processChunk('more text', 'hr');
    expect(r2.action).toBe('kill');
    expect(r2.reason).toContain('HARMFUL');

    const r3 = filter.processChunk('even more', 'hr');
    expect(r3.action).toBe('kill');
  });

  it('kill reason is preserved in subsequent chunks', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filterFn = createBlockFilter('DANGER');

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 5,
      evaluateEveryChunks: 1,
    });

    filter.processChunk('DANGER', 'crypto');

    const subsequent = filter.processChunk('more', 'crypto');
    expect(subsequent.reason).toContain('DANGER');
  });
});

// ---------------------------------------------------------------------------
// LLM3-01: reset
// ---------------------------------------------------------------------------

describe('LLM3-01: createStreamingContentFilter — reset', () => {
  it('reset clears kill state and buffer', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filterFn = createBlockFilter('HARMFUL');

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 5,
      evaluateEveryChunks: 1,
    });

    // trigger kill
    filter.processChunk('HARMFUL content', 'hr');

    // reset
    filter.reset();

    expect(filter.getAccumulatedContent()).toBe('');

    // should pass now since buffer is clean
    const result = filter.processChunk('safe text', 'hr');
    expect(result.action).toBe('pass');
    expect(result.accumulatedContent).toBe('safe text');
  });

  it('reset allows reuse for new stream', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filter = createStreamingContentFilter({
      filterResponse: createAllowFilter(),
      evaluateEveryChars: 10,
    });

    filter.processChunk('stream 1 data', 'core');
    expect(filter.getAccumulatedContent()).toContain('stream 1');

    filter.reset();

    filter.processChunk('stream 2 data', 'core');
    expect(filter.getAccumulatedContent()).toBe('stream 2 data');
    expect(filter.getAccumulatedContent()).not.toContain('stream 1');
  });
});

// ---------------------------------------------------------------------------
// LLM3-01: kill-switch
// ---------------------------------------------------------------------------

describe('LLM3-01: createStreamingContentFilter — kill-switch', () => {
  it('when disabled, harmful content passes through', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filterFn = createBlockFilter('HARMFUL');

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 5,
      evaluateEveryChunks: 1,
      isEnabled: () => false, // disabled
    });

    const result = filter.processChunk('HARMFUL content', 'hr');

    expect(result.action).toBe('pass');
    expect(filterFn).not.toHaveBeenCalled();
  });

  it('when enabled, harmful content is blocked', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filterFn = createBlockFilter('HARMFUL');

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 5,
      evaluateEveryChunks: 1,
      isEnabled: () => true, // enabled
    });

    const result = filter.processChunk('HARMFUL content', 'hr');

    expect(result.action).toBe('kill');
  });

  it('without isEnabled config, filter is active by default', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filterFn = createBlockFilter('HARMFUL');

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 5,
      evaluateEveryChunks: 1,
      // no isEnabled — defaults to active
    });

    const result = filter.processChunk('HARMFUL content', 'hr');

    expect(result.action).toBe('kill');
  });
});

// ---------------------------------------------------------------------------
// LLM3-01: evaluation thresholds
// ---------------------------------------------------------------------------

describe('LLM3-01: createStreamingContentFilter — evaluation thresholds', () => {
  it('does not evaluate every chunk by default', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filterFn = createAllowFilter();

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 200, // high threshold
      evaluateEveryChunks: 5,
    });

    // send 3 small chunks — should not trigger evaluation (not at chunk 5 and not 200 chars)
    filter.processChunk('a', 'core');
    filter.processChunk('b', 'core');
    filter.processChunk('c', 'core');

    // filterFn should not be called for small chunks below both thresholds
    expect(filterFn).not.toHaveBeenCalled();
  });

  it('evaluates at chunk interval threshold', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filterFn = createAllowFilter();

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 10000, // high so only chunk threshold triggers
      evaluateEveryChunks: 3,
    });

    filter.processChunk('a', 'core'); // chunk 1
    filter.processChunk('b', 'core'); // chunk 2
    filter.processChunk('c', 'core'); // chunk 3 — triggers at chunkCount % 3 === 0

    expect(filterFn).toHaveBeenCalledTimes(1);
  });

  it('evaluates at char threshold', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filterFn = createAllowFilter();

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 20,
      evaluateEveryChunks: 1000, // high so only char threshold triggers
    });

    // send a chunk that exceeds 20 chars
    filter.processChunk('this is a longer chunk that exceeds twenty chars', 'core');

    expect(filterFn).toHaveBeenCalledTimes(1);
  });

  it('custom evaluation intervals are respected', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filterFn = createAllowFilter();

    const filter = createStreamingContentFilter({
      filterResponse: filterFn,
      evaluateEveryChars: 10,
      evaluateEveryChunks: 2,
    });

    filter.processChunk('12345', 'core'); // chunk 1, 5 chars — no eval
    expect(filterFn).not.toHaveBeenCalled();

    filter.processChunk('67890', 'core'); // chunk 2 — triggers chunk threshold (2%2===0)
    expect(filterFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// LLM3-01: filter error
// ---------------------------------------------------------------------------

describe('LLM3-01: createStreamingContentFilter — filter error', () => {
  it('filter error triggers kill', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filter = createStreamingContentFilter({
      filterResponse: createErrorFilter(),
      evaluateEveryChars: 5,
      evaluateEveryChunks: 1,
    });

    const result = filter.processChunk('any content', 'core');

    expect(result.action).toBe('kill');
    expect(result.reason).toBe('filter error');
  });

  it('filter error sets permanent kill state', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filter = createStreamingContentFilter({
      filterResponse: createErrorFilter(),
      evaluateEveryChars: 5,
      evaluateEveryChunks: 1,
    });

    filter.processChunk('first', 'core');
    const second = filter.processChunk('second', 'core');

    expect(second.action).toBe('kill');
    expect(second.reason).toBe('filter error');
  });
});

// ---------------------------------------------------------------------------
// LLM3-01: getAccumulatedContent
// ---------------------------------------------------------------------------

describe('LLM3-01: createStreamingContentFilter — getAccumulatedContent', () => {
  it('returns empty string before any chunks', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filter = createStreamingContentFilter({
      filterResponse: createAllowFilter(),
    });

    expect(filter.getAccumulatedContent()).toBe('');
  });

  it('returns full buffer after multiple chunks', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filter = createStreamingContentFilter({
      filterResponse: createAllowFilter(),
    });

    filter.processChunk('hello ', 'core');
    filter.processChunk('world ', 'core');
    filter.processChunk('!', 'core');

    expect(filter.getAccumulatedContent()).toBe('hello world !');
  });

  it('returns buffer even after kill', async () => {
    const { createStreamingContentFilter } = await import(
      '@aptivo/llm-gateway'
    );

    const filter = createStreamingContentFilter({
      filterResponse: createBlockFilter('BAD'),
      evaluateEveryChars: 1,
      evaluateEveryChunks: 1,
    });

    filter.processChunk('good ', 'core');
    filter.processChunk('BAD stuff', 'core');
    filter.processChunk(' more', 'core');

    expect(filter.getAccumulatedContent()).toBe('good BAD stuff more');
  });
});

// ---------------------------------------------------------------------------
// LLM3-01: barrel export verification
// ---------------------------------------------------------------------------

describe('LLM3-01: Barrel Exports', () => {
  it('createStreamingContentFilter is exported from @aptivo/llm-gateway', async () => {
    const llmGateway = await import('@aptivo/llm-gateway');
    expect(typeof llmGateway.createStreamingContentFilter).toBe('function');
  });

  it('safety index re-exports streaming content filter', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(
      new URL('../../../packages/llm-gateway/src/safety/index.ts', import.meta.url),
      'utf-8',
    );

    expect(source).toContain('createStreamingContentFilter');
    expect(source).toContain('StreamingFilterConfig');
    expect(source).toContain('ChunkResult');
  });
});
