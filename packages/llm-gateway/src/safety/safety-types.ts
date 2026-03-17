/**
 * LLM2-01: Prompt Injection Detection — Types
 * @task LLM2-01
 * @spec docs/04-specs/platform-core/llm-gateway.md
 */

// ---------------------------------------------------------------------------
// domain & verdict types
// ---------------------------------------------------------------------------

export type Domain = 'core' | 'crypto' | 'hr' | string;

export interface InjectionVerdict {
  readonly verdict: 'allow' | 'challenge' | 'block';
  readonly score: number; // 0.0-1.0
  readonly matchedPatterns: string[];
  readonly domain: Domain;
}

export interface DomainThresholds {
  readonly challengeAt: number;
  readonly blockAt: number;
}

export interface PatternCategory {
  readonly name: string;
  readonly weight: number; // 0.0-1.0
  readonly patterns: RegExp[];
}

export interface InjectionClassifierConfig {
  readonly domainThresholds: Record<Domain, DomainThresholds>;
  readonly patterns?: PatternCategory[];
}

// ---------------------------------------------------------------------------
// default thresholds per domain
// ---------------------------------------------------------------------------

export const DEFAULT_DOMAIN_THRESHOLDS: Record<string, DomainThresholds> = {
  core: { challengeAt: 0.4, blockAt: 0.8 },
  crypto: { challengeAt: 0.3, blockAt: 0.7 },
  hr: { challengeAt: 0.2, blockAt: 0.5 },
};

// ---------------------------------------------------------------------------
// LLM2-02: content filtering types
// ---------------------------------------------------------------------------

export type ContentFilterStage = 'pre_request' | 'post_response';

export interface ContentFilterVerdict {
  allowed: boolean;
  stage: ContentFilterStage;
  reason?: string;
  category?: string;
  domain: Domain;
}

export type DomainPolicyTier = 'strict' | 'moderate' | 'permissive';

export interface ContentFilterConfig {
  domainTiers: Record<Domain, DomainPolicyTier>;
  tierCategories: Record<DomainPolicyTier, string[]>;
}

export const DEFAULT_DOMAIN_TIERS: Record<string, DomainPolicyTier> = {
  hr: 'strict',
  crypto: 'moderate',
  core: 'permissive',
};

// categories enforced per tier
export const DEFAULT_TIER_CATEGORIES: Record<DomainPolicyTier, string[]> = {
  strict: ['harmful_instructions', 'pii_solicitation', 'unauthorized_disclosure', 'pii_generation', 'unqualified_advice', 'harmful_content'],
  moderate: ['harmful_instructions', 'pii_solicitation', 'pii_generation', 'unqualified_advice', 'harmful_content'],
  permissive: ['harmful_instructions', 'harmful_content'],
};
