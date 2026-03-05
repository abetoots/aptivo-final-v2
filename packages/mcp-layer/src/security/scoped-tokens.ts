/**
 * SP-06: MCP Server Security — Scoped Token Generation
 * @spike SP-06
 * @add ADD §5.1 (MCP Trust)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-06
 */

export interface ScopedTokenOptions {
  serverId: string;
  permissions: string[];
  ttlSeconds: number;
}

export async function generateScopedToken(
  _options: ScopedTokenOptions,
  _signingKey: string,
): Promise<string> {
  // TODO: Implement in SP-06 spike execution
  throw new Error('Not implemented — SP-06 spike pending');
}
