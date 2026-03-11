/**
 * @aptivo/mcp-layer — MCP security + resilience
 *
 * Provides environment sanitization, server allowlisting, and scoped tokens
 * (SP-06), supply-chain integrity (SP-13), plus circuit breaker composition
 * (SP-10) for the MCP subsystem.
 *
 * @see docs/06-sprints/sprint-0-technical-spikes.md
 */

export {
  sanitizeEnvForMcp,
  isBlockedEnvVar,
  validateServerConfig,
  generateScopedToken,
  verifyScopedToken,
  isExactVersion,
  validateVersionPinning,
  validateRegistryAllowlist,
  computeIntegrity,
  verifyIntegrity,
  toPurl,
  generateSbom,
  runPreDeployVerification,
} from './security/index.js';

export type {
  McpServerConfig,
  ScopedTokenOptions,
  ScopedTokenPayload,
  PinnedPackage,
  SbomEntry,
  Sbom,
  VerificationFailure,
  VerificationResult,
  PreDeployReport,
  PackageResolver,
} from './security/index.js';

export {
  CircuitBreaker,
  CircuitOpenError,
  DEFAULT_CIRCUIT_CONFIG,
  CircuitBreakerRegistry,
  classifyMcpError,
} from './resilience/index.js';

export type {
  CircuitState,
  CircuitBreakerConfig,
  ErrorClassification,
} from './resilience/index.js';

export { InMemoryTransportAdapter } from './transport/index.js';

export type {
  McpTransportAdapter,
  McpTransportError,
  ToolCallResult,
  ToolDefinition,
  InMemoryToolHandler,
  InMemoryToolConfig,
} from './transport/index.js';

export {
  InMemoryCacheStore,
  RedisCacheStore,
  normalizeCacheKey,
} from './cache/index.js';

export type {
  McpCacheStore,
  CacheRedisClient,
  RedisCacheStoreOptions,
} from './cache/index.js';

export {
  McpRateLimiter,
  InMemoryRateLimitStore,
} from './rate-limit/index.js';

export type {
  McpRateLimitStore,
  McpRateLimitState,
  McpRateLimiterConfig,
  RateLimitResult,
} from './rate-limit/index.js';

export { createMcpWrapper } from './wrapper/index.js';

export type {
  McpWrapper,
  McpWrapperDeps,
  McpWrapperLogger,
  McpError,
  ToolRegistry,
  McpServerRecord,
  McpToolRecord,
} from './wrapper/index.js';

export {
  createValidatedSender,
  MCP_EVENT_SCHEMAS,
} from './events/index.js';

export type {
  EventSender,
  EventSchemaMap,
  ValidatedEventSender,
  ValidatedSendError,
  ValidatedSenderLogger,
  McpEventName,
} from './events/index.js';

export {
  executeDeletionStep,
  executeDataDeletion,
} from './workflows/index.js';

export type {
  DeletionStep,
  DeletionCheckpoint,
  DeletionResult,
  DeletionDeps,
} from './workflows/index.js';
