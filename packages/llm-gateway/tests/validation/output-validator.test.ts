/**
 * S1-W13: Output Validator Tests
 * @task LLM-08
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { validateOutput, validateTextOutput } from '../../src/validation/output-validator.js';

describe('validateOutput', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number().min(0),
  });

  it('validates correct JSON against schema', () => {
    const result = validateOutput('{"name":"Alice","age":30}', schema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ name: 'Alice', age: 30 });
    }
  });

  it('rejects JSON that does not match schema', () => {
    const result = validateOutput('{"name":"Alice","age":-1}', schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('OutputValidationFailed');
      if (result.error._tag === 'OutputValidationFailed') {
        expect(result.error.zodErrors).toContain('age');
      }
    }
  });

  it('rejects non-JSON content', () => {
    const result = validateOutput('this is not json', schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('OutputValidationFailed');
      if (result.error._tag === 'OutputValidationFailed') {
        expect(result.error.zodErrors).toContain('not valid JSON');
      }
    }
  });

  it('rejects empty string', () => {
    const result = validateOutput('', schema);
    expect(result.ok).toBe(false);
  });

  it('handles extra fields (strip by default)', () => {
    const result = validateOutput('{"name":"Alice","age":30,"extra":"field"}', schema);
    expect(result.ok).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = validateOutput('{"name":"Alice"}', schema);
    expect(result.ok).toBe(false);
  });

  it('prevents injection via unexpected types', () => {
    // llm returns a string where a number is expected
    const result = validateOutput('{"name":"Alice","age":"not-a-number"}', schema);
    expect(result.ok).toBe(false);
  });
});

describe('validateTextOutput', () => {
  it('accepts non-empty text', () => {
    const result = validateTextOutput('Hello world');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('Hello world');
    }
  });

  it('rejects empty string', () => {
    const result = validateTextOutput('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error._tag).toBe('OutputValidationFailed');
    }
  });
});
