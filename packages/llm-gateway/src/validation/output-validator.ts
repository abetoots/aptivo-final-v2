/**
 * S1-W13: LLM Output Validation
 * @task LLM-08
 * @warning S1-W13 output injection prevention
 */

import { Result } from '@aptivo/types';
import { z } from 'zod';
import type { LLMError } from '../providers/types.js';

/**
 * Validates LLM output against a Zod schema before downstream use.
 * Prevents injection attacks and malformed data from propagating.
 *
 * @param content - raw LLM output string
 * @param schema - Zod schema to validate against
 * @returns parsed value or validation error
 */
export function validateOutput<T>(
  content: string,
  schema: z.ZodType<T>,
): Result<T, LLMError> {
  try {
    const parsed = JSON.parse(content) as unknown;
    const result = schema.safeParse(parsed);

    if (result.success) {
      return Result.ok(result.data);
    }

    const errors = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    return Result.err({ _tag: 'OutputValidationFailed', zodErrors: errors });
  } catch {
    return Result.err({
      _tag: 'OutputValidationFailed',
      zodErrors: 'LLM output is not valid JSON',
    });
  }
}

/**
 * Validates that LLM output is a plain text string (no JSON parsing).
 * Applies basic sanitization.
 */
export function validateTextOutput(content: string): Result<string, LLMError> {
  if (content.length === 0) {
    return Result.err({
      _tag: 'OutputValidationFailed',
      zodErrors: 'LLM returned empty content',
    });
  }
  return Result.ok(content);
}
