/**
 * LLM2-01: Prompt Injection Detection — barrel exports
 * LLM2-02: Content Filtering Pipeline — barrel exports
 * @task LLM2-01, LLM2-02
 */

// injection classifier (LLM2-01)
export { createInjectionClassifier } from './injection-classifier.js';
export type { InjectionClassifier } from './injection-classifier.js';

export { DEFAULT_INJECTION_PATTERNS } from './injection-patterns.js';

export type {
  Domain,
  InjectionVerdict,
  DomainThresholds,
  PatternCategory,
  InjectionClassifierConfig,
} from './safety-types.js';
export { DEFAULT_DOMAIN_THRESHOLDS } from './safety-types.js';

// content filter (LLM2-02)
export { createContentFilter } from './content-filter.js';
export type { ContentFilter, ContentFilterError } from './content-filter.js';

// streaming content filter (LLM3-01)
export { createStreamingContentFilter } from './streaming-content-filter.js';
export type { StreamingFilterConfig, ChunkResult } from './streaming-content-filter.js';

export { DEFAULT_CONTENT_PATTERNS } from './content-patterns.js';
export type { ContentPattern } from './content-patterns.js';

// eval harness (LLM3-03)
export { runEval, persistEvalResult } from './eval-harness.js';
export type {
  EvalSample,
  EvalCategory,
  EvalResult,
  EvalRunOptions,
  EvalError,
  ConfusionMatrix,
  CategoryMetrics,
} from './eval-harness.js';

// ML injection classifier (LLM3-02)
export {
  createMlInjectionClassifier,
  asAsyncInjectionClassifier,
  ModelVerdictSchema,
} from './ml-injection-classifier.js';
export type {
  AsyncInjectionClassifier,
  ModelClient,
  ModelVerdict,
  Logger,
  MlClassifierDeps,
  UsageSink,
  SafetyInferenceRecord,
} from './ml-injection-classifier.js';

export { createReplicateClient } from './model-client.js';
export type { ReplicateClientConfig } from './model-client.js';

// anomaly gate (LLM3-04)
export { createAnomalyGate } from './anomaly-gate.js';
export type {
  AnomalyGate,
  AnomalyGateDeps,
  GateDecision,
  GateThresholds,
} from './anomaly-gate.js';

export type {
  ContentFilterStage,
  ContentFilterVerdict,
  DomainPolicyTier,
  ContentFilterConfig,
} from './safety-types.js';
export { DEFAULT_DOMAIN_TIERS, DEFAULT_TIER_CATEGORIES } from './safety-types.js';
