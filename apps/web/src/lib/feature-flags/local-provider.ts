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
  {
    key: 'ml-injection-classifier',
    enabled: false,
    description: 'LLM3-02: route injection detection through the ML classifier with rule-based fallback (Replicate). Read by the gateway via FeatureFlagService.peekEnabled (sync, in-process cache). Default off; flip here or via FEATURE_FLAGS env JSON to enable. Cold cache evaluates as off — composition root warms the cache at startup.',
  },
  {
    key: 'anomaly-blocking',
    enabled: false,
    description: 'LLM3-04: enable the anomaly gate to throttle/block LLM requests when audit-detected access patterns exceed a z-score threshold. Read by the gateway via FeatureFlagService.peekEnabled (sync, in-process cache). Default off; flip here or via FEATURE_FLAGS env JSON. Cold cache evaluates as off.',
  },
  {
    key: 'ws-server-enabled',
    enabled: false,
    description: 'WFE3-02: opt-in for consumers that should route real-time traffic through apps/ws-server. Present so staging rollout can proceed independently of app deploy. Wrap-review audit (2026-04-21) caught this was missing from the registry despite being in the original WFE3-02 acceptance criteria.',
  },
];
