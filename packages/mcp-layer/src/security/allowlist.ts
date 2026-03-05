/**
 * SP-06: MCP Server Security — Server Allowlist
 * @spike SP-06
 * @frd FR-CORE-MCP-001
 * @add ADD §5.1 (MCP Trust)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-06
 */

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  allowedEnv?: string[];
  maxConcurrent?: number;
}

export function validateServerConfig(
  _config: McpServerConfig,
  _allowlist: McpServerConfig[],
): boolean {
  // TODO: Implement in SP-06 spike execution
  throw new Error('Not implemented — SP-06 spike pending');
}
