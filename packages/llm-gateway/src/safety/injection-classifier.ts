/**
 * LLM2-01: Prompt Injection Detection — Classifier
 * @task LLM2-01
 *
 * pure, synchronous classifier that scores prompts against
 * regex pattern categories and maps scores to domain-specific
 * verdicts (allow / challenge / block).
 */

import { Result } from '@aptivo/types';
import type {
  InjectionVerdict,
  InjectionClassifierConfig,
  Domain,
  PatternCategory,
  DomainThresholds,
} from './safety-types.js';
import { DEFAULT_INJECTION_PATTERNS } from './injection-patterns.js';
import { DEFAULT_DOMAIN_THRESHOLDS } from './safety-types.js';

// ---------------------------------------------------------------------------
// unicode normalization helper
// ---------------------------------------------------------------------------

// nfkd + strip combining diacritical marks + strip zero-width characters
function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')  // combining diacritical marks
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '');  // zero-width + soft hyphen
}

// ---------------------------------------------------------------------------
// classifier factory
// ---------------------------------------------------------------------------

export function createInjectionClassifier(config?: Partial<InjectionClassifierConfig>) {
  const domainThresholds = config?.domainThresholds ?? DEFAULT_DOMAIN_THRESHOLDS;
  const patterns: PatternCategory[] = config?.patterns ?? DEFAULT_INJECTION_PATTERNS;

  return {
    /**
     * classifies a prompt for injection risk within a given domain.
     * returns the highest-weight match score and maps it to a verdict
     * based on the domain's configured thresholds.
     */
    classify(prompt: string, domain: Domain): Result<InjectionVerdict, never> {
      const normalizedPrompt = normalize(prompt);
      const matchedPatterns: string[] = [];
      let maxScore = 0;

      for (const category of patterns) {
        for (const pattern of category.patterns) {
          if (pattern.test(normalizedPrompt)) {
            matchedPatterns.push(category.name);
            maxScore = Math.max(maxScore, category.weight);
            break; // one match per category is enough
          }
        }
      }

      // deduplicate matched pattern names
      const uniqueMatches = [...new Set(matchedPatterns)];

      // resolve domain thresholds (fall back to core)
      const thresholds: DomainThresholds =
        domainThresholds[domain] ??
        domainThresholds['core'] ??
        { challengeAt: 0.4, blockAt: 0.8 };

      let verdict: 'allow' | 'challenge' | 'block' = 'allow';
      if (maxScore >= thresholds.blockAt) {
        verdict = 'block';
      } else if (maxScore >= thresholds.challengeAt) {
        verdict = 'challenge';
      }

      return Result.ok({
        verdict,
        score: maxScore,
        matchedPatterns: uniqueMatches,
        domain,
      });
    },
  };
}

export type InjectionClassifier = ReturnType<typeof createInjectionClassifier>;
