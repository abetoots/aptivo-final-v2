/**
 * OBS-04: PII read audit trail
 * @task OBS-04
 * @frd FR-CORE-AUD-001 (PII access logging)
 * @guidelines §2.1 (Result types, factory pattern, fire-and-forget)
 *
 * middleware that emits audit events when PII fields are accessed
 * via read operations. resolves S2-W5 warning.
 */

import { Result } from '@aptivo/types';

// ---------------------------------------------------------------------------
// deps
// ---------------------------------------------------------------------------

export interface PiiReadAuditDeps {
  emit: (event: {
    action: string;
    actor: string;
    resource: { type: string; id: string };
    metadata: Record<string, unknown>;
  }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// pii field registry
// ---------------------------------------------------------------------------

export interface PiiFieldRegistry {
  getFields(resourceType: string): string[];
}

export const DEFAULT_PII_FIELDS: Record<string, string[]> = {
  candidate: ['email', 'phone', 'ssn', 'dateOfBirth', 'address'],
  employee: ['email', 'phone', 'ssn', 'salary', 'bankAccount'],
  contract: ['salary', 'benefits', 'personalTerms'],
};

export function createPiiFieldRegistry(overrides?: Record<string, string[]>): PiiFieldRegistry {
  const fields = { ...DEFAULT_PII_FIELDS, ...overrides };
  return {
    getFields(resourceType: string): string[] {
      return fields[resourceType] ?? [];
    },
  };
}

// ---------------------------------------------------------------------------
// pii read audit middleware factory
// ---------------------------------------------------------------------------

export function createPiiReadAuditMiddleware(deps: PiiReadAuditDeps) {
  const registry = createPiiFieldRegistry();

  return {
    /**
     * audit a single pii read operation.
     * intersects accessed fields with the pii registry — only emits
     * when at least one pii field was actually accessed.
     */
    async auditPiiRead(
      actor: string,
      resource: { type: string; id: string },
      accessedFields: string[],
    ): Promise<Result<void, { _tag: 'AuditEmitError'; cause: unknown }>> {
      try {
        // intersect accessed fields with pii registry
        const piiFields = registry.getFields(resource.type);
        const matchedFields = accessedFields.filter((f) => piiFields.includes(f));
        if (matchedFields.length === 0) return Result.ok(undefined); // no pii accessed

        await deps.emit({
          action: 'pii.read',
          actor,
          resource,
          metadata: { accessedFields: matchedFields },
        });
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({ _tag: 'AuditEmitError' as const, cause });
      }
    },

    /**
     * audit a bulk pii read (e.g. listing endpoints returning multiple records).
     * always emits — no field-level filtering for bulk reads.
     */
    async auditPiiReadBulk(
      actor: string,
      resourceType: string,
      recordCount: number,
    ): Promise<Result<void, { _tag: 'AuditEmitError'; cause: unknown }>> {
      try {
        await deps.emit({
          action: 'pii.read.bulk',
          actor,
          resource: { type: resourceType, id: 'bulk' },
          metadata: { recordCount },
        });
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({ _tag: 'AuditEmitError' as const, cause });
      }
    },

    /**
     * audit a pii data export operation (e.g. csv/json export of records).
     * always emits — captures format and record count for compliance tracking.
     */
    async auditPiiReadExport(
      actor: string,
      resourceType: string,
      recordCount: number,
      format: string,
    ): Promise<Result<void, { _tag: 'AuditEmitError'; cause: unknown }>> {
      try {
        await deps.emit({
          action: 'pii.read.export',
          actor,
          resource: { type: resourceType, id: 'export' },
          metadata: { recordCount, format },
        });
        return Result.ok(undefined);
      } catch (cause) {
        return Result.err({ _tag: 'AuditEmitError' as const, cause });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// hof: wraps an api handler to emit pii read audit after success
// ---------------------------------------------------------------------------

/**
 * higher-order function that wraps an api handler to automatically
 * emit pii read audit events after a successful response.
 * audit emission is fire-and-forget — failures never block the response.
 */
export function withPiiReadAudit(
  handler: (request: Request) => Promise<Response>,
  resourceType: string,
  piiFields: string[],
  auditMiddleware: ReturnType<typeof createPiiReadAuditMiddleware>,
  getActor: (request: Request) => string | null,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const response = await handler(request);
    // only audit successful reads
    if (response.ok) {
      const actor = getActor(request);
      if (actor) {
        // fire-and-forget audit emission
        auditMiddleware
          .auditPiiRead(actor, { type: resourceType, id: 'request' }, piiFields)
          .catch(() => {});
      }
    }
    return response;
  };
}
