/**
 * LLM2-02: Content Filtering Pipeline — Filter Service
 * @task LLM2-02
 *
 * domain-aware content filter that scans messages pre-request
 * and post-response against denylist patterns. categories are
 * selectively enforced based on the domain's policy tier
 * (strict / moderate / permissive).
 */

import { Result } from '@aptivo/types';
import type {
  ContentFilterVerdict,
  ContentFilterConfig,
  Domain,
  DomainPolicyTier,
} from './safety-types.js';
import { DEFAULT_DOMAIN_TIERS, DEFAULT_TIER_CATEGORIES } from './safety-types.js';
import { DEFAULT_CONTENT_PATTERNS } from './content-patterns.js';

// ---------------------------------------------------------------------------
// error type
// ---------------------------------------------------------------------------

export interface ContentFilterError {
  readonly _tag: 'ContentBlocked';
  readonly stage: 'pre_request' | 'post_response';
  readonly reason: string;
  readonly category: string;
}

// ---------------------------------------------------------------------------
// factory
// ---------------------------------------------------------------------------

export function createContentFilter(config?: Partial<ContentFilterConfig>) {
  const domainTiers = config?.domainTiers ?? DEFAULT_DOMAIN_TIERS;
  const tierCategories = config?.tierCategories ?? DEFAULT_TIER_CATEGORIES;
  const patterns = DEFAULT_CONTENT_PATTERNS;

  function getTier(domain: Domain): DomainPolicyTier {
    return domainTiers[domain] ?? 'permissive';
  }

  function getEnforcedCategories(domain: Domain): string[] {
    return tierCategories[getTier(domain)] ?? tierCategories['permissive'];
  }

  function checkPatterns(
    text: string,
    stage: 'pre_request' | 'post_response',
    domain: Domain,
  ): ContentFilterVerdict {
    const enforced = getEnforcedCategories(domain);

    for (const p of patterns) {
      if (p.stage !== stage && p.stage !== 'both') continue;
      if (!enforced.includes(p.category)) continue;
      if (p.pattern.test(text)) {
        return {
          allowed: false,
          stage,
          reason: p.description,
          category: p.category,
          domain,
        };
      }
    }

    return { allowed: true, stage, domain };
  }

  return {
    /**
     * scans all messages before sending to the provider.
     * returns the original messages if allowed, or an error if blocked.
     */
    filterRequest(
      messages: Array<{ role: string; content: string }>,
      domain: Domain,
    ): Result<Array<{ role: string; content: string }>, ContentFilterError> {
      for (const msg of messages) {
        const verdict = checkPatterns(msg.content, 'pre_request', domain);
        if (!verdict.allowed) {
          return Result.err({
            _tag: 'ContentBlocked',
            stage: 'pre_request',
            reason: verdict.reason!,
            category: verdict.category!,
          });
        }
      }
      return Result.ok(messages);
    },

    /**
     * scans provider response content before returning to the caller.
     * returns the original content if allowed, or an error if blocked.
     */
    filterResponse(
      content: string,
      domain: Domain,
    ): Result<string, ContentFilterError> {
      const verdict = checkPatterns(content, 'post_response', domain);
      if (!verdict.allowed) {
        return Result.err({
          _tag: 'ContentBlocked',
          stage: 'post_response',
          reason: verdict.reason!,
          category: verdict.category!,
        });
      }
      return Result.ok(content);
    },
  };
}

export type ContentFilter = ReturnType<typeof createContentFilter>;
