/**
 * MCP-06: Wrapper service — composites pipeline
 * @task MCP-06
 *
 * Pipeline order:
 *   1. registry.getTool   → ToolNotFound | ToolDisabled
 *   2. validateServerConfig → ServerNotAllowed
 *   3. generateScopedToken → TokenGenerationError
 *   4. cache?.get          → return cached if hit
 *   5. rateLimiter.check   → RateLimitExceeded
 *   6. circuitBreaker      → CircuitOpen | TransportError
 *   7. checkResponseSize   → ResponseTooLarge (S1-W14)
 *   8. cache?.set          → fire-and-forget save
 *   9. return Result.ok
 */

import { Result } from '@aptivo/types';
import { CircuitOpenError } from '../resilience/circuit-breaker.js';
import { validateServerConfig } from '../security/allowlist.js';
import { generateScopedToken } from '../security/scoped-tokens.js';
import { normalizeCacheKey } from '../cache/cache-store.js';
import type { ToolCallResult } from '../transport/transport-types.js';
import type { McpError, McpWrapper, McpWrapperDeps } from './mcp-wrapper-types.js';

export function createMcpWrapper(deps: McpWrapperDeps): McpWrapper {
  const log = deps.logger ?? { info() {}, warn() {}, error() {} };

  return {
    async executeTool(
      serverId: string,
      toolName: string,
      input: Record<string, unknown>,
    ): Promise<Result<ToolCallResult, McpError>> {
      // 1. registry lookup
      const tool = await deps.registry.getTool(serverId, toolName);
      if (!tool) {
        return Result.err({ _tag: 'ToolNotFound', tool: toolName, server: serverId });
      }
      if (!tool.isEnabled) {
        return Result.err({ _tag: 'ToolDisabled', tool: toolName });
      }

      const server = await deps.registry.getServer(serverId);
      if (!server) {
        return Result.err({ _tag: 'ToolNotFound', tool: toolName, server: serverId });
      }

      // 2. allowlist check
      const allowed = validateServerConfig(
        { name: server.name, command: server.command, args: server.args },
        deps.allowlist,
      );
      if (!allowed) {
        log.warn('server not in allowlist', { serverId, server: server.name });
        return Result.err({ _tag: 'ServerNotAllowed', server: serverId });
      }

      // 3. scoped token generation (audit trail)
      try {
        generateScopedToken(
          { serverId, permissions: [toolName], ttlSeconds: 300 },
          deps.signingKey,
        );
      } catch (err) {
        return Result.err({
          _tag: 'TokenGenerationError',
          message: err instanceof Error ? err.message : String(err),
        });
      }

      // 4. cache check
      let cacheKey: string | undefined;
      if (deps.cache && tool.cacheTtlSeconds) {
        cacheKey = normalizeCacheKey(serverId, toolName, input);
        try {
          const cached = await deps.cache.get(cacheKey);
          if (cached) {
            log.info('cache hit', { serverId, toolName });
            return Result.ok(JSON.parse(cached) as ToolCallResult);
          }
        } catch {
          // fail-open: cache miss on error
        }
      }

      // 5. rate limit
      const rateResult = await deps.rateLimiter.check(serverId);
      if (!rateResult.allowed) {
        log.warn('rate limit exceeded', { serverId });
        return Result.err({
          _tag: 'RateLimitExceeded',
          server: serverId,
          retryAfterMs: rateResult.retryAfterMs,
        });
      }

      // 6. circuit breaker + transport
      const breaker = deps.circuitBreakers.getBreaker(serverId);
      let callResult: ToolCallResult;
      try {
        callResult = await breaker.execute(async () => {
          const r = await deps.transport.callTool(toolName, input);
          if (!r.ok) {
            throw r.error;
          }
          return r.value;
        });
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          return Result.err({
            _tag: 'CircuitOpen',
            server: serverId,
            retryAfterMs: err.retryAfterMs,
          });
        }
        const msg = err instanceof Error ? err.message : JSON.stringify(err);
        return Result.err({ _tag: 'TransportError', tool: toolName, message: msg });
      }

      // 7. response size check (S1-W14)
      const responseBytes = Buffer.byteLength(JSON.stringify(callResult.content));
      if (responseBytes > tool.maxResponseBytes) {
        log.warn('response too large', { toolName, responseBytes, limit: tool.maxResponseBytes });
        return Result.err({
          _tag: 'ResponseTooLarge',
          tool: toolName,
          bytes: responseBytes,
          limit: tool.maxResponseBytes,
        });
      }

      // 8. cache save (fire-and-forget)
      if (deps.cache && cacheKey && tool.cacheTtlSeconds && !callResult.isError) {
        deps.cache.set(cacheKey, JSON.stringify(callResult), tool.cacheTtlSeconds).catch(() => {});
      }

      // 9. return
      log.info('tool call succeeded', { serverId, toolName, durationMs: callResult.durationMs });
      return Result.ok(callResult);
    },
  };
}
