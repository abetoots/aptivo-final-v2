/**
 * LLM2-01: Prompt Injection Detection — Pattern Definitions
 * @task LLM2-01
 *
 * defines at least 15 regex patterns across 4 categories
 * for detecting common prompt injection techniques.
 */

import type { PatternCategory } from './safety-types.js';

// ---------------------------------------------------------------------------
// default injection patterns (4 categories, 16 patterns)
// ---------------------------------------------------------------------------

export const DEFAULT_INJECTION_PATTERNS: PatternCategory[] = [
  {
    name: 'instruction_override',
    weight: 0.9,
    patterns: [
      /ignore\s+(all\s+)?previous\s+instructions/i,
      /disregard\s+(all\s+)?prior\s+(instructions|context)/i,
      /forget\s+(everything|all)\s+(above|before)/i,
      /override\s+system\s+prompt/i,
      /new\s+instructions?\s*:/i,
    ],
  },
  {
    name: 'role_play',
    weight: 0.7,
    patterns: [
      /you\s+are\s+now\s+(?:DAN|jailbreak|unrestricted)/i,
      /act\s+as\s+(?:an?\s+)?(?:evil|unrestricted|unfiltered)/i,
      /pretend\s+(?:you\s+(?:are|have)\s+)?no\s+(?:restrictions|rules|limits)/i,
    ],
  },
  {
    name: 'system_extraction',
    weight: 0.5,
    patterns: [
      /(?:repeat|show|display|print|output)\s+(?:your\s+)?system\s+prompt/i,
      /what\s+(?:are|is)\s+your\s+(?:system\s+)?instructions/i,
      /reveal\s+(?:your\s+)?(?:hidden|secret|initial)\s+(?:prompt|instructions)/i,
    ],
  },
  {
    name: 'context_manipulation',
    weight: 0.6,
    patterns: [
      /#{3,}\s*(?:END|BEGIN)\s+(?:SYSTEM|CONTEXT|INSTRUCTIONS)/i,
      /\[(?:SYSTEM|ADMIN|ROOT)\]/i,
      /<\/?(?:system|admin|root)>/i,
      /---+\s*(?:end|begin)\s+(?:of\s+)?(?:system|context)/i,
      /\bBEGIN\s+ADMIN\s+OVERRIDE\b/i,
    ],
  },
];
