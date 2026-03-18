/**
 * PR-06: SMTP notification failback activation — env-based config validator
 * @task PR-06
 *
 * validates smtp configuration from environment variables using zod,
 * with tagged union errors following the Result<T, E> pattern.
 * also provides a deliverability check helper for dns record validation.
 */

import { z } from 'zod';
import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// schema
// ---------------------------------------------------------------------------

export const SmtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  user: z.string().min(1),
  pass: z.string().min(1),
  from: z.string().email(),
  secure: z.boolean().default(false),
});

export type SmtpConfig = z.infer<typeof SmtpConfigSchema>;

// ---------------------------------------------------------------------------
// error types
// ---------------------------------------------------------------------------

export type SmtpConfigError =
  | { readonly _tag: 'ValidationError'; readonly message: string }
  | { readonly _tag: 'MissingEnvError'; readonly vars: string[] };

// ---------------------------------------------------------------------------
// env-based validation
// ---------------------------------------------------------------------------

export function validateSmtpEnvConfig(): Result<SmtpConfig, SmtpConfigError> {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  const secure = process.env.SMTP_SECURE;

  const missing = [
    !host && 'SMTP_HOST',
    !port && 'SMTP_PORT',
    !user && 'SMTP_USER',
    !pass && 'SMTP_PASS',
    !from && 'SMTP_FROM',
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    return Result.err({ _tag: 'MissingEnvError', vars: missing });
  }

  const parsed = SmtpConfigSchema.safeParse({
    host,
    port: Number(port),
    user,
    pass,
    from,
    secure: secure === 'true',
  });

  if (!parsed.success) {
    return Result.err({ _tag: 'ValidationError', message: parsed.error.message });
  }

  return Result.ok(parsed.data);
}

// ---------------------------------------------------------------------------
// deliverability check helper
// ---------------------------------------------------------------------------

/**
 * checks spf/dkim record presence for a given domain.
 * in production this would perform actual dns lookups;
 * currently returns a structural placeholder for documentation.
 */
export function checkDeliverability(domain: string): {
  spf: boolean;
  dkim: boolean;
  recommendation: string;
} {
  return {
    spf: true,
    dkim: true,
    recommendation: `Ensure SPF and DKIM records are configured for ${domain}`,
  };
}
