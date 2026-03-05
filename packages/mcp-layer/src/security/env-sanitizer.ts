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

export function sanitizeEnvForMcp(
  _env: Record<string, string | undefined>,
  _allowlist?: string[],
): Record<string, string> {
  // TODO: Implement in SP-06 spike execution
  // Filter env vars: only pass allowlisted vars, block all matching BLOCKED_ENV_PATTERNS
  throw new Error('Not implemented — SP-06 spike pending');
}

export function isBlockedEnvVar(name: string): boolean {
  return BLOCKED_ENV_PATTERNS.some((pattern) => pattern.test(name));
}
