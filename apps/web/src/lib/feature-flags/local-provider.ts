/**
 * FEAT-03: Local JSON Feature Flag Provider
 * @task FEAT-03
 *
 * in-memory feature flag provider backed by a static flag array.
 * swap for a remote provider (e.g., LaunchDarkly, Unleash) when needed.
 */

import type { FeatureFlagProvider, FeatureFlag } from './feature-flag-service.js';

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createLocalFlagProvider(flags: FeatureFlag[]): FeatureFlagProvider {
  const flagMap = new Map(flags.map((f) => [f.key, f]));

  return {
    async getFlag(key) {
      return flagMap.get(key) ?? null;
    },
    async getAllFlags() {
      return [...flagMap.values()];
    },
  };
}

// ---------------------------------------------------------------------------
// default platform flags
// ---------------------------------------------------------------------------

export const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: 'multi-approver-hitl',
    enabled: true,
    description: 'enable multi-approver HITL v2 engine',
  },
  {
    key: 'llm-safety-pipeline',
    enabled: true,
    description: 'enable prompt injection + content filtering',
  },
  {
    key: 'burn-rate-alerting',
    enabled: true,
    description: 'enable burn-rate SLO alerts',
  },
  {
    key: 'smtp-fallback',
    enabled: false,
    description: 'enable SMTP notification fallback',
  },
  {
    key: 'workflow-crud',
    enabled: false,
    variant: 'beta',
    description: 'workflow definition CRUD API',
  },
  {
    key: 'llm-streaming-filter',
    enabled: false,
    description: 'enable streaming content filter (deny-by-default)',
  },
];
