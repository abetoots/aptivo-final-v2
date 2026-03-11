/**
 * NOTIF-02: Safe template variable substitution
 * @task NOTIF-02
 * @frd FR-CORE-NOTIF-001
 *
 * Safe {{var}} replacement with optional Zod schema validation.
 * No eval, no expression support — regex-only substitution.
 */

import { Result } from '@aptivo/types';
import { z } from 'zod';
import type { NotificationError } from '../types.js';

/**
 * Render a template string by replacing {{var}} placeholders with values.
 *
 * - If variableSchema is provided, validates variables against it first
 * - Missing required variables → RenderError
 * - Unmatched placeholders → RenderError
 */
export function renderTemplate(
  body: string,
  variables: Record<string, unknown>,
  variableSchema?: Record<string, unknown> | null,
): Result<string, NotificationError> {
  // validate against schema if provided
  if (variableSchema) {
    const schema = buildZodSchema(variableSchema);
    const parseResult = schema.safeParse(variables);
    if (!parseResult.success) {
      const message = parseResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return Result.err({ _tag: 'RenderError', message: `Variable validation failed: ${message}` });
    }
  }

  // find all placeholders
  const placeholders = body.match(/\{\{(\w+)\}\}/g);
  if (!placeholders) {
    return Result.ok(body);
  }

  // check for missing variables
  const missingVars: string[] = [];
  for (const placeholder of placeholders) {
    const key = placeholder.slice(2, -2);
    if (!(key in variables) || variables[key] === undefined) {
      missingVars.push(key);
    }
  }

  if (missingVars.length > 0) {
    return Result.err({
      _tag: 'RenderError',
      message: `Missing required template variables: ${missingVars.join(', ')}`,
    });
  }

  // substitute
  const rendered = body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(variables[key] ?? ''));
  return Result.ok(rendered);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Build a Zod schema from a simple JSON schema-like definition.
 * Supports: { fieldName: "string" | "number" | "boolean" }
 * For more complex schemas, consumers provide full Zod schemas.
 */
function buildZodSchema(schema: Record<string, unknown>): z.ZodSchema {
  const shape: Record<string, z.ZodSchema> = {};

  for (const [key, type] of Object.entries(schema)) {
    switch (type) {
      case 'string':
        shape[key] = z.string();
        break;
      case 'number':
        shape[key] = z.number();
        break;
      case 'boolean':
        shape[key] = z.boolean();
        break;
      default:
        // treat unknown types as any
        shape[key] = z.unknown();
    }
  }

  return z.object(shape).passthrough();
}
