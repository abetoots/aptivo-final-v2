/**
 * S17-B2: FeatureFlagService.peekEnabled tests
 * @task S17-B2
 *
 * Verifies the synchronous cache-peek API used by safety-gate
 * isEnabled callbacks (LLM gateway). Three behaviours per S17 plan AC:
 *   - cold cache → returns defaultValue
 *   - after async warm/isEnabled → returns the cached enabled value sync
 *   - cache stays populated through subsequent provider re-fetches
 *     (stale-while-revalidate; no implicit eviction)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createFeatureFlagService,
  type FeatureFlag,
  type FeatureFlagProvider,
} from '../../src/lib/feature-flags/feature-flag-service.js';

function createProvider(initialFlags: FeatureFlag[]): FeatureFlagProvider & {
  setFlags: (next: FeatureFlag[]) => void;
  getFlagSpy: ReturnType<typeof vi.fn>;
  getAllFlagsSpy: ReturnType<typeof vi.fn>;
} {
  let flags = [...initialFlags];
  const getFlagSpy = vi.fn(async (key: string) => flags.find((f) => f.key === key) ?? null);
  const getAllFlagsSpy = vi.fn(async () => [...flags]);
  return {
    setFlags: (next) => {
      flags = [...next];
    },
    getFlagSpy,
    getAllFlagsSpy,
    getFlag: getFlagSpy,
    getAllFlags: getAllFlagsSpy,
  };
}

describe('S17-B2: FeatureFlagService.peekEnabled', () => {
  it('returns defaultValue when the cache is cold (no warm or async call yet)', () => {
    const provider = createProvider([
      { key: 'ml-injection-classifier', enabled: true },
    ]);
    const service = createFeatureFlagService({ provider });

    expect(service.peekEnabled('ml-injection-classifier', false)).toBe(false);
    expect(service.peekEnabled('unknown-flag', true)).toBe(true);
    // cold peek does NOT touch the provider — that's the whole point
    expect(provider.getFlagSpy).not.toHaveBeenCalled();
    expect(provider.getAllFlagsSpy).not.toHaveBeenCalled();
  });

  it('reflects the warmed value synchronously after warm() resolves', async () => {
    const provider = createProvider([
      { key: 'ml-injection-classifier', enabled: true },
      { key: 'anomaly-blocking', enabled: false },
    ]);
    const service = createFeatureFlagService({ provider });

    await service.warm();

    expect(service.peekEnabled('ml-injection-classifier', false)).toBe(true);
    expect(service.peekEnabled('anomaly-blocking', true)).toBe(false);
  });

  it('write-throughs from isEnabled — peek hits the cache after one async call', async () => {
    const provider = createProvider([
      { key: 'ml-injection-classifier', enabled: true },
    ]);
    const service = createFeatureFlagService({ provider });

    expect(service.peekEnabled('ml-injection-classifier', false)).toBe(false);
    await service.isEnabled('ml-injection-classifier');
    expect(service.peekEnabled('ml-injection-classifier', false)).toBe(true);
  });

  it('preserves last-known value across provider re-fetches (stale-while-revalidate)', async () => {
    const provider = createProvider([
      { key: 'anomaly-blocking', enabled: true },
    ]);
    const service = createFeatureFlagService({ provider });

    await service.warm();
    expect(service.peekEnabled('anomaly-blocking', false)).toBe(true);

    // simulate provider transient failure between re-warms
    provider.getAllFlagsSpy.mockRejectedValueOnce(new Error('transient'));
    await service.warm();
    // last-known value preserved — defaultValue is NOT returned
    expect(service.peekEnabled('anomaly-blocking', false)).toBe(true);
  });

  it('reflects updates from a later warm() once the provider returns new values', async () => {
    const provider = createProvider([
      { key: 'anomaly-blocking', enabled: false },
    ]);
    const service = createFeatureFlagService({ provider });

    await service.warm();
    expect(service.peekEnabled('anomaly-blocking', true)).toBe(false);

    provider.setFlags([{ key: 'anomaly-blocking', enabled: true }]);
    await service.warm();
    expect(service.peekEnabled('anomaly-blocking', false)).toBe(true);
  });

  it('evicts cache entries that are removed from the provider on the next warm() (snapshot-replace)', async () => {
    const provider = createProvider([
      { key: 'flag-a', enabled: true },
      { key: 'flag-b', enabled: true },
    ]);
    const service = createFeatureFlagService({ provider });
    await service.warm();
    expect(service.peekEnabled('flag-a', false)).toBe(true);
    expect(service.peekEnabled('flag-b', false)).toBe(true);

    // provider drops flag-b (e.g. admin removed it from the registry)
    provider.setFlags([{ key: 'flag-a', enabled: true }]);
    await service.warm();

    expect(service.peekEnabled('flag-a', false)).toBe(true);
    // flag-b is gone — peek returns defaultValue, not the stale `true`
    expect(service.peekEnabled('flag-b', false)).toBe(false);
  });

  it('emits feature_flag_warm_failed via the injected logger when warm() catches', async () => {
    const provider = createProvider([{ key: 'anomaly-blocking', enabled: true }]);
    provider.getAllFlagsSpy.mockRejectedValueOnce(new Error('provider down'));

    const logger = { warn: vi.fn() };
    const service = createFeatureFlagService({ provider, logger });

    await service.warm();

    expect(logger.warn).toHaveBeenCalledWith(
      'feature_flag_warm_failed',
      expect.objectContaining({ cause: expect.stringContaining('provider down') }),
    );
  });

  it('does NOT apply rule-based targeting — only the flag default `enabled` is returned', async () => {
    // sync peek can't carry context, so rules are deliberately skipped
    const provider = createProvider([
      {
        key: 'ml-injection-classifier',
        enabled: false,
        rules: [
          {
            attribute: 'userId',
            operator: 'eq',
            value: 'admin',
            result: { enabled: true },
          },
        ],
      },
    ]);
    const service = createFeatureFlagService({ provider });
    await service.warm();

    // a context-targeted rule WOULD flip this to true via isEnabled,
    // but peek returns the unconditional default
    expect(service.peekEnabled('ml-injection-classifier', false)).toBe(false);
  });
});
