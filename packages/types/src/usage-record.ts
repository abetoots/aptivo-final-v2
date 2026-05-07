/**
 * S18-C1b: canonical UsageRecord shape.
 *
 * One source of truth for the LLM-spend log row written by the
 * gateway and persisted by the database adapter. Previously
 * duplicated in `@aptivo/llm-gateway/src/usage/usage-logger.ts` and
 * `@aptivo/database/src/adapters/llm-usage-log-store-drizzle.ts`
 * with explicit "drift risk" comments — every gateway change had
 * to be mirrored manually into the database adapter.
 *
 * Why `@aptivo/types`: this is the boundary type that crosses the
 * gateway → store contract. It can't live in the gateway because
 * the database adapter must not depend on the gateway (architectural
 * layering: database is a leaf of domain packages). It can't live
 * in the database adapter because the gateway must not depend on
 * Drizzle. Putting it in `@aptivo/types` resolves both directions.
 *
 * Why `domain: string` (not the gateway's narrow `Domain` enum):
 * narrowing happens inside the gateway at the callsite that
 * constructs the record. The store sees the widened shape so it
 * doesn't need to import the gateway's enum. TypeScript allows
 * narrower-to-wider assignment so this is type-safe.
 */

export interface UsageRecord {
  workflowId?: string;
  workflowStepId?: string;
  /**
   * On-the-wire string. The gateway narrows to its `Domain` enum
   * internally; this widens for the store-side and other consumers.
   */
  domain: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  /**
   * Request type. `safety_inference` was added in LLM3-02 for the ML
   * injection classifier so its spend is attributed alongside
   * completion/embedding traffic. The DB column is varchar(50) with
   * no check constraint — this TS union is the source of truth.
   */
  requestType: 'completion' | 'embedding' | 'vision' | 'safety_inference';
  latencyMs: number;
  wasFallback: boolean;
  primaryProvider?: string;
  /**
   * S17-B1: department attribution. Stamped by the gateway from the
   * resolved actor (`ActorContext.departmentId`). When unset the row
   * goes in unstamped — the column on `llm_usage_logs` is nullable.
   */
  departmentId?: string;
}

/**
 * Store-side contract. The gateway's `UsageLogger` accepts an
 * implementation of this interface; the database adapter provides
 * one. Idempotent by request context (workflowId + workflowStepId
 * + provider + model + a timestamp; specific impls choose).
 */
export interface UsageStore {
  /** inserts a usage record (idempotent by request context) */
  insert(record: UsageRecord): Promise<void>;
}
