/**
 * SP-06: MCP Server Security — Environment Sanitization
 * @spike SP-06
 * @frd FR-CORE-MCP-001
 * @add ADD §5.1 (MCP Trust)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-06
 */

/** Environment variables that must NEVER be passed to MCP servers */
const BLOCKED_ENV_PATTERNS = [
  /^DATABASE_/,
  /^REDIS_/,
  /^AUTH_/,
  /^SUPABASE_/,
  /^INNGEST_/,
  /^NOVU_/,
  /^OPENAI_/,
  /^ANTHROPIC_/,
  /^GOOGLE_AI_/,
  /^SENTRY_/,
  /^HITL_/,
  /SECRET/i,
  /PASSWORD/i,
  /TOKEN/i,
  /KEY/i,
] as const;

/** safe vars always included (system-level, never sensitive) */
const SAFE_SYSTEM_VARS = [
  'NODE_ENV',
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'TZ',
  'TERM',
] as const;

/**
 * Sanitizes environment variables for an MCP child process.
 *
 * Only vars explicitly listed in `allowlist` (plus safe system vars) are
 * passed through. Any var matching BLOCKED_ENV_PATTERNS is rejected even
 * if it appears in the allowlist — blocked patterns always win.
 *
 * @param env - source environment (typically `process.env`)
 * @param allowlist - explicit list of var names the server needs
 * @returns clean env with no undefined values
 */
export function sanitizeEnvForMcp(
  env: Record<string, string | undefined>,
  allowlist: string[] = [],
): Record<string, string> {
  const permitted = new Set([...SAFE_SYSTEM_VARS, ...allowlist]);
  const result: Record<string, string> = {};

  for (const name of permitted) {
    const value = env[name];
    if (value === undefined) continue;
    if (isBlockedEnvVar(name)) continue; // blocked patterns override allowlist
    result[name] = value;
  }

  return result;
}

/** returns true if a var name matches any blocked pattern */
export function isBlockedEnvVar(name: string): boolean {
  return BLOCKED_ENV_PATTERNS.some((pattern) => pattern.test(name));
}
