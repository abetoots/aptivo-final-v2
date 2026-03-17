/**
 * LLM2-02: Content Filtering Pipeline — Pattern Definitions
 * @task LLM2-02
 *
 * denylist patterns for pre-request and post-response content filtering.
 * each pattern is tagged with a category and stage so the filter can
 * selectively enforce them based on the domain's policy tier.
 */

// ---------------------------------------------------------------------------
// pattern shape
// ---------------------------------------------------------------------------

export interface ContentPattern {
  category: string;
  stage: 'pre_request' | 'post_response' | 'both';
  pattern: RegExp;
  description: string;
}

// ---------------------------------------------------------------------------
// default content patterns
// ---------------------------------------------------------------------------

export const DEFAULT_CONTENT_PATTERNS: ContentPattern[] = [
  // pre-request: harmful instructions
  { category: 'harmful_instructions', stage: 'both', pattern: /how\s+to\s+(?:hack|break\s+into|exploit)/i, description: 'hacking instructions' },
  { category: 'harmful_instructions', stage: 'both', pattern: /(?:create|build|make)\s+(?:a\s+)?(?:bomb|weapon|explosive)/i, description: 'weapon instructions' },
  { category: 'harmful_instructions', stage: 'both', pattern: /(?:synthesize|manufacture)\s+(?:drugs|narcotics|meth)/i, description: 'drug synthesis' },

  // pre-request: PII solicitation
  { category: 'pii_solicitation', stage: 'pre_request', pattern: /(?:give|tell|provide|show)\s+(?:me\s+)?(?:someone(?:'s)?|a\s+person(?:'s)?)\s+(?:SSN|social\s+security|credit\s+card|bank\s+account)/i, description: 'PII request' },
  { category: 'pii_solicitation', stage: 'pre_request', pattern: /(?:find|lookup|search)\s+(?:someone(?:'s)?)\s+(?:address|phone|email)/i, description: 'personal info lookup' },

  // pre-request: unauthorized disclosure
  { category: 'unauthorized_disclosure', stage: 'pre_request', pattern: /(?:leak|expose|share)\s+(?:confidential|private|internal)\s+(?:data|info|documents)/i, description: 'data leak request' },

  // post-response: PII generation
  { category: 'pii_generation', stage: 'post_response', pattern: /\b\d{3}-\d{2}-\d{4}\b/, description: 'SSN pattern detected' },
  { category: 'pii_generation', stage: 'post_response', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, description: 'credit card pattern detected' },

  // post-response: unqualified advice
  { category: 'unqualified_advice', stage: 'post_response', pattern: /you\s+should\s+(?:definitely\s+)?(?:buy|sell|invest\s+in)\s+(?:this|the)\s+(?:stock|crypto|coin|token)/i, description: 'unqualified investment advice' },
  { category: 'unqualified_advice', stage: 'post_response', pattern: /(?:I\s+recommend|you\s+must)\s+(?:take|stop\s+taking)\s+(?:this\s+)?(?:medication|medicine|drug)/i, description: 'unqualified medical advice' },

  // both: harmful content
  { category: 'harmful_content', stage: 'both', pattern: /(?:kill|murder|assassinate)\s+(?:yourself|someone|a\s+person)/i, description: 'violence incitement' },
];
