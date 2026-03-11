/**
 * SP-06: MCP Server Security — Server Allowlist
 * @spike SP-06
 * @frd FR-CORE-MCP-001
 * @add ADD §5.1 (MCP Trust)
 * @see docs/06-sprints/sprint-0-technical-spikes.md#sp-06
 */

export interface McpServerConfig {
  /** unique server identifier */
  name: string;
  /** executable command (must match exactly) */
  command: string;
  /** command-line arguments (must match exactly if specified in allowlist) */
  args?: string[];
  /** env vars this server is permitted to receive */
  allowedEnv?: string[];
  /** max concurrent instances */
  maxConcurrent?: number;
}

/**
 * Validates a server config against the approved allowlist.
 *
 * Matching rules:
 * - `name` must match an entry in the allowlist exactly
 * - `command` must match the allowlist entry exactly
 * - if the allowlist entry specifies `args`, the config's args must match exactly
 *
 * @returns true if the config matches an allowlist entry, false otherwise
 */
export function validateServerConfig(
  config: McpServerConfig,
  allowlist: McpServerConfig[],
): boolean {
  return allowlist.some((entry) => {
    if (entry.name !== config.name) return false;
    if (entry.command !== config.command) return false;

    // if the allowlist entry constrains args, they must match exactly
    if (entry.args !== undefined) {
      const configArgs = config.args ?? [];
      if (entry.args.length !== configArgs.length) return false;
      if (!entry.args.every((arg, i) => arg === configArgs[i])) return false;
    }

    return true;
  });
}
